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

// Use memory storage for Buffer - Hardened for secure uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPG, PNG, WEBP, and PDF are allowed.'), false);
        }
    }
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
    const { name, category, breed, dob, vaccinated, gender } = req.body;

    if (!name || !category || !breed || !gender) {
        return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    try {
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        const newAnimal = new Animal({
            user_id: ownerId,
            name: name.trim().substring(0, 100), // Enforce name limit & trim
            category: category.trim(),
            breed: breed.trim(),
            gender,
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

// @route   PUT /api/animals/:id
// @desc    Update animal details
// @access  Private
router.put('/:id', auth, async (req, res) => {
    const { name, category, breed, dob, vaccinated, gender } = req.body;

    // Build update object
    const updateFields = {};
    if (name) updateFields.name = name.trim().substring(0, 100);
    if (category) updateFields.category = category.trim();
    if (breed) updateFields.breed = breed.trim();
    if (gender) updateFields.gender = gender;
    if (dob) updateFields.dob = dob;
    if (vaccinated !== undefined) updateFields.vaccinated = vaccinated === true || vaccinated === 'true';

    try {
        let animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });

        // Authorization check
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        // Apply updates
        animal = await Animal.findByIdAndUpdate(
            req.params.id,
            { $set: updateFields },
            { new: true }
        );

        await logActivity('animal_registry', req.user, `Updated animal details: ${animal.name}`);
        res.json(animal);
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

// @route   POST /api/animals/:id/reanalyze
// @desc    Re-run AI prediction on existing logs
// @access  Private
router.post('/:id/reanalyze', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 }).limit(24);
        if (logs.length === 0) return res.json({ animalStatus: animal.status, msg: 'No logs found' });

        const chronologicalLogs = logs.reverse();
        let status = animal.status || 'Healthy';
        let aiErrorScore = null;
        try {
            const aiResponse = await axios.post((process.env.AI_SERVICE_URL || 'http://127.0.0.1:8005') + '/predict_anomaly', {
                history: chronologicalLogs
            }, { timeout: 10000 });
            status = aiResponse.data.status;
            aiErrorScore = aiResponse.data.error_score;
        } catch (aiErr) {
            console.error('AI Microservice error:', aiErr.message);
            return res.status(503).json({ msg: 'AI Service Unavailable: ' + aiErr.message, animalStatus: status });
        }

        animal.status = status;
        await animal.save();
        res.json({ animalStatus: status, aiErrorScore });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/animals/:id/bulk-logs
// @desc    Add multiple health logs via CSV
// @access  Private
router.post('/:id/bulk-logs', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const logs = req.body.logs;
        if (!logs || !Array.isArray(logs)) return res.status(400).json({ msg: 'Invalid logs format' });

        const formattedLogs = logs.map(l => ({
            animal_id: animal._id,
            temperature: l.temperature,
            heartRate: l.heartRate,
            activityLevel: l.activityLevel,
            appetite: l.appetite,
            notes: l.notes
        }));

        await HealthLog.insertMany(formattedLogs);

        if (formattedLogs.length > 0) {
            const lastLog = formattedLogs[formattedLogs.length - 1];
            animal.recentVitals = {
                temperature: lastLog.temperature,
                heartRate: lastLog.heartRate,
                weight: animal.recentVitals?.weight || null,
                lastUpdate: new Date()
            };
            await animal.save();
        }

        res.json({ msg: 'Logs imported successfully' });
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

        // Update Animal Recent Vitals immediately so the UI reflects current readings
        const tempVal = parseFloat(temperature);
        const hrVal = parseInt(heartRate);
        const weightVal = weight ? parseFloat(weight) : (animal.recentVitals?.weight || null);

        if (animal.recentVitals) {
            if (!isNaN(tempVal)) animal.recentVitals.temperature = tempVal;
            if (!isNaN(hrVal)) animal.recentVitals.heartRate = hrVal;
            if (weightVal !== null && !isNaN(weightVal)) animal.recentVitals.weight = weightVal;
        } else {
            animal.recentVitals = { 
                temperature: !isNaN(tempVal) ? tempVal : 38.5, 
                heartRate: !isNaN(hrVal) ? hrVal : 60, 
                weight: (weightVal !== null && !isNaN(weightVal)) ? weightVal : undefined 
            };
        }
        
        await animal.save();

        // 🚀 RETURN RESPONSE IMMEDIATELY (Eliminates the 10s wait)
        res.json({ 
            log: newLog, 
            animalStatus: animal.status, 
            aiErrorScore: null,
            msg: 'Health log saved instantly. AI analysis running in background.' 
        });

        // 🧠 Non-blocking Background Tasks
        // We use setImmediate to ensure the response is flushed before starting heavy work
        setImmediate(async () => {
            try {
                // 1. AI Prediction
                const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 }).limit(24);
                const chronologicalLogs = logs.reverse();

                let newStatus = animal.status;
                let errorScore = null;
                
                try {
                    // We can use a longer timeout here because it's not blocking the user
                    const aiResponse = await axios.post((process.env.AI_SERVICE_URL || 'http://127.0.0.1:8005') + '/predict_anomaly', {
                        history: chronologicalLogs
                    }, { timeout: 15000 });
                    
                    newStatus = aiResponse.data.status;
                    errorScore = aiResponse.data.error_score;

                    // Update the animal with the new prediction
                    await Animal.findByIdAndUpdate(req.params.id, { status: newStatus });

                    // 🚨 TRIGGER SMART ALERT: Only if status is 'Critical' and preference is ON
                    if (newStatus === 'Critical') {
                        const User = require('../models/User');
                        const userRecord = await User.findById(ownerId);
                        if (userRecord && userRecord.settings?.healthAlerts) {
                            const { sendSmartAlert } = require('../utils/notifications');
                            await sendSmartAlert(userRecord, animal, newStatus);
                        }
                    }
                } catch (aiErr) {
                    // If AI service is not set up correctly in deployment, we log it but don't crash
                    console.error('Background AI analysis failed (AI Service likely unreachable):', aiErr.message);
                }

                // 2. Update User Streak & Gamification
                const user = await require('../models/User').findById(ownerId);
                if (user) {
                    const today = new Date();
                    const yesterday = new Date();
                    yesterday.setDate(today.getDate() - 1);
                    const lastLog = user.lastLogDate ? new Date(user.lastLogDate) : null;
                    
                    if (!lastLog || lastLog.toDateString() !== today.toDateString()) {
                        if (!lastLog) {
                            user.streakCount = 1;
                        } else if (lastLog.toDateString() === yesterday.toDateString()) {
                            user.streakCount += 1;
                        } else {
                            user.streakCount = 1;
                        }
                        user.lastLogDate = today;

                        if (user.streakCount === 7 && !user.badges.includes('perfect_week')) {
                            user.badges.push('perfect_week');
                        }
                        await user.save();
                    }
                }

                // 3. Cleanup: logs older than 7 days
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                await HealthLog.deleteMany({ animal_id: req.params.id, createdAt: { $lt: sevenDaysAgo } });

            } catch (bgErr) {
                console.error('Critical background process error:', bgErr.message);
            }
        });
    } catch (err) {
        console.error('Save log failed:', err);
        if (!res.headersSent) res.status(500).send('Server Error');
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
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });

        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) {
            return res.status(404).json({ msg: 'Animal not found' }); // Standardizing to 404 for security
        }

        const records = await MedicalRecord.find({ animal_id: req.params.id }).sort({ createdAt: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/animals/:id/records (CLOUD UPLOAD)
router.post('/:id/records', [auth, upload.single('recordFile')], async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });

        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) {
            return res.status(404).json({ msg: 'Animal not found' });
        }

        const { recordType, title } = req.body;
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
        await logActivity('medical_vault', req.user, `Uploaded record for animal: ${animal.name}`);
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
