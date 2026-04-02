const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

// Public/Auth - List available tiers
router.get('/', async (req, res) => {
    try {
        const plans = await Plan.find().sort({ price: 1 });
        res.json(plans);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Create a new tier
router.post('/', authenticate, adminOnly, async (req, res) => {
    try {
        const plan = await Plan.create(req.body);
        res.status(201).json(plan);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// Admin - Update a tier 
router.put('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });
        res.json(plan);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

// Admin - Delete a tier
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const plan = await Plan.findByIdAndDelete(req.params.id);
        if (!plan) return res.status(404).json({ message: 'Plan not found' });
        res.json({ message: 'Plan deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
