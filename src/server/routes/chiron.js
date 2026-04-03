const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ChironDocument = require('../models/ChironDocument');
const SystemSettings = require('../models/SystemSettings');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');

// Dynamic Alignment State
let pineconeIndex = null;
let pineconeClient = null;
let DETECTED_DIMENSION = 1536;
let PHYSICAL_HOST = 'Discovering...';

const os = require('os');
const RECOVERY_DIR = process.env.VERCEL 
    ? path.join(os.tmpdir(), 'chiron-recovery')
    : path.join(__dirname, '../storage/recovery');

try {
    if (!fs.existsSync(RECOVERY_DIR)) fs.mkdirSync(RECOVERY_DIR, { recursive: true });
} catch (err) {
    console.warn('[Chiron] Recovery storage initialization skipped (Read-only environment)');
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

async function initPinecone() {
    try {
        const pineconeKey = process.env.PINECONE_API_KEY;
        if (!pineconeKey) return false;

        pineconeClient = new Pinecone({ apiKey: pineconeKey });

        // 1. Describe Index (High-Level Metadata)
        const meta = await pineconeClient.describeIndex('chiron');
        DETECTED_DIMENSION = meta.dimension;
        PHYSICAL_HOST = meta.host;

        // 2. Target the physical host discovered by the SDK
        console.log(`[Chiron] ALIGNED: Index "chiron" correctly found at ${PHYSICAL_HOST} (${DETECTED_DIMENSION}d)`);
        pineconeIndex = pineconeClient.index('chiron', PHYSICAL_HOST);

        // 3. Final Verification (Internal Stats)
        const stats = await pineconeIndex.describeIndexStats();
        console.log(`[Chiron] Ready -> ${stats.totalRecordCount} vectors physically present.`);
        return true;
    } catch (err) {
        console.error('[Chiron] Handshake Critical Fail:', err.message);
        pineconeIndex = null;
        return false;
    }
}
initPinecone();

async function getEmbeddingConfig() {
    const s = await SystemSettings.findOne({ key: 'ai_config_v2' });
    const c = s?.value?.chiron;

    if (!c || !c.enabled) {
        throw new Error('Vector Intelligence Engine is disabled. Please enable it in the Aranya Admin Portal.');
    }

    if (!c.apiKey || !c.baseUrl || !c.model) {
        throw new Error('Vector Networking Unconfigured! No hardcoded fallbacks are permitted. Please provide the Provider API Key, Base URL, and Model ID in the Admin Portal.');
    }

    return {
        provider: c.provider.toLowerCase(),
        baseUrl: c.baseUrl,
        model: c.model,
        apiKey: c.apiKey,
        chunkSize: parseInt(c.chunkSize) || 450,
        overlap: parseInt(c.overlap) || 70,
        dimensions: parseInt(c.dimensions) || DETECTED_DIMENSION
    };
}

async function generateEmbedding(text, config) {
    try {
        const response = await axios.post(`${config.baseUrl}/${config.model}:embedContent?key=${config.apiKey}`, {
            content: { parts: [{ text }] },
            outputDimensionality: config.dimensions
        });
        return response.data.embedding.values;
    } catch (err) {
        throw new Error(`Alignment Error: ${err.message}`);
    }
}

async function generateEmbeddingsBatch(chunks, config) {
    try {
        const response = await axios.post(`${config.baseUrl}/${config.model}:batchEmbedContents?key=${config.apiKey}`, {
            requests: chunks.map(text => ({
                model: `models/${config.model}`,
                content: { parts: [{ text }] },
                outputDimensionality: config.dimensions
            }))
        });
        return response.data.embeddings.map(e => e.values);
    } catch (err) {
        throw new Error(`Alignment Error: ${err.message}`);
    }
}

function chunkText(text, sz = 500, ov = 50) {
    const w = text.split(/\s+/);
    const c = [];
    const step = Math.max(1, sz - ov);
    for (let i = 0; i < w.length; i += step) c.push(w.slice(i, i + sz).join(' '));
    return c.filter(x => x).map(x => x.trim()).filter(x => x.length > 0);
}

// ── UTILITY: KNOWLEDGE SEARCH (USED BY chat.js) ──
async function searchKnowledge(query, topK = 5) {
    try {
        if (!pineconeIndex) await initPinecone();
        if (!pineconeIndex) return [];

        const config = await getEmbeddingConfig();
        const vector = await generateEmbedding(query, config);

        console.log(`[Chiron Search] Querying ${PHYSICAL_HOST} | TopK: ${topK}`);
        const results = await pineconeIndex.query({
            vector,
            topK: parseInt(topK) || 5,
            includeMetadata: true
        });

        return results.matches.map(m => ({
            text: m.metadata.text,
            source: m.metadata.source,
            score: m.score,
            document_id: m.metadata.document_id
        }));
    } catch (err) {
        console.error('[Chiron Search] Failure:', err.message);
        return [];
    }
}

async function runIngestStream(res, doc, buf, displayName) {
    const pulse = (d) => { res.write(`data: ${JSON.stringify(d)}\n\n`); if (res.flush) res.flush(); };
    pulse({ status: 'Processing File...', percent: 5 });

    let aborted = false;
    res.on('close', () => {
        console.log(`[Chiron] Client Disconnected. Terminating for ${displayName}`);
        aborted = true;
    });

    try {
        const ext = doc.file_type.toLowerCase();
        let text = '';
        if (ext === 'pdf') { const d = await pdfParse(buf); text = d.text; }
        else if (ext === 'docx') { text = (await mammoth.extractRawText({ buffer: buf })).value; }
        else {
            let str = buf.toString('utf8');
            if (str.includes('<html') || str.includes('<!DOCTYPE') || str.includes('<!doctype')) {
                str = str.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
                         .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                         .replace(/<[^>]+>/g, ' ')
                         .replace(/&nbsp;/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
            }
            text = str;
        }

        // FORCE ALIGNMENT CHECK
        pulse({ status: `Synchronizing with ${DETECTED_DIMENSION}d Index...`, percent: 10 });
        const ready = await initPinecone();
        if (!ready) throw new Error('Vector Engine (Pinecone) Handshake Rejection');

        const config = await getEmbeddingConfig();
        const chunks = chunkText(text, config.chunkSize, config.overlap);

        const vectors = [];
        const BATCH_SIZE = 50; 
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            if (aborted) {
                console.log(`[Chiron] ABORTED: Stopping at segment ${i}/${chunks.length}`);
                return;
            }
            const batchChunks = chunks.slice(i, i + BATCH_SIZE);
            const batchValues = await generateEmbeddingsBatch(batchChunks, config);
            
            for (let j = 0; j < batchChunks.length; j++) {
                vectors.push({
                    id: `${doc._id}_${i + j}`,
                    values: batchValues[j],
                    metadata: { document_id: doc._id.toString(), text: batchChunks[j].slice(0, 5000), source: displayName }
                });
            }
            const processed = Math.min(i + BATCH_SIZE, chunks.length);
            pulse({ status: `Vectorizing Batch ${processed}/${chunks.length}`, percent: Math.round(15 + (processed / chunks.length) * 80) });
            if (processed < chunks.length) await new Promise(r => setTimeout(r, 4500)); // 4.5s delay to adhere to Gemini Free Tier (15 RPM limits)
        }

        if (aborted) return;

        console.log(`[Chiron] Handing off ${vectors.length} vectors to ${PHYSICAL_HOST}...`);
        await pineconeIndex.upsert(vectors);

        await ChironDocument.findByIdAndUpdate(doc._id, {
            status: 'complete',
            chunks_count: chunks.length,
            vector_db_refs: vectors.map(v => v.id)
        });

        pulse({ status: 'Discovery Complete', percent: 100 });
        res.end();
    } catch (err) {
        if (!aborted) {
            console.error('[Chiron CRITICAL ERROR]', err);
            await ChironDocument.findByIdAndUpdate(doc._id, { status: 'failed', error_message: err.message });
            pulse({ status: 'Engine Desync Error', error: err.message, percent: 0 });
        }
        res.end();
    }
}

router.post('/ingest', [auth, upload.single('file')], async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ msg: 'No file' });
        const doc = new ChironDocument({ user_id: req.user.id, document_name: req.file.originalname, original_filename: req.file.originalname, file_type: req.file.originalname.split('.').pop().toLowerCase(), file_size_kb: Math.ceil(req.file.size / 1024), status: 'pending' });
        await doc.save();
        // File saving disabled per user request to prevent github/vercel syncing
        res.setHeader('Content-Type', 'text/event-stream');
        await runIngestStream(res, doc, req.file.buffer, req.file.originalname);
    } catch (e) { res.status(500).json({ msg: 'Ingest Failed' }); }
});

router.post('/ingest-url', auth, async (req, res) => {
    try {
        const { url, name } = req.body;
        const fetch = await axios.get(url, { 
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        const buf = Buffer.from(fetch.data);
        const fname = name || url.split('/').pop() || 'web_resource';
        const doc = new ChironDocument({ user_id: req.user.id, document_name: fname, original_filename: fname, file_type: url.includes('.pdf') ? 'pdf' : 'txt', file_size_kb: Math.ceil(buf.length / 1024), status: 'pending' });
        await doc.save();
        // File saving disabled
        res.setHeader('Content-Type', 'text/event-stream');
        await runIngestStream(res, doc, buf, fname);
    } catch (e) { 
        console.error('[URL Ingest Error]', e.message);
        res.status(500).json({ msg: 'URL Fetch Failed', error: e.message }); 
    }
});

router.post('/sync/:id', auth, async (req, res) => {
    const doc = await ChironDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ msg: 'Document not found' });
    
    // Recovery disabled
    const reqFile = path.join(RECOVERY_DIR, `${doc._id}.${doc.file_type}`);
    if (!fs.existsSync(RECOVERY_DIR) || !fs.existsSync(reqFile)) {
        res.status(404).json({ msg: 'Local recovery file is missing/disabled' });
        return;
    }
    const buf = fs.readFileSync(reqFile);
    res.setHeader('Content-Type', 'text/event-stream');
    await runIngestStream(res, doc, buf, doc.document_name);
});

router.delete('/purge', auth, async (req, res) => {
    try {
        console.log('[Chiron] Wiping Physical Index...');
        if (!pineconeIndex) await initPinecone();
        if (pineconeIndex) {
            await pineconeIndex.deleteAll();
        }

        await ChironDocument.deleteMany({});
        if (fs.existsSync(RECOVERY_DIR)) {
            const files = fs.readdirSync(RECOVERY_DIR);
            for (const file of files) fs.unlinkSync(path.join(RECOVERY_DIR, file));
        }

        console.log('✅ Chiron: Memory and Database Cleared');
        res.json({ msg: 'Purged' });
    } catch (err) {
        console.error('❌ Purge Failed:', err.message);
        res.status(500).json({ msg: 'Purge Failed', error: err.message });
    }
});

router.get('/stats', auth, async (req, res) => {
    const docs = await ChironDocument.countDocuments();
    let vectors = 0;
    if (pineconeIndex) try { vectors = (await pineconeIndex.describeIndexStats()).totalRecordCount; } catch (e) { }
    res.json({ documents: docs, vectorDbStats: { vectors }, dimensions: DETECTED_DIMENSION, host: PHYSICAL_HOST });
});

router.get('/documents', auth, async (req, res) => res.json(await ChironDocument.find().sort({ uploaded_at: -1 })));

router.delete('/documents/:id', auth, async (req, res) => {
    try {
        const doc = await ChironDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ msg: 'Doc not found' });

        // CLEAN VECTORS
        if (doc.vector_db_refs?.length > 0 && pineconeIndex) {
            console.log(`[Chiron] Purging ${doc.vector_db_refs.length} vectors for ${doc.document_name}`);
            try { await pineconeIndex.deleteMany(doc.vector_db_refs); } catch (e) { console.warn('Vector Delete Fail', e.message); }
        }

        // CLEAN FILES
        const fPath = path.join(RECOVERY_DIR, `${doc._id}.${doc.file_type}`);
        if (fs.existsSync(RECOVERY_DIR) && fs.existsSync(fPath)) fs.unlinkSync(fPath);

        await ChironDocument.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Deleted' });
    } catch (e) { res.status(500).json({ msg: 'Delet Failed' }); }
});


module.exports = {
    router,
    searchKnowledge
};
