const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const jwt = require('jsonwebtoken');

// Middleware to check for Admin role
const adminOnly = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id);

        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden. Admin access required.' });
        }
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token invalid' });
    }
};

// @route GET /api/settings
// Publicly accessible for users to get current pricing/configs
router.get('/', async (req, res) => {
    try {
        const settings = await SystemSettings.find();
        const settingsMap = {};
        settings.forEach(s => {
            let val = s.value;
            // Fix: if DB has the experimental array format, extract the first song to restore the UI.
            if (s.key === 'login_audio' && val && val.songs && val.songs.length > 0) {
                val = val.songs[0];
            }
            settingsMap[s.key] = val;
        });
        res.json(settingsMap);
    } catch (error) {
        console.error('GET /api/settings - ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/settings/update
// Admin only: modify global settings
router.post('/update', adminOnly, async (req, res) => {
    try {
        const { key, value } = req.body;
        console.log(`POST /api/settings/update - Attempt: ${key}=${value}`);
        let setting = await SystemSettings.findOneAndUpdate(
            { key },
            { value },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`POST /api/settings/update - SUCCESS: ${key}`);
        res.json({ message: 'Setting updated successfully', setting });
    } catch (error) {
        console.error('POST /api/settings/update - ERROR:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
