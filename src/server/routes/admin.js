const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Animal = require('../models/Animal');
const ActivityLog = require('../models/ActivityLog');
const Faq = require('../models/Faq');
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

module.exports = router;
