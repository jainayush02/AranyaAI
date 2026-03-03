const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DocArticle = require('../models/DocArticle');
const ActivityLog = require('../models/ActivityLog');

// ── File Upload Config ──────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'videos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
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

// POST create new article
router.post('/', authenticate, adminOnly, async (req, res) => {
    try {
        const { title, category, content, steps, order, published } = req.body;
        const doc = await DocArticle.create({
            title, category, content, steps: steps || [],
            order: order || 0, published: published !== false,
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
        const { title, category, content, steps, order, published } = req.body;
        const doc = await DocArticle.findByIdAndUpdate(
            req.params.id,
            { title, category, content, steps, order, published, updatedAt: new Date() },
            { new: true }
        );
        if (!doc) return res.status(404).json({ message: 'Not found' });
        await logActivity('doc', req.user.name || 'Admin', req.user._id, `Updated doc article: "${title}"`);
        res.json(doc);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE article
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const doc = await DocArticle.findByIdAndDelete(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Not found' });
        // Delete video file if exists
        if (doc.videoUrl) {
            const filePath = path.join(__dirname, '..', doc.videoUrl);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await logActivity('doc', req.user.name || 'Admin', req.user._id, `Deleted doc article: "${doc.title}"`);
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST upload video tutorial
router.post('/:id/upload-video', authenticate, adminOnly, upload.single('video'), async (req, res) => {
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
        if (doc.videoUrl) {
            const filePath = path.join(__dirname, '..', doc.videoUrl);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        doc.videoUrl = null;
        doc.videoTitle = null;
        await doc.save();
        res.json({ message: 'Video removed', doc });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
