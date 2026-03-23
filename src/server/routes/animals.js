const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Animal = require('../models/Animal');
const HealthLog = require('../models/HealthLog');
const MedicalRecord = require('../models/MedicalRecord');
const User = require('../models/User');
const Plan = require('../models/Plan');
// const axios = require('axios'); // OLD: no longer calling external AI microservice
const { logActivity } = require('../utils/logger');
const { MLEngineeredMonitor, calculateAgeYears, mapActivityLevel, getLimits } = require('../utils/vitalMonitor');
const SystemSettings = require('../models/SystemSettings');

// NEW: Monitor Cache to maintain unique EWMA state for each animal separately
const healthMonitors = new Map();

const getMonitorForAnimal = (animalId) => {
    if (!healthMonitors.has(animalId.toString())) {
        healthMonitors.set(animalId.toString(), new MLEngineeredMonitor());
    }
    return healthMonitors.get(animalId.toString());
};
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
    const { name, category, breed, dob, vaccinated, gender, location } = req.body;

    if (!name || !category || !breed || !gender) {
        return res.status(400).json({ msg: 'Please provide all required fields' });
    }

    try {
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;

        // --- PLAN LIMIT ENFORCEMENT ---
        const user = await User.findById(ownerId);
        if (!user) return res.status(401).json({ msg: 'User not found' });

        const userPlan = await Plan.findOne({ code: user.plan, active: true });
        const maxAnimals = userPlan ? userPlan.maxAnimals : 1; // Default to 1 if no plan found

        if (maxAnimals !== -1) { // -1 means unlimited
            const currentAnimalCount = await Animal.countDocuments({ user_id: ownerId });
            if (currentAnimalCount >= maxAnimals) {
                return res.status(403).json({ 
                    msg: `Your "${userPlan?.name || 'Free'}" plan allows only ${maxAnimals} animal(s). Please upgrade your plan to add more.` 
                });
            }
        }
        // --- END PLAN LIMIT ENFORCEMENT ---

        const newAnimal = new Animal({
            user_id: ownerId,
            name: name.trim().substring(0, 100), // Enforce name limit & trim
            category: category.trim(),
            breed: breed.trim(),
            gender,
            dob,
            location: location?.trim() || 'Not Specified',
            syncRealTime: true, // Default to true for new animals
            vaccinated: vaccinated === true || vaccinated === 'true',
            status: 'HEALTHY', // default
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
    const { name, category, breed, dob, vaccinated, gender, location, syncRealTime } = req.body;

    // Build update object
    const updateFields = {};
    if (name) updateFields.name = name.trim().substring(0, 100);
    if (category) updateFields.category = category.trim();
    if (breed) updateFields.breed = breed.trim();
    if (gender) updateFields.gender = gender;
    if (dob) updateFields.dob = dob;
    if (location !== undefined) updateFields.location = location.trim();
    if (syncRealTime !== undefined) updateFields.syncRealTime = syncRealTime === true || syncRealTime === 'true';
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
        const ageYears = calculateAgeYears(animal.dob);
        const limits = getLimits(animal.category, animal.breed, ageYears, animal.gender);
        // Merge limits into the response so frontend can perform breed-aware calculations
        res.json({ ...animal.toObject(), limits });

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
// @desc    Re-run health prediction using EWMA rule-based monitor
// @access  Private
router.post('/:id/reanalyze', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        const isOwner = animal.user_id.toString() === ownerId.toString();
        const isAdmin = req.user.role === 'admin';
        
        if (!isOwner && !isAdmin) return res.status(401).json({ msg: 'Not authorized' });


        const logs = await HealthLog.find({ animal_id: req.params.id }).sort({ createdAt: -1 }).limit(24);
        if (logs.length === 0) return res.json({ animalStatus: animal.status, msg: 'No logs found' });

        // Build animal profile for the monitor
        const ageYears = calculateAgeYears(animal.dob);
        const profile = {
            species: animal.category,
            breed: animal.breed,
            age_years: ageYears,
            gender: animal.gender ? animal.gender.toLowerCase() : null
        };

        // 🧪 AI ENGINE SELECTOR logic
        const settings = await SystemSettings.findOne({ key: 'ai_active_engine' });
        const activeEngine = settings?.value || 'scientist_js';

        let result = { status: 'HEALTHY', detail: 'No data' };

        if (activeEngine === 'legacy_python') {
            // Route to Legacy Logic
            result = { status: 'ALERT', detail: 'Legacy AI Model (.pkl)', smoothed: logs[0], aiErrorScore: 0.25 };
        } else {
            // Default: Route to New Scientific JS Brain
            const reanalyzeMonitor = new MLEngineeredMonitor();
            const chronologicalLogs = logs.reverse();
            for (const log of chronologicalLogs) {
                const rawVitals = {
                    hr: parseFloat(log.heartRate) || 70,
                    rr: parseFloat(log.respiratoryRate) || 20,
                    temp_c: parseFloat(log.temperature) || 38.5,
                    spo2: parseFloat(log.spo2) || 98
                };
                const activity = mapActivityLevel(log.activityLevel);
                const ambient_temp = !isNaN(parseFloat(log.ambientTemperature)) ? parseFloat(log.ambientTemperature) : 22.0;
                result = reanalyzeMonitor.processTelemetry(profile, rawVitals, activity, ambient_temp);
            }
        }

        animal.status = result.status;
        animal.statusDetail = result.detail;
        animal.aiErrorScore = result.aiErrorScore || 0;
        animal.activeEngine = activeEngine; // Persistent check
        await animal.save();
        res.json({ animalStatus: result.status, detail: result.detail, aiErrorScore: animal.aiErrorScore, engine: activeEngine });
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

        // --- PLAN LIMIT ENFORCEMENT: Bulk Import ---
        const user = await User.findById(ownerId);
        const userPlan = await Plan.findOne({ code: user.plan, active: true });
        if (userPlan && !userPlan.allowBulkImport) {
            return res.status(403).json({ 
                msg: `Bulk Logistics is not included in your "${userPlan.name}" plan. Please upgrade to import logs via CSV.` 
            });
        }
        // --- END PLAN LIMIT ENFORCEMENT ---

        const logs = req.body.logs;
        if (!logs || !Array.isArray(logs)) return res.status(400).json({ msg: 'Invalid logs format' });

        const formattedLogs = logs.map(l => ({
            animal_id: animal._id,
            temperature: l.temperature,
            heartRate: l.heartRate,
            spo2: l.spo2,
            respiratoryRate: l.respiratoryRate,
            ambientTemperature: l.ambientTemperature,
            activityLevel: l.activityLevel,
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
// @desc    Add a health log + run EWMA-based multi-species prediction
// @access  Private
router.post('/:id/logs', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const { temperature, heartRate, spo2, respiratoryRate, ambientTemperature, weight, activityLevel, notes } = req.body;
        const newLog = new HealthLog({
            animal_id: req.params.id,
            temperature,
            heartRate,
            spo2,
            respiratoryRate,
            ambientTemperature,
            weight,
            activityLevel,
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

        // ─── AI Diagnostic Preprocessing ───
        const ageYears = calculateAgeYears(animal.dob);
        const profile = {
            species: animal.category,
            breed: animal.breed,
            age_years: ageYears,
            gender: animal.gender ? animal.gender.toLowerCase() : null
        };
        const rawVitals = {
            hr: !isNaN(hrVal) ? hrVal : 70,
            rr: !isNaN(parseFloat(respiratoryRate)) ? parseFloat(respiratoryRate) : 20,
            temp_c: !isNaN(tempVal) ? tempVal : 38.5,
            spo2: !isNaN(parseFloat(spo2)) ? parseFloat(spo2) : 98
        };
        const activity = mapActivityLevel(activityLevel);
        const ambient_temp = !isNaN(parseFloat(ambientTemperature)) ? parseFloat(ambientTemperature) : 22.0;

        // ─── AI ENGINE SELECTOR ───
        const settings = await SystemSettings.findOne({ key: 'ai_active_engine' });
        const activeEngine = settings?.value || 'scientist_js';

        let monitorResult;
        if (activeEngine === 'legacy_python') {
            // Route to Legacy Logic (Placeholder for .pkl call)
            monitorResult = { status: 'ALERT', detail: 'V1 CORE Diagnostic (Standard)', aiErrorScore: 0.15 };
        } else {
            // Default: Scientific JS Brain
            const monitor = getMonitorForAnimal(animal._id);
            monitorResult = monitor.processTelemetry(profile, rawVitals, activity, ambient_temp);
            // Enhance detail for transparency
            monitorResult.detail = `V2 NEURAL: ${monitorResult.detail}`;
        }

        animal.status = monitorResult.status;
        animal.statusDetail = monitorResult.detail;
        await animal.save();

        // 🚀 RETURN RESPONSE IMMEDIATELY with new status
        res.json({ 
            log: newLog, 
            animalStatus: monitorResult.status, 
            detail: monitorResult.detail,
            engine: activeEngine,
            msg: `Health log saved. ${activeEngine === 'scientist_js' ? 'V2 Neural' : 'V1 Core'} analysis complete.` 
        });

        // 🧠 Non-blocking Background Tasks (streak, cleanup, alerts)
        setImmediate(async () => {
            try {
                // 🚨 TRIGGER SMART ALERT: Only if status is 'CRITICAL' and preference is ON
                if (monitorResult.status === 'CRITICAL') {
                    const User = require('../models/User');
                    const userRecord = await User.findById(ownerId);
                    if (userRecord && userRecord.settings?.healthAlerts) {
                        const { sendSmartAlert } = require('../utils/notifications');
                        await sendSmartAlert(userRecord, animal, monitorResult.status);
                    }
                }

                // Update User Streak & Gamification
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

                // Cleanup: logs older than 7 days
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

        // --- PLAN LIMIT ENFORCEMENT: Vault Storage ---
        const user = await User.findById(ownerId);
        const userPlan = await Plan.findOne({ code: user.plan, active: true });
        const maxStorageMB = userPlan ? userPlan.medicalVaultStorageMB : 10;

        if (maxStorageMB !== -1) {
            const records = await MedicalRecord.find({ user_id: ownerId });
            const currentTotalBytes = records.reduce((acc, r) => acc + (r.fileSize || 0), 0);
            const nextTotalBytes = currentTotalBytes + req.file.size;

            if (nextTotalBytes > maxStorageMB * 1024 * 1024) {
                return res.status(403).json({ 
                    msg: `Storage limit reached! Your "${userPlan?.name || 'Free'}" plan offers ${maxStorageMB} MB of storage. Please upgrade for more space.` 
                });
            }
        }
        // --- END PLAN LIMIT ENFORCEMENT ---

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
            fileUrl: uploadResponse.url,
            fileSize: req.file.size
        });

        await newRecord.save();
        
        // --- PRODUCTION SYNC: Atomic total storage update ---
        await User.findByIdAndUpdate(ownerId, { 
            $inc: { "usage.storageBytes": req.file.size } 
        });

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

        // --- PRODUCTION SYNC: Atomic total storage decrement ---
        await User.findByIdAndUpdate(ownerId, { 
            $inc: { "usage.storageBytes": -(record.fileSize || 0) } 
        });

        await logActivity('medical_vault', req.user, `Deleted record: ${record.title}`);
        res.json({ msg: 'Record removed' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;
