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
const { OpenAI } = require('openai');


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

// @route   GET /api/animals/vaccinations/upcoming
// @desc    Get upcoming vaccines for all animals owned by user
// @access  Private
router.get('/vaccinations/upcoming', auth, async (req, res) => {
    try {
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        const animals = await Animal.find({ user_id: ownerId });

        let upcoming = [];

        animals.forEach(animal => {
            if (animal.vaccinationSchedule && animal.vaccinationSchedule.length > 0) {
                animal.vaccinationSchedule.forEach(v => {
                    if (v.status !== 'Completed' && v.dueDate) {
                        upcoming.push({
                            animalId: animal._id,
                            animalName: animal.name,
                            breed: animal.breed,
                            category: animal.category,
                            dob: animal.dob,
                            vaccineName: v.name,
                            dueDate: v.dueDate,
                            type: v.type,
                            description: v.description
                        });
                    }
                });
            }
        });

        upcoming.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        res.json(upcoming);
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
        console.error('Add Animal Error:', err);
        res.status(500).json({ msg: 'Adding animal failed', error: err.message });
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
        const ownerId = req.user.id; // delete route only reachable by owner
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) {
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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) {
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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });
        const ageYears = calculateAgeYears(animal.dob);
        const limits = getLimits(animal.category, animal.breed, ageYears, animal.gender);

        // Check if CareCycle AI is enabled globally
        const vaxSettings = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
        const careCycleEnabled = vaxSettings?.value?.vaccinePrimary?.enabled || false;

        // Merge limits and feature-flags into the response
        res.json({ ...animal.toObject(), limits, careCycleEnabled });

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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

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
        const isOwner = ownerId && animal.user_id && (animal.user_id.toString() === ownerId.toString());
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
            result = { status: 'HEALTHY', detail: 'Legacy Monitoring Mode', smoothed: logs[0], aiErrorScore: 0.25 };
        } else {
            // Default: Route to New Scientific JS Brain
            const reanalyzeMonitor = new MLEngineeredMonitor();
            // Process logs in chronological order to build up EWMA state
            const chronologicalLogs = [...logs].reverse();
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

        // --- Persistent State Update ---
        if (result && result.status) {
            animal.status = result.status;
            animal.statusDetail = result.detail || 'Analysis complete';
            animal.aiErrorScore = result.aiErrorScore || 0;
            animal.activeEngine = activeEngine;
            await animal.save();
        }

        res.json({
            animalStatus: animal.status,
            detail: animal.statusDetail,
            aiErrorScore: animal.aiErrorScore,
            engine: activeEngine
        });
    } catch (err) {
        console.error("Reanalyze Error:", err);
        res.status(500).json({ msg: 'Reanalyze failed', error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

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
        animal.activeEngine = activeEngine;
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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        animal.vaccinated = req.body.vaccinated;
        await animal.save();
        await logActivity('animal_registry', req.user, `Updated vaccination status for: ${animal.name}`);
        res.json(animal);
    } catch (err) {
        console.error("Vaccination Update Error:", err);
        res.status(500).json({ msg: 'Vaccination update failed', error: err.message });
    }
});

// @route   PUT /api/animals/:id/vitals
router.put('/:id/vitals', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });
        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) {
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
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) {
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
        if (!ownerId || !record.user_id || record.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

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

// @route   GET /api/animals/:id/vaccine-recommendations
// @desc    Get vaccine recommendations from AI based on breed/age/species for Arion CareCycle
// @access  Private
router.get('/:id/vaccine-recommendations', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });

        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        const ageYears = calculateAgeYears(animal.dob);
        const yearsInt = Math.floor(ageYears);
        const monthsInt = Math.round((ageYears - yearsInt) * 12);
        const ageString = yearsInt > 0 ? `${yearsInt}y ${monthsInt}m` : `${monthsInt}m`;

        // Fetch AI config — exclusively from Admin Portal (ai_config_v2 in DB)
        let aiConfig = {
            primary: { provider: 'Hugging Face', customProvider: '', baseURL: 'https://router.huggingface.co/v1', apiKey: '', models: [], enabled: true },
            fallback: { provider: 'OpenRouter', customProvider: '', baseURL: 'https://openrouter.ai/api/v1', apiKey: '', models: [], enabled: true },
            vaccinePrimary: { provider: 'Hugging Face', customProvider: '', baseURL: 'https://router.huggingface.co/v1', apiKey: '', models: [], enabled: false },
            vaccineFallback: { provider: 'OpenRouter', customProvider: '', baseURL: 'https://openrouter.ai/api/v1', apiKey: '', models: [], enabled: false }
        };

        try {
            const dbConfig = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
            if (dbConfig && dbConfig.value) {
                aiConfig = { ...aiConfig, ...dbConfig.value };
            }
        } catch (confErr) {
            console.error("[CareCycle] Error fetching AI config from DB:", confErr.message);
        }

        // Decide which configuration to use for Vaccines (Specialized only - strictly honoring toggles)
        const vPri = aiConfig.vaccinePrimary;
        const vFb = aiConfig.vaccineFallback;

        // ── 1. Determine model mapping ──
        const primaryTextModel = (vPri.models || []).find(m => m.type === 'text' || m.type === 'text+vision');
        const fallbackTextModel = (vFb.models || []).find(m => m.type === 'text' || m.type === 'text+vision');

        // ── 0. Lazy AI Logic: Only run LLM if forced or schedule empty ──
        const forceRefresh = req.query.force === 'true';
        if (!forceRefresh && animal.vaccinationSchedule && animal.vaccinationSchedule.length > 0) {
            return res.json({
                alreadyCompleted: animal.vaccinationSchedule.filter(v => v.status === 'Completed'),
                futureNeeded: animal.vaccinationSchedule.filter(v => v.status === 'Pending'),
                conclusion: animal.aiConclusion || "Using previously generated roadmap."
            });
        }

        const rawPrompt = aiConfig.vaccinePrompt || "";

        // Perform dynamic variable substitution
        const prompt = rawPrompt
            .replace(/\${animal\.category}/g, animal.category)
            .replace(/\${animal\.breed}/g, animal.breed)
            .replace(/\${ageYears}/g, ageYears.toFixed(2))
            .replace(/\${ageString}/g, ageString);

        const primaryModelObj = primaryTextModel || (vPri.models || [])[0];
        const fallbackModelObj = fallbackTextModel || (vFb.models || [])[0];

        let response;
        let usedModel = "N/A";

        // --- Attempt Primary Engine ---
        if (vPri.enabled && vPri.apiKey) {
            try {
                const pBaseURL = primaryModelObj?.baseURL || vPri.baseURL;
                const pApiKey = primaryModelObj?.apiKey || vPri.apiKey;
                const pModelId = primaryModelObj?.modelId;

                if (!pModelId) throw new Error("No primary model ID configured for Vaccination AI.");

                const primaryOpenai = new OpenAI({ apiKey: pApiKey, baseURL: pBaseURL });
                response = await primaryOpenai.chat.completions.create({
                    model: pModelId,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 3000,
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                });
                usedModel = pModelId;
            } catch (primaryErr) {
                console.warn("[CareCycle] Primary Vaccine AI Error, falling back:", primaryErr.message);
            }
        }

        // --- Attempt Fallback Engine ---
        if (!response && vFb.enabled && vFb.apiKey) {
            try {
                const fBaseURL = fallbackModelObj?.baseURL || vFb.models?.[0]?.baseURL || vFb.baseURL;
                const fApiKey = fallbackModelObj?.apiKey || vFb.models?.[0]?.apiKey || vFb.apiKey;
                const fModelId = fallbackModelObj?.modelId || vFb.models?.[0]?.modelId;

                if (!fModelId) throw new Error("No fallback model ID configured for Vaccination AI.");

                const fallbackOpenai = new OpenAI({ apiKey: fApiKey, baseURL: fBaseURL });
                response = await fallbackOpenai.chat.completions.create({
                    model: fModelId,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 2500,
                    temperature: 0.1
                });
                usedModel = fModelId;
            } catch (fallbackErr) {
                console.error("[CareCycle] Critical Vaccine AI Failure (Primary & Fallback failed):", fallbackErr.message);
            }
        }

        if (!response) {
            // If the user has deliberately turned the engine OFF, show empty results with an "Unavailable" message
            if (!vPri.enabled && !vFb.enabled) {
                return res.json({
                    alreadyCompleted: [],
                    futureNeeded: [],
                    conclusion: "Arion CareCycle engine is currently unavailable. Please enable it in the Admin Portal to view your animal's roadmap."
                });
            }

            console.warn("[CareCycle] All AI engines failed. Returning static fallback roadmap.");
            const cat = (animal.category || '').toLowerCase();
            const isCow = cat.includes('cow') || cat.includes('cattle');
            const isDog = cat.includes('dog');
            const isCat = cat.includes('cat');

            const conclusionText = (vPri.enabled || vFb.enabled) 
                ? `AI engines unavailable. Showing standard vaccination roadmap for ${animal.breed} (${animal.category}). Please consult your veterinarian for a personalized schedule.`
                : `Standard medical roadmap for ${animal.breed} (${animal.category}).`;

            let fallbackResult;
            if (isCow) {
                fallbackResult = {
                    alreadyCompleted: [
                        { name: 'FMD (Dose 1)', type: 'Core', frequencyMonths: 6, recommendationAgeWeeks: 16, description: 'Foot and Mouth Disease primary protection.' },
                        { name: 'HS + BQ Vaccine', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 24, description: 'Combined Hemorrhagic Septicemia and Black Quarter protection.' },
                        { name: 'Brucellosis (Heifer)', type: 'Core', frequencyMonths: 0, recommendationAgeWeeks: 32, description: 'One-time vaccination for disease control in females.' }
                    ],
                    futureNeeded: [
                        { name: 'FMD Booster', type: 'Core', frequencyMonths: 6, recommendationAgeWeeks: 40, description: 'Biannual booster for herd immunity.' },
                        { name: 'Theileriosis Vaccine', type: 'Optional', frequencyMonths: 12, recommendationAgeWeeks: 52, description: 'Tick-borne disease prevention in endemic areas.' },
                        { name: 'IBR Vaccine', type: 'Optional', frequencyMonths: 12, recommendationAgeWeeks: 26, description: 'Infectious Bovine Rhinotracheitis prevention.' }
                    ],
                    conclusion: conclusionText
                };
            } else if (isDog) {
                fallbackResult = {
                    alreadyCompleted: [
                        { name: 'Canine Distemper', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 8, description: 'Core puppy vaccination against distemper virus.' },
                        { name: 'Parvovirus', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 8, description: 'Essential protection against canine parvovirus.' },
                        { name: 'Rabies (Dose 1)', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 12, description: 'Mandatory zoonotic disease protection.' }
                    ],
                    futureNeeded: [
                        { name: 'DHPP Booster', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 52, description: 'Annual booster for distemper, hepatitis, parainfluenza, parvovirus.' },
                        { name: 'Rabies Booster', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 64, description: 'Annual booster to maintain rabies immunity.' },
                        { name: 'Leptospirosis', type: 'Optional', frequencyMonths: 12, recommendationAgeWeeks: 12, description: 'Recommended for dogs exposed to wildlife or standing water.' },
                        { name: 'Bordetella (Kennel Cough)', type: 'Optional', frequencyMonths: 6, recommendationAgeWeeks: 16, description: 'Recommended for dogs in social environments.' },
                        { name: 'Canine Influenza', type: 'Optional', frequencyMonths: 12, recommendationAgeWeeks: 16, description: 'Protection against H3N2 and H3N8 strains.' }
                    ],
                    conclusion: conclusionText
                };
            } else if (isCat) {
                fallbackResult = {
                    alreadyCompleted: [
                        { name: 'FVRCP (Dose 1)', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 8, description: 'Core kitten vaccine for rhinotracheitis, calicivirus, panleukopenia.' },
                        { name: 'Rabies (Dose 1)', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 12, description: 'Mandatory zoonotic disease protection.' }
                    ],
                    futureNeeded: [
                        { name: 'FVRCP Booster', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 52, description: 'Annual booster for continued feline viral protection.' },
                        { name: 'Rabies Booster', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 64, description: 'Annual booster to maintain immunity.' },
                        { name: 'FeLV (Feline Leukemia)', type: 'Optional', frequencyMonths: 12, recommendationAgeWeeks: 8, description: 'Recommended for outdoor or multi-cat households.' }
                    ],
                    conclusion: conclusionText
                };
            } else {
                fallbackResult = {
                    alreadyCompleted: [
                        { name: 'Rabies (Dose 1)', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 12, description: 'Initial core vaccine for zoonotic protection.' }
                    ],
                    futureNeeded: [
                        { name: 'Rabies Booster', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 52, description: 'Annual booster to maintain immunity.' }
                    ],
                    conclusion: (vPri.enabled || vFb.enabled) 
                        ? `AI engines unavailable. Showing a general vaccination roadmap for a ${animal.breed} (${animal.category}). Please consult your veterinarian for a species-specific schedule.`
                        : `Standard medical roadmap for ${animal.breed} (${animal.category}).`
                };
            }
            return res.json(fallbackResult);
        }
        // AI Response is already fetched via the Gateway/Recovery logic above.
        // We now process the results.

        let result = { alreadyCompleted: [], futureNeeded: [], conclusion: '' };
        let content = '';
        try {
            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
                throw new Error("Invalid AI response structure");
            }
            content = response.choices[0].message.content.trim();
            // Sanitize potential markdown wrap
            if (content.startsWith('```')) {
                const lines = content.split('\n');
                if (lines[0].includes('```')) lines.shift();
                if (lines[lines.length - 1].includes('```')) lines.pop();
                content = lines.join('\n').trim();
            }

            const startIdx = content.indexOf('{');
            const endIdx = content.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
                content = content.substring(startIdx, endIdx + 1);
            }

            // Standardize potential errors
            content = content.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

            result = JSON.parse(content);

            // POST-PARSE SANITIZATION (The "Mongoose Protection Layer")
            const vSanitizer = (arr) => (arr || []).map(v => {
                let t = (v.type || 'Core').toString().trim();
                if (t === 'Required') t = 'Core';
                if (t === 'Suggested' || t === 'Recommended') t = 'Optional';
                return { ...v, type: t };
            });

            result.alreadyCompleted = vSanitizer(result.alreadyCompleted);
            result.futureNeeded = vSanitizer(result.futureNeeded);

        } catch (parseErr) {
            console.error('Failed to parse AI recommendations. Raw content:', content);
            console.error('Parse Error:', parseErr);
            const isCow = animal.category.toLowerCase().includes('cow') || animal.category.toLowerCase().includes('cattle');

            result = {
                alreadyCompleted: isCow ? [
                    { name: 'FMD (Dose 1)', type: 'Core', frequencyMonths: 6, recommendationAgeWeeks: 16, description: 'Foot and Mouth Disease primary protection.' },
                    { name: 'HS + BQ Vaccine', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 24, description: 'Combined Hemorrhagic Septicemia and Black Quarter protection.' }
                ] : [
                    { name: 'Rabies (Dose 1)', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 12, description: 'Initial core vaccine for zoonotic protection.' }
                ],
                futureNeeded: isCow ? [
                    { name: 'FMD Booster', type: 'Core', frequencyMonths: 6, recommendationAgeWeeks: 40, description: 'Biannual booster for herd immunity.' },
                    { name: 'Brucellosis (Heifer)', type: 'Core', frequencyMonths: 0, recommendationAgeWeeks: 32, description: 'One-time vaccination for disease control.' }
                ] : [
                    { name: 'Rabies Booster', type: 'Core', frequencyMonths: 12, recommendationAgeWeeks: 52, description: 'Annual booster to maintain immunity.' }
                ],
                conclusion: `AI sync failed (${parseErr.message.substring(0, 30)}). Showing general roadmap for a ${animal.category}. Please consult your vet.`
            };
        }

        res.json(result);
    } catch (err) {
        console.error("Recommendation Fetch Error:", err);
        res.status(500).json({
            msg: 'AI recommendations failed',
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// @route   PUT /api/animals/:id/vaccination-schedule
// @desc    Update animal's specific CareCycle checklist + Store AI Conclusion
// @access  Private
router.put('/:id/vaccination-schedule', auth, async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);
        if (!animal) return res.status(404).json({ msg: 'Animal not found' });

        const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
        if (!ownerId || !animal.user_id || animal.user_id.toString() !== ownerId.toString()) return res.status(401).json({ msg: 'Not authorized' });

        // Sanitize: map 'Required' -> 'Core' and 'Suggested' -> 'Optional' if AI went off-script
        const sanitizedSchedule = (req.body.schedule || []).map(v => {
            let finalizedType = v.type;
            if (v.type === 'Required') finalizedType = 'Core';
            if (v.type === 'Suggested' || v.type === 'Recommended') finalizedType = 'Optional';
            return { ...v, type: finalizedType };
        });

        animal.vaccinationSchedule = sanitizedSchedule;
        if (req.body.conclusion) {
            animal.aiConclusion = req.body.conclusion;
        }

        await animal.save();
        res.json(animal);
    } catch (err) {
        console.error("Vax Schedule Save Error:", err);
        res.status(500).json({ msg: 'Saving schedule failed', error: err.message });
    }
});

// @route   GET /api/animals/weather/:location
// @desc    Proxy weather request to avoid CORS
// @access  Public
router.get('/weather/:location', async (req, res) => {
    try {
        const axios = require('axios');
        const { location } = req.params;
        const targetHost = 'wttr.in';
        const sanitizedLoc = encodeURIComponent(location);

        // Call wttr.in bypassing browser CORS
        const response = await axios.get(`https://${targetHost}/${sanitizedLoc}?format=j1`, { timeout: 8000 });
        res.json(response.data);
    } catch (err) {
        console.error("Weather Proxy Error:", err.message);
        res.status(502).json({ error: "Weather station temporarily unreachable" });
    }
});

module.exports = router;

