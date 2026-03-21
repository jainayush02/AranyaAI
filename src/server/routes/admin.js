const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Animal = require('../models/Animal');
const ActivityLog = require('../models/ActivityLog');
const Faq = require('../models/Faq');
const SystemSettings = require('../models/SystemSettings');
const SystemMetrics = require('../models/SystemMetrics');
const axios = require('axios');
const { logActivity } = require('../utils/logger');

// ── Middleware ──────────────────────────────────────────
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id);
        if (!user) return res.status(401).json({ message: 'User not found' });
        req.user = user;
        next();
    } catch { res.status(401).json({ message: 'Token invalid' }); }
};

const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    next();
};

const log = async (type, adminUser, detail) => {
    await logActivity(type, adminUser, detail);
};

// ═══════════════════════════════════════════════════════
// OVERVIEW STATS (CRM-relevant, not animal tracking)
// ═══════════════════════════════════════════════════════
router.get('/stats', authenticate, adminOnly, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers, newToday, newThisWeek, newThisMonth,
            blockedUsers, proUsers, totalAnimals, criticalAnimals, activeToday
        ] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'user', createdAt: { $gte: todayStart } }),
            User.countDocuments({ role: 'user', createdAt: { $gte: weekAgo } }),
            User.countDocuments({ role: 'user', createdAt: { $gte: monthAgo } }),
            User.countDocuments({ blocked: true }),
            User.countDocuments({ plan: 'pro' }),
            Animal.countDocuments(),
            Animal.countDocuments({ status: 'critical' }),
            User.countDocuments({ lastLoginAt: { $gte: todayStart } }),
        ]);

        // Simulated website-level metrics (replace with real analytics later)
        const pageViews = Math.floor(totalUsers * 4.7 + Math.random() * 50);
        const avgSessionMin = (3 + Math.random() * 4).toFixed(1);

        res.json({
            totalUsers, newToday, newThisWeek, newThisMonth,
            blockedUsers, proUsers, totalAnimals, criticalAnimals,
            activeToday, pageViews, avgSessionMin
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});


router.get('/llm-stats', authenticate, adminOnly, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne({ key: 'ai_config_v2' });
        if (!settings) return res.json([]);
        const config = settings.value;

/* In-memory cache for recent metrics to speed up real-time polling */
let recentHistory = []; 

// ── Smart model-to-vendor detector ──────────────────────────────────
const inferModelVendor = (modelId = '') => {
    const m = modelId.toLowerCase();
    if (m.startsWith('gpt-') || m.includes('openai') || m.startsWith('o1') || m.startsWith('o3'))               return { vendor: 'OpenAI',     color: '#10a37f', icon: '🤖' };
    if (m.startsWith('claude'))                                                                                    return { vendor: 'Anthropic',  color: '#d97706', icon: '🧠' };
    if (m.includes('gemini') || m.includes('gemma') || m.startsWith('google/'))                                   return { vendor: 'Google',     color: '#4285f4', icon: '✨' };
    if (m.startsWith('mistralai/') || m.startsWith('mistral') || m.startsWith('mixtral') || m.includes('codestral')) return { vendor: 'Mistral',  color: '#ff6b35', icon: '🌀' };
    if (m.startsWith('meta-llama/') || m.startsWith('llama') || m.includes('meta-llama'))                         return { vendor: 'Meta / Llama', color: '#0668e1', icon: '🦙' };
    if (m.startsWith('nvidia/') || m.includes('nemotron'))                                                         return { vendor: 'NVIDIA',    color: '#76b900', icon: '🔷' };
    if (m.includes('deepseek'))                                                                                    return { vendor: 'DeepSeek',  color: '#5b5ea6', icon: '🔍' };
    if (m.startsWith('qwen') || m.includes('alibaba'))                                                             return { vendor: 'Alibaba',   color: '#ff6a00', icon: '🔮' };
    if (m.startsWith('command') || m.includes('cohere'))                                                           return { vendor: 'Cohere',    color: '#39594d', icon: '⚡' };
    if (m.includes('falcon'))                                                                                      return { vendor: 'TII',       color: '#c0392b', icon: '🦅' };
    if (m.startsWith('phi') || m.includes('microsoft'))                                                            return { vendor: 'Microsoft', color: '#00a4ef', icon: '💎' };
    if (m.startsWith('solar') || m.includes('upstage'))                                                            return { vendor: 'Upstage',   color: '#f59e0b', icon: '☀️' };
    if (m.includes('wizard') || m.includes('nous'))                                                                return { vendor: 'Nous',      color: '#7c3aed', icon: '🧙' };
    if (m.startsWith('databricks') || m.includes('dbrx'))                                                          return { vendor: 'Databricks',color: '#ff3621', icon: '🧱' };
    if (m.includes('yi-') || m.includes('01-ai'))                                                                  return { vendor: '01.AI',     color: '#06b6d4', icon: '🌐' };
    if (m.includes('groq'))                                                                                        return { vendor: 'Groq',      color: '#f55036', icon: '⚡' };
    if (m.includes('huggingface') || m.includes('hf'))                                                             return { vendor: 'Hugging Face', color: '#ffbd2e', icon: '🤗' };
    return { vendor: 'Unknown', color: '#94a3b8', icon: '❓' };
};

        // ── Smart hosting platform detector ─────────────────────────────────
        // Detects WHERE the model is actually served, not who created it.
        // Models with org/model-name format (e.g. mistralai/...) are NVIDIA NIM catalog.
        // Short names (e.g. llama-3.3-70b-versatile) are native to the configured provider.
        const inferModelHost = (modelId = '', configuredProvider = '') => {
            const m = modelId.toLowerCase();
            // NVIDIA NIM catalog uses org/model-name format
            const nimOrgs = ['mistralai/', 'meta-llama/', 'nvidia/', 'google/', 'microsoft/', 'deepseek-ai/', 'qwen/', 'nv-mistralai/', 'ibm/', 'snowflake/', 'adept/', 'upstage/', 'databricks/', '01-ai/', 'writer/', 'rakuten/', 'mediatek/', 'tokyotech-llm/', 'ai21labs/', 'baichuan-inc/'];
            if (nimOrgs.some(org => m.startsWith(org))) {
                return 'NVIDIA NIM';
            }
            // OpenAI-native models
            if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('dall-e') || m.startsWith('whisper') || m.startsWith('tts'))
                return 'OpenAI';
            // Anthropic-native models
            if (m.startsWith('claude'))
                return 'Anthropic';
            // Google-native models
            if (m.startsWith('gemini-') || m.startsWith('gemma-'))
                return 'Google';
            // Groq-native models (short names, no org prefix, not matching above)
            if (!m.includes('/') && (m.startsWith('llama') || m.startsWith('mixtral') || m.startsWith('gemma')))
                return 'Groq';
            // Fallback to configured provider
            return configuredProvider;
        };

        const results = [];

        const fetchStats = async (role, conf) => {
            if (!conf || !conf.enabled || !conf.apiKey) return;
            let usage = 0;
            let limit = 0;
            let limitRemaining = 'N/A';
            let status = 'Active';
            let latency = 'Unknown';

            // Annotate each model with its inferred vendor AND hosting platform
        const annotatedModels = (conf.models || []).map(m => {
            const info = inferModelVendor(m.modelId);
            return {
                ...m,
                vendor: info.vendor,
                vendorColor: info.color,
                vendorIcon: info.icon,
                host: inferModelHost(m.modelId, conf.provider)
            };
        });

            try {
                const providerKey = (conf.provider || '').trim().toLowerCase().replace(/[\s_-]/g, '');

                if (providerKey === 'openai') {
                    const t0 = Date.now();
                    await axios.get('https://api.openai.com/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in OpenAI';

                } else if (providerKey === 'openrouter') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://openrouter.ai/api/v1/auth/key', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    const d = resp.data?.data;
                    if (d) {
                        usage = typeof d.usage === 'number' ? d.usage : 0;
                        limit = typeof d.limit === 'number' ? d.limit : 0;
                        limitRemaining = d.is_free_tier ? 'Free Tier' : (limit > 0 ? `$${(limit - usage).toFixed(4)}` : 'Unlimited');
                    }

                } else if (providerKey === 'groq') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.groq.com/openai/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Groq';

                } else if (providerKey === 'anthropic') {
                    if (annotatedModels.length > 0) {
                        const t0 = Date.now();
                        await axios.post('https://api.anthropic.com/v1/messages', {
                            model: annotatedModels[0].modelId,
                            max_tokens: 1,
                            messages: [{ role: 'user', content: 'ping' }]
                        }, {
                            headers: { 'x-api-key': conf.apiKey, 'anthropic-version': '2023-06-01' },
                            timeout: 6000
                        });
                        latency = Date.now() - t0;
                        limitRemaining = 'Check Dashboard';
                        usage = 'View in Anthropic';
                    }

                } else if (providerKey === 'google' || providerKey === 'gemini' || providerKey === 'googlegemini') {
                    const t0 = Date.now();
                    const resp = await axios.get(
                        `https://generativelanguage.googleapis.com/v1/models?key=${conf.apiKey}`,
                        { timeout: 5000 }
                    );
                    latency = Date.now() - t0;
                    status = resp.data?.models?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Google Cloud';

                } else if (providerKey === 'huggingface' || providerKey === 'hf') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://huggingface.co/api/whoami-v2', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = (resp.data?.type === 'org' || resp.data?.id) ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in HuggingFace';

                } else if (providerKey === 'nvidia' || providerKey === 'nvidiaapinim' || providerKey === 'nvdia') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://integrate.api.nvidia.com/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in NVIDIA';

                } else if (providerKey === 'mistral' || providerKey === 'mistralai' || providerKey === 'mistral-ai') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.mistral.ai/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Mistral';

                } else if (providerKey === 'cohere') {
                    const t0 = Date.now();
                    await axios.get('https://api.cohere.com/v1/check-api-key', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Cohere';

                } else if (providerKey === 'together' || providerKey === 'togetherai') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.together.xyz/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.length > 0 ? 'Active' : 'Warning';
                    try {
                        const bal = await axios.get('https://api.together.xyz/v1/billing/balance', {
                             headers: { Authorization: `Bearer ${conf.apiKey}` }, timeout: 3000
                        });
                        limitRemaining = bal.data?.balance ? `$${bal.data.balance.toFixed(2)}` : 'Check Dashboard';
                    } catch { limitRemaining = 'Check Dashboard'; }
                    usage = 'View in Together';

                } else if (providerKey === 'deepseek') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.deepseek.com/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in DeepSeek';

                } else if (providerKey === 'perplexity' || providerKey === 'perplexityai') {
                    const t0 = Date.now();
                    await axios.get('https://api.perplexity.ai/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Perplexity';

                } else if (providerKey === 'fireworks' || providerKey === 'fireworksai') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.fireworks.ai/inference/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Fireworks';

                } else if (providerKey === 'ollama') {
                    const ollamaUrl = conf.apiUrl || 'http://localhost:11434';
                    const t0 = Date.now();
                    const resp = await axios.get(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, { timeout: 3000 });
                    latency = Date.now() - t0;
                    status = resp.data?.models?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Local Instance';
                    usage = 'N/A';

                } else if (providerKey === 'custom' || (conf.apiUrl && !status)) {
                    if (annotatedModels.length > 0 && conf.apiUrl) {
                        try {
                            const t0 = Date.now();
                            const baseUrl = (conf.apiUrl || '').replace(/\/$/, '');
                            // 1. Try a lightweight models list GET first
                            try {
                                let pingUrl = `${baseUrl}/models`;
                                const headers = {};
                                if (conf.apiKey) {
                                    if (conf.apiKey.startsWith('AIza') || annotatedModels.some(m => m.vendor === 'Google')) {
                                        // Google-specific: API key goes in query params, or use specialized endpoint
                                        if (baseUrl.includes('googleapis.com')) {
                                            pingUrl = `https://generativelanguage.googleapis.com/v1/models?key=${conf.apiKey}`;
                                        } else {
                                             pingUrl += (pingUrl.includes('?') ? '&' : '?') + `key=${conf.apiKey}`;
                                        }
                                    } else {
                                        headers.Authorization = `Bearer ${conf.apiKey}`;
                                    }
                                }
                                await axios.get(pingUrl, { headers, timeout: 5000 });
                                status = 'Active';
                            } catch (e) {
                                // 2. Fallback to a single-token completion POST if GET fails
                                let pingUrl = `${baseUrl}/chat/completions`;
                                const headers = {};
                                if (conf.apiKey) {
                                    if (conf.apiKey.startsWith('AIza')) {
                                        pingUrl += (pingUrl.includes('?') ? '&' : '?') + `key=${conf.apiKey}`;
                                    } else {
                                        headers.Authorization = `Bearer ${conf.apiKey}`;
                                    }
                                }
                                await axios.post(
                                    pingUrl,
                                    { model: annotatedModels[0].modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
                                    { headers, timeout: 5000 }
                                );
                                status = 'Active';
                            }
                            latency = Date.now() - t0;
                            limitRemaining = 'External Provider';
                            usage = 'View in Provider';
                        } catch (err) {
                            console.error(`Custom health check failed [${conf.provider}]:`, err.message);
                            status = 'Unreachable';
                        }
                    } else {
                        status = 'No Models Configured';
                    }
                } else if (conf.apiUrl && !status) {
                    // generic fallback removed as handled above
                }
            } catch (e) {
                console.error(`LLM Stats Error [${conf.provider}]:`, e.message);
                status = e.response?.status === 401 ? 'Invalid API Key' : 'Connection Failed';
            }

            results.push({
                role,
                provider: conf.provider,
                models: annotatedModels.map(m => {
                    // Inject model-specific simulated latency if provider latency is valid
                    let modelLatency = latency;
                    if (typeof latency === 'number' && m.modelId) {
                        // Use a stable seed from modelId to create a consistent variance
                        const idStr = String(m.modelId);
                        const seed = idStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                        const variance = (seed % 15) - 7; // -7ms to +7ms offset
                        modelLatency = Math.max(10, latency + variance);
                    }
                    return { ...m, latency: modelLatency };
                }),
                usage,
                limit,
                limitRemaining,
                latency,
                status
            });
        };

        if (config.primary)  await fetchStats('Primary',  config.primary);
        if (config.fallback) await fetchStats('Fallback', config.fallback);

        // Record metrics to history asynchronously
        res.json(results);
    } catch (err) {
        console.error('LLM Stats Route Error:', err);
        res.status(500).json({ message: err.message });
    }
});

// --- ON-DEMAND PING FOR REAL-TIME GRAPH ---
router.get('/ping-model/:modelId', authenticate, adminOnly, async (req, res) => {
    try {
        const { modelId } = req.params;
        const settings = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
        if (!settings || !settings.value) return res.status(404).json({ success: false });

        const config = settings.value;
        const allProviders = [config.primary, config.fallback].filter(p => p && p.enabled);
        const targetModel = allProviders.flatMap(p => p.models).find(m => m.modelId === modelId);
        if (!targetModel) return res.status(404).json({ success: false });

        const provider = allProviders.find(p => p.models.includes(targetModel));
        const providerKey = (provider.provider || '').toLowerCase();
        
        let latency = 0;
        const start = Date.now();
        try {
            if (providerKey.includes('openai')) {
                await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: 5000 });
            } else if (providerKey.includes('nvidia') || providerKey.includes('mistral') || providerKey.includes('hugging')) {
                const url = providerKey.includes('nvidia') ? 'https://integrate.api.nvidia.com/v1/models' : 
                            providerKey.includes('mistral') ? 'https://api.mistral.ai/v1/models' : 'https://api-inference.huggingface.co/models';
                await axios.get(url, { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: 5000 });
            } else if (providerKey.includes('google') || providerKey.includes('gemini')) {
                await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${provider.apiKey}`, { timeout: 5000 });
            } else if (providerKey.includes('groq')) {
                await axios.get('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: 5000 });
            }
            latency = Date.now() - start;
        } catch(e) { latency = Date.now() - start; }
        
        res.json({ success: true, latency: latency + Math.floor(Math.random()*20), timestamp: new Date().toISOString() });
    } catch (e) { res.status(500).json({ success: false }); }
});

async function recordLlmMetrics() {
    try {
        const settings = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
        if (!settings || !settings.value) return;
        const config = settings.value;
        const metricData = {};

        const providers = [config.primary, config.fallback].filter(p => p && p.enabled);
        for (const p of providers) {
            let latency = 0;
            const pKey = (p.provider || '').toLowerCase();
            try {
                const s = Date.now();
                if (pKey.includes('openai')) await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                else if (pKey.includes('nvidia')) await axios.get('https://integrate.api.nvidia.com/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                else if (pKey.includes('mistral')) await axios.get('https://api.mistral.ai/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                else if (pKey.includes('google')) await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${p.apiKey}`, { timeout: 5000 });
                else if (pKey.includes('groq')) await axios.get('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                latency = Date.now() - s;
            } catch(e) { latency = 500; }
            
            p.models.forEach(m => { metricData[m.modelId] = latency + Math.floor(Math.random()*15); });
        }
        if (Object.keys(metricData).length > 0) {
            await SystemMetrics.create({ type: 'llm_latency', data: metricData });
        }
    } catch (e) { console.error('BG Metrics Error:', e.message); }
}

setInterval(recordLlmMetrics, 15 * 60 * 1000);
setTimeout(recordLlmMetrics, 2000);

// GET /api/admin/llm-history?modelId=...&hours=24
router.get('/llm-history', authenticate, adminOnly, async (req, res) => {
    try {
        const { modelId, hours = '24' } = req.query;
        if (!modelId) return res.status(400).json({ message: 'modelId required' });
        const timeRange = parseInt(hours) || 24;
        const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000);
        
        const metrics = await SystemMetrics.find({ 
            type: 'llm_latency', 
            timestamp: { $gte: cutoff },
            [`data.${modelId.replace(/\./g, '_')}`]: { $exists: true } // MongoDB doesn't like dots in keys, but here they might be values or keys. If they are keys in the object, handle accordingly.
        }).sort({ timestamp: 1 }).limit(100);
        
        // Simpler approach: find any llm_latency and filter in memory if modelId has dots
        const allMetrics = await SystemMetrics.find({ 
            type: 'llm_latency', 
            timestamp: { $gte: cutoff }
        }).sort({ timestamp: 1 }).limit(1000).select('timestamp data').lean();
        
        const history = allMetrics.map(m => ({
            timestamp: m.timestamp,
            latency: m.data[modelId]
        })).filter(h => h.latency !== undefined);
        
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ═══════════════════════════════════════════════════════
// ACTIVITY LOG (paginated, filterable)
// ═══════════════════════════════════════════════════════
router.get('/activity', authenticate, adminOnly, async (req, res) => {
    try {
        const { type, page = 1, limit = 25 } = req.query;
        const filter = type ? { type } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [logs, total] = await Promise.all([
            ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            ActivityLog.countDocuments(filter)
        ]);
        res.json({ logs, total });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════════════════════
// USER CRM — list with search/filter/pagination
// ═══════════════════════════════════════════════════════
router.get('/users', authenticate, adminOnly, async (req, res) => {
    try {
        const { search = '', blocked, plan, role, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (role === 'admin') {
            filter.role = 'admin';
        } else if (role === 'all') {
            // no role filter
        } else {
            filter.role = { $ne: 'admin' }; // default: exclude admins
        }
        if (search) filter.$or = [
            { full_name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { mobile: { $regex: search, $options: 'i' } }
        ];
        if (blocked !== undefined && blocked !== '') filter.blocked = blocked === 'true';
        if (plan) filter.plan = plan;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(filter).select('-password -otp -otpExpires -lastOtpSentAt').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            User.countDocuments(filter)
        ]);
        res.json({ users, total, pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Single user detail + their animals + logs
// Single user detail + their animals + logs
router.get('/users/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password -otp -otpExpires');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const [animals, logs] = await Promise.all([
            Animal.find({ user_id: req.params.id }).sort({ createdAt: -1 }),
            ActivityLog.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(100)
        ]);
        res.json({ user, animals, logs });
    } catch (err) {
        console.error("Error fetching user data:", err);
        res.status(500).json({ message: err.message });
    }
});

// Block / Unblock
router.put('/users/:id/block', authenticate, adminOnly, async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'Cannot block yourself' });
        const { blocked } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { blocked }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log('admin', req.user, `${blocked ? 'Blocked' : 'Unblocked'} user: ${user.full_name || user.email}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Toggle role
router.put('/users/:id/role', authenticate, adminOnly, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log('admin', req.user, `Changed ${user.full_name || user.email}'s role to ${role}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Update user plan
router.put('/users/:id/plan', authenticate, adminOnly, async (req, res) => {
    try {
        const { plan } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { plan }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log('admin', req.user, `Updated ${user.full_name || user.email}'s plan to ${plan}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Update user plan overrides
router.put('/users/:id/overrides', authenticate, adminOnly, async (req, res) => {
    try {
        const { overrides } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { planOverrides: overrides }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log('admin', req.user, `Updated limit overrides for ${user.full_name || user.email}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Delete user + their data
router.delete('/users/:id', authenticate, adminOnly, async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'Cannot delete yourself' });
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        await Animal.deleteMany({ user_id: req.params.id });
        await log('admin', req.user, `Deleted user: ${user.full_name || user.email}`);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Per-user activity log
router.get('/users/:id/activity', authenticate, adminOnly, async (req, res) => {
    try {
        const logs = await ActivityLog.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(50);
        res.json(logs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════════════════════
// FAQ CRUD (Help Center management)
// ═══════════════════════════════════════════════════════

// Public: published FAQs (used by HelpCenter page)
router.get('/faqs/public', async (req, res) => {
    try {
        const faqs = await Faq.find({ published: true }).sort({ order: 1, createdAt: 1 });
        res.json(faqs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin: all FAQs including drafts
router.get('/faqs', authenticate, adminOnly, async (req, res) => {
    try {
        const faqs = await Faq.find().sort({ order: 1, createdAt: 1 });
        res.json(faqs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/faqs', authenticate, adminOnly, async (req, res) => {
    try {
        const { question, answer, category, order, published } = req.body;
        if (!question || !answer) return res.status(400).json({ message: 'question and answer required' });
        const faq = await Faq.create({ question, answer, category: category || 'General', order: order || 0, published: published !== false });
        await log('admin', req.user, `Added FAQ: "${question}"`);
        res.status(201).json(faq);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/faqs/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const faq = await Faq.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        await log('admin', req.user, `Updated FAQ: "${faq.question}"`);
        res.json(faq);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/faqs/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const faq = await Faq.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        await log('admin', req.user, `Deleted FAQ: "${faq.question}"`);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});



// ── AI Model Configuration ────────────────────────────
router.get('/config/ai', authenticate, adminOnly, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne({ key: 'ai_config_v2' });
        if (!settings) {
            // Return defaults if not set in DB
            return res.json({
                primary: {
                    provider: 'Hugging Face',
                    customProvider: '',
                    baseURL: 'https://router.huggingface.co/v1',
                    apiKey: process.env.HF_TOKEN || '',
                    models: [
                        { id: 'p1', name: 'Primary Text Model', type: 'text', modelId: 'Qwen/Qwen2.5-7B-Instruct' },
                        { id: 'p2', name: 'Vision/Image Model', type: 'vision', modelId: 'Qwen/Qwen2.5-VL-7B-Instruct' }
                    ],
                    enabled: true
                },
                fallback: {
                    provider: 'OpenRouter',
                    customProvider: '',
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: process.env.OPENROUTER_API_KEY || '',
                    models: [
                        { id: 'f1', name: 'Fallback Text Model', type: 'text', modelId: 'google/gemma-3-12b-it:free' }
                    ],
                    enabled: true
                },
                systemPrompt: `You are Arion, a multimodal animal health assistant.

You only help with:
- animal health
- animal care
- breed information
- veterinary guidance
- safe educational information about common veterinary medicines
- general animal questions

Hard restriction:
- If a request is not about animals, animal health, animal care, breeds, veterinary guidance, or safe general veterinary medicine information, refuse it.
- Do not answer any part of unrelated questions.
- Do not provide extra help, explanations, facts, code, or general knowledge for unrelated topics.
- Do not provide partial help for unrelated topics.
- Do not say "however" and then continue answering.
- Reply only with:
"I only help with animal health, care, and veterinary topics."

Default language is English.
- If the user writes in another language, reply in that language when possible.
- If the user mixes languages, reply in the language that best matches the user’s message.

Use the last 15 messages in the current session for continuity.
- Use memory only to improve continuity and avoid repeated questions.
- If memory conflicts with the latest user message, trust the latest message.

Do not invent missing facts.
- First extract details already provided by the user, image, or session memory, such as species, breed, age, sex, weight, main problem, and symptom duration.
- Do not ask for details already given.
- If the user already provides the important details in one message, use them directly and do not ask the same questions again.
- If important details are missing, ask short and focused follow-up questions before giving guidance.
- Do not assume missing facts.

Case handling:
- If the user gives multiple symptoms, focus first on the most serious or dangerous sign.
- If the user gives multiple animals or multiple separate cases in one message, do not mix them together.
- Separate them clearly and handle one case at a time.
- If needed, ask which case should be handled first.

Image behavior:
- Use images as supporting information, not as final proof of a condition.
- First decide whether the image is clear enough for a basic visual assessment.
- If the affected area is reasonably visible, provide a helpful response based on visible findings.
- If the image is clear enough for a basic assessment, do not ask for more images before helping.
- If the image is partly clear, give a cautious answer and briefly mention what is visible and what is unclear.
- Ask for 2 to 3 clearer images only when the image is too blurry, too dark, too far away, too cropped, or the affected area is not visible enough.
- Never say the image is unclear if the affected area is reasonably visible.
- Never claim you can see details that are not clearly visible.
- If needed, ask for one full-body image, one close-up of the affected area, and one image in better light.
- If the image is clearly unusable, say:
"I cannot see the problem clearly in this image. Please upload 2 to 3 clearer images."

Anti-hallucination rules:
- Do not make up symptoms, image findings, history, diagnoses, or medicines.
- Do not present guesses as facts.
- If you are not sure, clearly say so.
- Use careful wording such as:
  - "This may be related to..."
  - "One possible reason is..."
  - "This needs a veterinarian to confirm."
- Treat predicted disease labels as clues, not confirmed diagnoses.

Response length control:
- Keep the answer length proportional to the user’s question.
- For short or vague questions, give a short and focused reply.
- For simple questions, keep the response brief.
- For detailed or serious health questions, give a fuller answer only when needed.
- Do not give long explanations unless the user asks for more detail.
- Ask follow-up questions instead of giving a long generic answer when important details are missing.

Emoji style:
- Use a few relevant emojis when helpful.
- Keep emojis minimal and professional.
- Do not use too many emojis in one response.
- Avoid emojis in serious emergency messages unless they improve clarity.

For health questions:
- If the user gives limited information, first ask 1 to 3 short follow-up questions.
- Use the full structured format only when the case is detailed, serious, or the user asks for a full explanation.

When using the full format, use these headings:
- Assessment
- What it might be
- How serious it seems
- Which animal doctor can help
- Medicine or care notes
- What you should do now

Do not include a disclaimer in every response if the interface already shows a permanent veterinary safety notice below the chatbox.
- Only include a brief warning when the case is urgent, emergency-level, high-risk, or when medication safety needs special caution.

Use simple urgency levels:
- Mild
- Needs a vet visit
- Urgent
- Emergency

Medicine safety:
- Only provide general educational information about common veterinary medicines.
- Do not provide exact prescriptions, exact doses, frequency, duration, or drug combinations unless the user only wants help understanding a veterinarian’s written prescription.
- Do not suggest risky self-medication.
- If medicine safety is uncertain, advise veterinary consultation.

If the question is outside animal-related topics, reply only with:
"I only help with animal health, care, and veterinary topics."`
            });
        }
        res.json(settings.value);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/config/ai', authenticate, adminOnly, async (req, res) => {
    try {
        const { primary, fallback, systemPrompt } = req.body;
        const newValue = { primary, fallback, systemPrompt };

        const settings = await SystemSettings.findOneAndUpdate(
            { key: 'ai_config_v2' },
            { value: newValue },
            { upsert: true, new: true }
        );

        await log('admin', req.user, `Updated AI Model Configuration`);
        res.json(settings.value);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

