const Animal = require('../models/Animal');
const HealthLog = require('../models/HealthLog');
const MedicalRecord = require('../models/MedicalRecord');
const User = require('../models/User');
const Plan = require('../models/Plan');
const mongoose = require('mongoose');
const { logActivity } = require('../utils/logger');
const { MLEngineeredMonitor, calculateAgeYears, mapActivityLevel, getLimits, getMonitor } = require('../utils/vitalMonitor');
const { getCachedSettings } = require('../utils/settingsCache');
const SystemSettings = require('../models/SystemSettings');
const { OpenAI } = require('openai');
const axios = require('axios');

class AnimalsService {
    static async getAnimals(userId, role, managedBy) {
        const ownerId = role === 'caretaker' ? managedBy : userId;
        return await Animal.find({ user_id: ownerId }).select('-vaccinationSchedule').sort({ createdAt: -1 }).lean();
    }

    static async getUpcomingVaccinations(userId, role, managedBy) {
        const ownerId = role === 'caretaker' ? managedBy : userId;
        return await Animal.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(ownerId) } },
            { $unwind: "$vaccinationSchedule" },
            { $match: { "vaccinationSchedule.status": { $ne: "Completed" }, "vaccinationSchedule.dueDate": { $exists: true } } },
            { $project: { _id: 0, animalId: "$_id", animalName: "$name", breed: "$breed", category: "$category", dob: "$dob", vaccineName: "$vaccinationSchedule.name", dueDate: "$vaccinationSchedule.dueDate", type: "$vaccinationSchedule.type", description: "$vaccinationSchedule.description" } },
            { $sort: { dueDate: 1 } }
        ]);
    }

    static async createAnimal(userId, role, managedBy, data) {
        const ownerId = role === 'caretaker' ? managedBy : userId;
        const user = await User.findById(ownerId);
        if (!user) throw new Error('User not found');

        const userPlan = await Plan.findOne({ code: user.plan, active: true });
        const maxAnimals = userPlan ? userPlan.maxAnimals : 1;
        if (maxAnimals !== -1) {
            const currentCount = await Animal.countDocuments({ user_id: ownerId });
            if (currentCount >= maxAnimals) throw new Error(`Plan limit reached: ${maxAnimals} animal(s).`);
        }

        const animal = new Animal({
            user_id: ownerId,
            name: data.name.trim().substring(0, 100),
            category: data.category.trim(),
            breed: data.breed.trim(),
            gender: data.gender,
            dob: data.dob,
            location: data.location?.trim() || 'Not Specified',
            syncRealTime: true,
            vaccinated: data.vaccinated === true || data.vaccinated === 'true',
            status: 'HEALTHY',
            recentVitals: { temperature: 38.5, heartRate: 60 }
        });
        const saved = await animal.save();
        logActivity('animal_registry', { id: userId, role }, `Added new animal: ${data.name}`);
        return saved;
    }

    static async deleteAnimal(userId, role, animalId) {
        if (role === 'caretaker') throw new Error('Caretakers cannot delete animals.');
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        if (animal.user_id.toString() !== userId.toString()) throw new Error('Not authorized');

        await Animal.findByIdAndDelete(animalId);
        await HealthLog.deleteMany({ animal_id: animalId });
        logActivity('animal_registry', { id: userId, role }, `Removed animal: ${animal.name}`);
    }

    static async updateAnimal(userId, role, managedBy, animalId, data) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        const updateFields = {};
        if (data.name) updateFields.name = data.name.trim().substring(0, 100);
        if (data.category) updateFields.category = data.category.trim();
        if (data.breed) updateFields.breed = data.breed.trim();
        if (data.gender) updateFields.gender = data.gender;
        if (data.dob) updateFields.dob = data.dob;
        if (data.location !== undefined) updateFields.location = data.location.trim();
        if (data.syncRealTime !== undefined) updateFields.syncRealTime = data.syncRealTime === true || data.syncRealTime === 'true';
        if (data.vaccinated !== undefined) updateFields.vaccinated = data.vaccinated === true || data.vaccinated === 'true';

        animal.set(updateFields);
        await animal.save();
        logActivity('animal_registry', { id: userId, role }, `Updated animal details: ${animal.name}`);
        return animal;
    }

    static async getAnimal(userId, role, managedBy, animalId) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        const ageYears = calculateAgeYears(animal.dob);
        const limits = getLimits(animal.category, animal.breed, ageYears, animal.gender);
        const vaxSettings = await getCachedSettings('ai_config_v2');
        const careCycleEnabled = vaxSettings?.chiron?.enabled || vaxSettings?.vaccinePrimary?.enabled || false;

        return { ...animal.toObject(), limits, careCycleEnabled };
    }

    static async getLogs(userId, role, managedBy, animalId) {
        const animal = await Animal.findById(animalId).select('user_id');
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Animal not found');
        return await HealthLog.find({ animal_id: animalId }).sort({ createdAt: -1 }).lean();
    }

    static async addLog(userId, role, managedBy, animalId, data) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        const newLog = new HealthLog({ animal_id: animalId, ...data });
        await newLog.save();

        const tempVal = parseFloat(data.temperature);
        const hrVal = parseInt(data.heartRate);
        const weightVal = data.weight ? parseFloat(data.weight) : (animal.recentVitals?.weight || null);

        if (!animal.recentVitals) animal.recentVitals = {};
        if (!isNaN(tempVal)) animal.recentVitals.temperature = tempVal;
        if (!isNaN(hrVal)) animal.recentVitals.heartRate = hrVal;
        if (weightVal !== null && !isNaN(weightVal)) animal.recentVitals.weight = weightVal;

        const ageYears = calculateAgeYears(animal.dob);
        const profile = { species: animal.category, breed: animal.breed, age_years: ageYears, gender: animal.gender?.toLowerCase() };
        const rawVitals = { hr: !isNaN(hrVal) ? hrVal : 70, rr: parseFloat(data.respiratoryRate) || 20, temp_c: !isNaN(tempVal) ? tempVal : 38.5, spo2: parseFloat(data.spo2) || 98 };
        const activity = mapActivityLevel(data.activityLevel);
        const activeEngine = await getCachedSettings('ai_active_engine') || 'scientist_js';
        let monitorResult;

        if (activeEngine === 'legacy_python') {
            try {
                const logs = await HealthLog.find({ animal_id: animalId }).sort({ createdAt: -1 }).limit(24);
                const history = logs.map(l => ({
                    temperature: parseFloat(l.temperature) || 38.5,
                    heartRate: parseInt(l.heartRate) || 70,
                    activityLevel: parseFloat(l.activityLevel) || 5,
                    respiratoryRate: parseFloat(l.respiratoryRate) || 20
                }));
                
                const pyServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8005';
                const pyRes = await axios.post(`${pyServiceUrl.replace(/\/$/, '')}/predict_anomaly`, { history }, { timeout: 3000 });
                monitorResult = { 
                    status: pyRes.data.status.toUpperCase(), 
                    detail: `V1 CORE (LSTM): ${pyRes.data.method === 'lstm_autoencoder' ? 'Neural Prediction' : 'Range Logic'}`,
                    aiErrorScore: pyRes.data.error_score 
                };
            } catch (err) {
                console.error('[AI_V1] Python Service Unreachable:', err.message);
                monitorResult = { status: 'ALERT', detail: 'V1 CORE: Engine Offline (Fallback Mode)', aiErrorScore: 0.5 };
            }
        } else {
            const monitor = getMonitor(animalId);
            monitorResult = monitor.processTelemetry(profile, rawVitals, activity, parseFloat(data.ambientTemperature) || 22.0);
            monitorResult.detail = `V2 NEURAL: ${monitorResult.detail}`;
        }

        animal.status = monitorResult.status;
        animal.statusDetail = monitorResult.detail;
        animal.activeEngine = activeEngine;
        await animal.save();

        this.processBackgroundTasks(ownerId, animal, monitorResult);
        return { log: newLog, animalStatus: monitorResult.status, detail: monitorResult.detail, engine: activeEngine };
    }

    static async processBackgroundTasks(ownerId, animal, monitorResult) {
        setImmediate(async () => {
            try {
                if (monitorResult.status === 'CRITICAL') {
                    const userRecord = await User.findById(ownerId);
                    if (userRecord && userRecord.settings?.healthAlerts) {
                        const { sendSmartAlert } = require('../utils/notifications');
                        await sendSmartAlert(userRecord, animal, monitorResult.status);
                    }
                }
                const user = await User.findById(ownerId);
                if (user) {
                    const today = new Date();
                    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
                    const lastLog = user.lastLogDate ? new Date(user.lastLogDate) : null;
                    if (!lastLog || lastLog.toDateString() !== today.toDateString()) {
                        user.streakCount = (lastLog && lastLog.toDateString() === yesterday.toDateString()) ? (user.streakCount + 1) : 1;
                        user.lastLogDate = today;
                        if (user.streakCount === 7 && !user.badges.includes('perfect_week')) user.badges.push('perfect_week');
                        await user.save();
                    }
                }
                const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                await HealthLog.deleteMany({ animal_id: animal._id, createdAt: { $lt: sevenDaysAgo } });
            } catch (bgErr) { console.error('Background task error:', bgErr.message); }
        });
    }

    static async reanalyze(userId, role, managedBy, animalId) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString() && role !== 'admin') throw new Error('Not authorized');

        const logs = await HealthLog.find({ animal_id: animalId }).sort({ createdAt: -1 }).limit(24);
        if (logs.length === 0) return { animalStatus: animal.status, msg: 'No logs found' };

        const ageYears = calculateAgeYears(animal.dob);
        const profile = { species: animal.category, breed: animal.breed, age_years: ageYears, gender: animal.gender?.toLowerCase() };
        const activeEngine = await getCachedSettings('ai_active_engine') || 'scientist_js';

        let result = { status: 'HEALTHY', detail: 'No data' };
        if (activeEngine === 'legacy_python') {
            try {
                const history = logs.map(l => ({
                    temperature: parseFloat(l.temperature) || 38.5,
                    heartRate: parseInt(l.heartRate) || 70,
                    activityLevel: parseFloat(l.activityLevel) || 5,
                    respiratoryRate: parseFloat(l.respiratoryRate) || 20
                }));
                const pyServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8005';
                const pyRes = await axios.post(`${pyServiceUrl.replace(/\/$/, '')}/predict_anomaly`, { history }, { timeout: 3000 });
                result = { 
                    status: pyRes.data.status.toUpperCase(), 
                    detail: `V1 Reanalysis: ${pyRes.data.method}`, 
                    aiErrorScore: pyRes.data.error_score 
                };
            } catch (err) {
                result = { status: 'ALERT', detail: 'V1 Reanalysis: Engine Unreachable', aiErrorScore: 0.5 };
            }
        } else {
            const reanalyzeMonitor = getMonitor(animalId);
            for (const log of [...logs].reverse()) {
                const rawVitals = { hr: parseFloat(log.heartRate) || 70, rr: parseFloat(log.respiratoryRate) || 20, temp_c: parseFloat(log.temperature) || 38.5, spo2: parseFloat(log.spo2) || 98 };
                result = reanalyzeMonitor.processTelemetry(profile, rawVitals, mapActivityLevel(log.activityLevel), parseFloat(log.ambientTemperature) || 22.0);
            }
        }

        animal.status = result.status;
        animal.statusDetail = result.detail || 'Analysis complete';
        animal.aiErrorScore = result.aiErrorScore || 0;
        animal.activeEngine = activeEngine;
        await animal.save();
        return { animalStatus: animal.status, detail: animal.statusDetail, aiErrorScore: animal.aiErrorScore, engine: activeEngine };
    }

    static async getRecords(userId, role, managedBy, animalId) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Animal not found');
        return await MedicalRecord.find({ animal_id: animalId }).sort({ createdAt: -1 });
    }

    static async deleteRecord(userId, role, managedBy, recordId) {
        const record = await MedicalRecord.findById(recordId);
        if (!record) throw new Error('Record not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (record.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        await MedicalRecord.findByIdAndDelete(recordId);
        await User.findByIdAndUpdate(ownerId, { $inc: { "usage.storageBytes": -(record.fileSize || 0) } });
        logActivity('medical_vault', { id: userId, role }, `Deleted record: ${record.title}`);
    }

    static async getVaccineRecommendations(userId, role, managedBy, animalId, force) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        if (!force && animal.vaccinationSchedule && animal.vaccinationSchedule.length > 0) {
            return animal.vaccinationSchedule;
        }

        const aiConfigRecord = await SystemSettings.findOne({ key: 'ai_config_v2' });
        const aiConfig = aiConfigRecord?.value || {};
        
        // Use the dedicated Cyclecare (vaccinePrimary) configuration instead of general chatbot primary
        const primary = aiConfig.vaccinePrimary || aiConfig.primary || { enabled: false };
        if (!primary.enabled || !primary.apiKey) throw new Error('Vaccine Intelligence Engine is currently inactive. Please enable AI generation in the Admin Portal under Arion Configuration > Cyclecare.');

        const ageYears = calculateAgeYears(animal.dob);
        const vaccinePrompt = aiConfig.vaccinePrompt || "Recommend a standard vaccination schedule. Avoid hallucinating brand names.";

        // Robust initialization
        const baseUrl = primary.baseURL && primary.baseURL.trim() !== '' ? primary.baseURL.trim() : undefined;
        const openai = new OpenAI({ apiKey: primary.apiKey, baseURL: baseUrl });
        
        // Fix: Use 'modelId' (the actual model string like llama-3) instead of 'id' (the database unique ID)
        const modelObj = primary.models?.find(m => (m.type === 'text' || m.type === 'text+vision')) || primary.models?.[0];
        const modelId = modelObj?.modelId || modelObj?.id || 'gpt-4';

        const messages = [
            { role: 'system', content: `You are Aranya Vaccine Intelligence (Scientist V3). Guideline: ${vaccinePrompt}\n\nIMPORTANT: Return ONLY a raw JSON object with a "schedule" array. No conversational text. No markdown blocks.\nArray Items Schema: { name: string, type: 'Core' | 'Optional', frequencyLabel: string, ageRangeLabel: string, description: string }` },
            { role: 'user', content: `Generate a roadmap for a ${animal.category}, breed: ${animal.breed}, gender: ${animal.gender}, age: ${ageYears.toFixed(1)} years.` }
        ];

        try {
            console.log(`[VaccineGen] Invoking AI Model: ${modelId} at ${baseUrl || 'default-openai'}`);
            const completion = await openai.chat.completions.create({ model: modelId, messages, temperature: 0.1 });
            const responseText = completion.choices[0].message.content;
            if (!responseText) throw new Error("Aranya Intelligence returned an empty response.");

            // Robust JSON Extraction
            let parsed;
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                const jsonString = jsonMatch ? jsonMatch[0] : responseText;
                parsed = JSON.parse(jsonString);
            } catch (pErr) {
                console.error('[VaccineGen] Extraction Fail. Raw Response:', responseText);
                throw new Error("Intelligence generated a non-structured response. Please try again.");
            }

            const schedule = parsed.schedule || parsed.recommendations || (Array.isArray(parsed) ? parsed : []);
            console.log(`[VaccineGen] AI suggested ${schedule.length} items.`);
            
            const formattedSchedule = schedule.map(s => ({
                name: (s.name || s.vaccine || 'Unnamed Vaccine').toString(),
                type: s.type === 'Optional' ? 'Optional' : 'Core',
                status: 'Pending',
                frequencyLabel: (s.frequencyLabel || 'Periodic').toString(),
                ageRangeLabel: (s.ageRangeLabel || 'Maintenance').toString(),
                description: (s.description || '').toString(),
                dateSet: new Date()
            }));

            animal.vaccinationSchedule = formattedSchedule;
            await animal.save();
            logActivity('animal_registry', { id: userId, role }, `Generated vaccination roadmap via ${modelId} for: ${animal.name}`);
            
            // Format response to match AnimalProfile.jsx expectations
            return {
                alreadyCompleted: [], // Suggestions are usually future-dated
                futureNeeded: formattedSchedule,
                conclusion: animal.aiConclusion || "Roadmap successfully generated by Aranya Intelligence."
            };
        } catch (err) {
            console.error('[VaccineGen] Fail:', err.message);
            throw new Error(err.message.includes('apiKey') ? 'Invalid AI Configuration' : `Intelligence Desync: ${err.message || 'Engine timed out'}`);
        }
    }

    static async updateVaccinationSchedule(userId, role, managedBy, animalId, schedule, conclusion) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        animal.vaccinationSchedule = schedule;
        if (conclusion !== undefined) {
            animal.aiConclusion = conclusion;
        }
        
        await animal.save();
        logActivity('animal_registry', { id: userId, role }, `Manually updated vaccination schedule for: ${animal.name}`);
        return animal;
    }

    static async reanalyzeBatch(userId, role, managedBy) {
        const ownerId = role === 'caretaker' ? managedBy : userId;
        const animals = await Animal.find({ user_id: ownerId });
        const results = [];
        for (const animal of animals) {
            try {
                const res = await this.reanalyze(userId, role, managedBy, animal._id);
                results.push({ id: animal._id, name: animal.name, ...res });
            } catch (err) {
                results.push({ id: animal._id, name: animal.name, error: err.message });
            }
        }
        return results;
    }

    static async addBulkLogs(userId, role, managedBy, animalId, logs) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        if (!Array.isArray(logs)) throw new Error('Logs must be an array');
        const newLogs = await HealthLog.insertMany(logs.map(l => ({ ...l, animal_id: animalId })));
        
        // Reanalyze after bulk import to update current status
        const analysis = await this.reanalyze(userId, role, managedBy, animalId);
        return { logs: newLogs, ...analysis };
    }

    static async updateVaccinationStatus(userId, role, managedBy, animalId, vaccinated) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        animal.vaccinated = !!vaccinated;
        await animal.save();
        logActivity('animal_registry', { id: userId, role }, `Updated vaccination status for ${animal.name}: ${animal.vaccinated}`);
        return animal;
    }

    static async updateVitals(userId, role, managedBy, animalId, vitals) {
        const animal = await Animal.findById(animalId);
        if (!animal) throw new Error('Animal not found');
        const ownerId = role === 'caretaker' ? managedBy : userId;
        if (animal.user_id.toString() !== ownerId.toString()) throw new Error('Not authorized');

        if (!animal.recentVitals) animal.recentVitals = {};
        if (vitals.temperature) animal.recentVitals.temperature = parseFloat(vitals.temperature);
        if (vitals.heartRate) animal.recentVitals.heartRate = parseInt(vitals.heartRate);
        if (vitals.weight) animal.recentVitals.weight = parseFloat(vitals.weight);
        
        await animal.save();
        logActivity('animal_registry', { id: userId, role }, `Updated vitals for ${animal.name}`);
        return animal;
    }

    static async getWeather(location) {
        if (!location || location === 'Not Specified') throw new Error('Location not provided');
        const apiKey = process.env.WEATHER_API_KEY;
        if (!apiKey) {
            // Mock weather if no API key
            return {
                main: { temp: 22, humidity: 45 },
                weather: [{ description: 'partly cloudy', main: 'Clouds' }],
                name: location,
                isMock: true
            };
        }
        try {
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`);
            const data = response.data;
            
            // Compatibility mapping for frontend (which expects current_condition[0].temp_C)
            if (data.main && data.main.temp !== undefined) {
                data.current_condition = [{
                    temp_C: data.main.temp.toString(),
                    weatherDesc: data.weather?.[0]?.description ? [{ value: data.weather[0].description }] : []
                }];
            }
            
            return data;
        } catch (err) {
            console.error("Weather Proxy Error:", err.message);
            throw new Error("Weather station temporarily unreachable");
        }
    }
}

module.exports = AnimalsService;
