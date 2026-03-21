const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Plan = require('../models/Plan');

// Middleware to check if admin
const isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'admin') return res.status(403).json({ msg: 'Admin access required' });
        next();
    } catch (err) {
        res.status(500).json({ msg: 'Server error' });
    }
};

// @route   GET /api/plans
// @desc    Get all plans
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        if (req.query.all) {
            const tempUser = await User.findById(req.user.id);
            if (tempUser.role !== 'admin') return res.status(403).json({ msg: 'Not admin' });
            return res.json(await Plan.find().sort({ price: 1 }));
        }
        res.json(await Plan.find({ active: true }).sort({ price: 1 }));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/plans
// @desc    Create a new plan
// @access  Admin
router.post('/', auth, isAdmin, async (req, res) => {
    try {
        const newPlan = new Plan(req.body);
        if (req.body.isDefault) {
             await Plan.updateMany({}, { isDefault: false });
        }
        if (req.body.isRecommended) {
            await Plan.updateMany({}, { isRecommended: false });
        }
        await newPlan.save();
        res.json(newPlan);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/plans/:id
// @desc    Update a plan
// @access  Admin
router.put('/:id', auth, isAdmin, async (req, res) => {
    try {
        if (req.body.isDefault) {
            await Plan.updateMany({}, { isDefault: false });
        }
        if (req.body.isRecommended) {
            await Plan.updateMany({}, { isRecommended: false });
        }
        const updated = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/plans/:id
// @desc    Archive a plan
// @access  Admin
router.delete('/:id', auth, isAdmin, async (req, res) => {
    try {
        const p = await Plan.findById(req.params.id);
        p.active = false;
        await p.save();
        res.json({ msg: 'Plan archived' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;
