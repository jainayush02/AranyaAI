const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Animal = require('../models/Animal');
const HealthLog = require('../models/HealthLog');
const MedicalRecord = require('../models/MedicalRecord');
const axios = require('axios');
const { logActivity } = require('../utils/logger');
const multer = require('multer');
const ImageKit = require('imagekit');

// Configure ImageKit
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Use memory storage for Buffer
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// @route   GET /api/animals
// @desc    Get all animals for valid user
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        const animals = await Animal.find({ user_id: ownerId }).sort({ createdAt: -1 });
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
    const { name, category, breed, dob, vaccinated } = req.body;

    if (!name || !category || !breed) {
        return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    try {
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        const newAnimal = new Animal({
            user_id: ownerId,
            name,
            category,
            breed,
            dob,
            vaccinated: vaccinated === true || vaccinated === 'true',
            status: 'Healthy', // default
            recentVitals: {
                temperature: 38.5,
                heartRate: 60
            }
        });

        const animal = await newAnimal.save();
        await logActivity('animal_registry', req.user, `Added new animal: ${name} (${breed})`);
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
        if (req.user.role === 'caretaker') {
            return res.status(403).json({ msg: 'Care Circle members are not authorized to delete animals. Please contact the owner.' });
        }

        let animal = await Animal.findById(req.params.id);

        if (!animal) return res.status(404).json({ msg: 'Animal not found' });

        // Make sure user owns animal
        if (animal.user_id.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await Animal.findByIdAndDelete(req.params.id);
        await HealthLog.deleteMany({ animal_id: req.params.id });
        await logActivity('animal_registry', req.user, `Removed animal: ${animal.name}`);
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
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });
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
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/animals/:id/recalculate
// @desc    Re-run AI prediction on existing logs
// @access  Private
router.post('/:id/recalculate', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 }).limit(24);
        if (logs.length === 0) return res.json({ animalStatus: animal.status, msg: 'No logs found' });

        const chronologicalLogs = logs.reverse();
        let status = 'Healthy';
        let aiErrorScore = null;
        try {
            const aiResponse = await axios.post((process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000') + '/predict_anomaly', {
                history: chronologicalLogs
            }, { timeout: 8000 });
            status = aiResponse.data.status;
            aiErrorScore = aiResponse.data.error_score;
        } catch (aiErr) {
            console.error('AI Microservice unavailable:', aiErr.message);
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
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const { temperature, heartRate, weight, activityLevel, appetite, notes } = req.body;
        const newLog = new HealthLog({
            animal_id: req.params.id,
            temperature,
            heartRate,
            weight,
            activityLevel,
            appetite,
            notes
        });

        await newLog.save();

        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 }).limit(24);
        const chronologicalLogs = logs.reverse();

        let status = 'Healthy';
        let aiErrorScore = null;
        try {
            const aiResponse = await axios.post((process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000') + '/predict_anomaly', {
                history: chronologicalLogs
            }, { timeout: 8000 });
            status = aiResponse.data.status;
            aiErrorScore = aiResponse.data.error_score;
        } catch (aiErr) {
            console.error('AI Microservice unavailable:', aiErr.message);
        }

        if (animal.recentVitals) {
            animal.recentVitals.temperature = parseFloat(temperature);
            animal.recentVitals.heartRate = parseInt(heartRate);
            animal.recentVitals.weight = parseFloat(weight);
        } else {
            animal.recentVitals = { temperature: parseFloat(temperature), heartRate: parseInt(heartRate), weight: parseFloat(weight) };
        }

        animal.status = status;
        await animal.save();
        res.json({ log: newLog, animalStatus: status, aiErrorScore });

        // Cleanup: logs older than 7 days
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            await HealthLog.deleteMany({ animal_id: req.params.id, createdAt: { $lt: sevenDaysAgo } });
        } catch (cleanupErr) {
            console.error('Log cleanup failed:', cleanupErr.message);
        }
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/animals/:id/vaccination
router.put('/:id/vaccination', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        animal.vaccinated = req.body.vaccinated;
        await animal.save();
        await logActivity('animal_registry', req.user, `Updated vaccination status for: ${animal.name}`);
        res.json(animal);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/animals/:id/vitals
router.put('/:id/vitals', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const { temperature, heartRate, weight } = req.body;
        if (!animal.recentVitals) animal.recentVitals = {};
        if (temperature !== undefined) animal.recentVitals.temperature = parseFloat(temperature);
        if (heartRate !== undefined) animal.recentVitals.heartRate = parseInt(heartRate);
        if (weight !== undefined) animal.recentVitals.weight = parseFloat(weight);

        await animal.save();
        await logActivity('animal_registry', req.user, `Updated vitals for: ${animal.name}`);
        res.json(animal);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// --- MEDICAL VAULT ROUTES ---

// @route   GET /api/animals/:id/records
router.get('/:id/records', auth, async (req, res) => {
    try {
        const records = await MedicalRecord.find({ animal_id: req.params.id }).sort({ createdAt: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/animals/:id/records (CLOUD UPLOAD)
router.post('/:id/records', [auth, upload.single('recordFile')], async (req, res) => {
    try {
        const { recordType, title } = req.body;
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        
        if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });

        // Upload to ImageKit
        const uploadResponse = await imagekit.upload({
            file: req.file.buffer,
            fileName: `${Date.now()}-${req.file.originalname}`,
            folder: '/aranya_medical_vault'
        });

        const newRecord = new MedicalRecord({
            animal_id: req.params.id,
            user_id: ownerId,
            recordType: recordType || 'General',
            title: title || req.file.originalname,
            fileUrl: uploadResponse.url
        });

        await newRecord.save();
        await logActivity('medical_vault', req.user, `Uploaded record for animal: ${req.params.id}`);
        res.json(newRecord);
    } catch (err) {
        console.error('ImageKit Upload Error:', err);
        res.status(500).json({ msg: 'Cloud storage upload failed', error: err.message });
    }
});

// @route   DELETE /api/animals/:id/records/:recordId
router.delete('/:id/records/:recordId', auth, async (req, res) => {
    try {
        const record = await MedicalRecord.findById(req.params.recordId);
        if (!record) return res.status(404).json({ msg: 'Record not found' });

        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (record.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        await MedicalRecord.findByIdAndDelete(req.params.recordId);
        await logActivity('medical_vault', req.user, `Deleted record: ${record.title}`);
        res.json({ msg: 'Record removed' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;
