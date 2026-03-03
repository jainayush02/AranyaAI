const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Animal = require('../models/Animal');
const HealthLog = require('../models/HealthLog');
const axios = require('axios');

// @route   GET /api/animals
// @desc    Get all animals for valid user
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const animals = await Animal.find({ user_id: req.user.id }).sort({ createdAt: -1 });
        res.json(animals);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/animals
// @desc    Add new animal
// @access  Private
router.post('/', auth, async (req, res) => {
    const { name, breed } = req.body;

    if (!name || !breed) {
        return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    try {
        const newAnimal = new Animal({
            user_id: req.user.id,
            name,
            breed,
            status: 'Healthy', // default
            recentVitals: {
                temperature: 38.5,
                heartRate: 60
            }
        });

        const animal = await newAnimal.save();
        res.json(animal);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/animals/:id
// @desc    Delete animal
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        let animal = await Animal.findById(req.params.id);

        if (!animal) return res.status(404).json({ msg: 'Animal not found' });

        // Make sure user owns animal
        if (animal.user_id.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        // Use findByIdAndDelete instead of .remove() for mongoose 6+
        await Animal.findByIdAndDelete(req.params.id);

        // Optional: Also delete all related HealthLogs here
        await HealthLog.deleteMany({ animal_id: req.params.id });

        res.json({ msg: 'Animal removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/animals/:id
// @desc    Get single animal
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        if (animal.user_id.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });
        res.json(animal);
    } catch (err) {
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Animal not found' });
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/animals/:id/logs
// @desc    Get health logs for an animal
// @access  Private
router.get('/:id/logs', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        if (animal.user_id.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });

        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/animals/:id/recalculate
// @desc    Re-run AI prediction on existing logs (no new log needed)
// @access  Private
router.post('/:id/recalculate', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        if (animal.user_id.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });

        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 }).limit(24);

        if (logs.length === 0) {
            return res.json({ animalStatus: animal.status, msg: 'No logs found to recalculate' });
        }

        const chronologicalLogs = logs.reverse();

        let status = 'Healthy';
        let aiErrorScore = null;
        try {
            const aiResponse = await axios.post((process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000') + '/predict_anomaly', {
                history: chronologicalLogs
            });
            status = aiResponse.data.status;
            aiErrorScore = aiResponse.data.error_score;
        } catch (aiErr) {
            console.error('AI Microservice unavailable:', aiErr.message);
            // AI is down — keep current status, don't guess
        }

        animal.status = status;
        await animal.save();

        res.json({ animalStatus: status, aiErrorScore });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/animals/:id/logs
// @desc    Add a health log
// @access  Private
router.post('/:id/logs', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        if (animal.user_id.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });

        const { temperature, heartRate, activityLevel, appetite, notes } = req.body;

        const newLog = new HealthLog({
            animal_id: req.params.id,
            temperature,
            heartRate,
            activityLevel,
            appetite,
            notes
        });

        await newLog.save();

        // 1. Fetch previous logs for the Microservice
        // (sort descending so newest is first in DB, but the python code accepts the sequence chronological N=24, so we reverse it or serve it as is)
        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 }).limit(24);

        // Reverse array so it goes from oldest to newest for the time series LSTM
        const chronologicalLogs = logs.reverse();

        // 2. Fetch AI Status via Python Microservice
        let status = 'Healthy';
        let aiErrorScore = null;
        try {
            const aiResponse = await axios.post((process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000') + '/predict_anomaly', {
                history: chronologicalLogs
            });
            status = aiResponse.data.status;
            aiErrorScore = aiResponse.data.error_score;
        } catch (aiErr) {
            console.error('AI Microservice unavailable:', aiErr.message);
            // AI is down — keep current status, don't guess
        }

        // 3. Update the Animal with the latest metrics and AI Status
        const t = parseFloat(temperature);
        const hr = parseInt(heartRate);

        if (animal.recentVitals) {
            animal.recentVitals.temperature = t;
            animal.recentVitals.heartRate = hr;
        } else {
            animal.recentVitals = { temperature: t, heartRate: hr };
        }

        animal.status = status;
        await animal.save();

        res.json({ log: newLog, animalStatus: status, aiErrorScore });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;
