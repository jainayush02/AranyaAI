const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DocArticle = require('../models/DocArticle');
const ActivityLog = require('../models/ActivityLog');
const cloudinary = require('cloudinary').v2;

// ── Cloudinary Config ─────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


// ── File Upload Config ──────────────────────────────────
const uploadDir = path.join(process.cwd(), 'src', 'server', 'uploads', 'videos');
try {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (err) {
    console.warn('⚠️ Warning: Could not create upload directory. This is expected on read-only environments like Vercel.');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safeName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) cb(null, true);
        else cb(new Error('Only video files are allowed'));
    }
});

// ── Auth Middleware ─────────────────────────────────────
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
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    next();
};

// ── Helper: Log Activity ────────────────────────────────
const logActivity = async (type, user, userId, detail) => {
    try { await ActivityLog.create({ type, user, userId, detail }); } catch { }
};

// ═══════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════

// GET all published docs (grouped by category)
router.get('/', async (req, res) => {
    try {
        const docs = await DocArticle.find({ published: true }).sort({ category: 1, order: 1 });
        // Group by category
        const grouped = {
            'getting-started': [],
            'features': [],
            'video-tutorials': []
        };
        docs.forEach(doc => { if (grouped[doc.category]) grouped[doc.category].push(doc); });
        res.json(grouped);
    } catch (err) {
        res.status(500).json({ message: 'Server error', err: err.message });
    }
});

// GET single doc by ID
router.get('/:id', async (req, res) => {
    try {
        const doc = await DocArticle.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Not found' });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ═══════════════════════════════════════════════════════
// ADMIN ROUTES (require auth + admin role)
// ═══════════════════════════════════════════════════════

// GET all docs for admin (including unpublished)
router.get('/admin/all', authenticate, adminOnly, async (req, res) => {
    try {
        const docs = await DocArticle.find().sort({ category: 1, order: 1 });
        res.json(docs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET Cloudinary Signature for direct upload
router.get('/admin/cloudinary-auth', authenticate, adminOnly, (req, res) => {
    try {
        const timestamp = Math.round((new Date()).getTime() / 1000);
        const paramsToSign = {
            timestamp: timestamp,
            folder: 'aranya-tutorials'
        };
        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            process.env.CLOUDINARY_API_SECRET
        );
        res.json({
            signature,
            timestamp,
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            folder: 'aranya-tutorials'
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to generate signature' });
    }
});

// POST create new article
router.post('/', authenticate, adminOnly, async (req, res) => {
    try {
        const { title, category, content, steps, order, published, videoUrl, videoTitle, cloudFileId } = req.body;
        const doc = await DocArticle.create({
            title, category, content, steps: steps || [],
            order: order || 0, published: published !== false,
            videoUrl: videoUrl || '',
            videoTitle: videoTitle || '',
            cloudFileId: cloudFileId || '',
            createdBy: req.user._id
        });
        await logActivity('doc', req.user.name || 'Admin', req.user._id, `Created doc article: "${title}"`);
        res.status(201).json(doc);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});


// PUT update article
router.put('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const oldDoc = await DocArticle.findById(req.params.id);
        if (!oldDoc) return res.status(404).json({ message: 'Not found' });

        // If a new video is being linked, and there's an old Cloudinary video, delete the old one to save space
        if (req.body.cloudFileId && oldDoc.cloudFileId && req.body.cloudFileId !== oldDoc.cloudFileId) {
            try {
                await cloudinary.uploader.destroy(oldDoc.cloudFileId, { resource_type: 'video' });
                console.log('✅ Cloudinary: Old file cleaned up during update');
            } catch (ikErr) {
                console.warn('⚠️ Cloudinary: Cleanup failed:', ikErr.message);
            }
        }

        const updateData = { ...req.body, updatedAt: new Date() };
        
        // Use findByIdAndUpdate but ensure we don't accidentally wipe out fields with null/undefined 
        // if they are not provided in a partial update (like the video-only update from Admin Portal)
        const doc = await DocArticle.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        await logActivity('doc', req.user.name || 'Admin', req.user._id, `Updated doc article: "${doc.title}"`);
        res.json(doc);
    } catch (err) {
        console.error('Update doc error:', err);
        res.status(400).json({ message: err.message });
    }
});



// DELETE article
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const doc = await DocArticle.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Not found' });

        // Delete local video file if it exists
        if (doc.videoUrl && doc.videoUrl.startsWith('/uploads')) {
            const filePath = path.join(__dirname, '..', doc.videoUrl);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch(e) { console.error('Failed to unlink local video:', e); }
            }
        }

        // Delete from Cloudinary if it exists
        if (doc.cloudFileId) {
            try {
                await cloudinary.uploader.destroy(doc.cloudFileId, { resource_type: 'video' });
                console.log('✅ Cloudinary: File deleted successfully during article removal');
            } catch (ikErr) {
                console.error('⚠️ Cloudinary: Deletion failed during article removal:', ikErr.message);
            }
        }

        await DocArticle.findByIdAndDelete(req.params.id);
        await logActivity('doc', req.user.name || 'Admin', req.user._id, `Deleted doc article: "${doc.title}"`);
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// POST upload video tutorial
router.post('/:id/upload-video', authenticate, adminOnly, upload.single('video'), async (req, res) => {
    // Disable local uploads on Vercel
    if (process.env.VERCEL) {
        return res.status(403).json({ message: 'Local uploads are disabled on Vercel. Please use the Admin Portal Cloud Upload feature.' });
    }
    try {
        if (!req.file) return res.status(400).json({ message: 'No video file provided' });
        const videoPath = `/uploads/videos/${req.file.filename}`;
        const doc = await DocArticle.findByIdAndUpdate(
            req.params.id,
            { videoUrl: videoPath, videoTitle: req.body.videoTitle || req.file.originalname },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Article not found' });
        await logActivity('doc', req.user.name || 'Admin', req.user._id, `Uploaded video to: "${doc.title}"`);
        res.json({ message: 'Video uploaded', doc });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE video from article
router.delete('/:id/video', authenticate, adminOnly, async (req, res) => {
    try {
        const doc = await DocArticle.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Not found' });

        // Only try to delete local file if it's a relative path starting with /uploads
        if (doc.videoUrl && doc.videoUrl.startsWith('/uploads')) {
            const filePath = path.join(__dirname, '..', doc.videoUrl);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        // Remote delete from Cloudinary if we have a fileId
        if (doc.cloudFileId) {
            try {
                await cloudinary.uploader.destroy(doc.cloudFileId, { resource_type: 'video' });
                console.log('✅ Cloudinary: File deleted successfully');
            } catch (ikErr) {
                console.error('⚠️ Cloudinary: Deletion failed or file already gone:', ikErr.message);
            }
        }

        doc.videoUrl = null;
        doc.videoTitle = null;
        doc.cloudFileId = null;
        await doc.save();

        res.json({ message: 'Video removed successfully', doc });
    } catch (err) {
        console.error('Delete video error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
