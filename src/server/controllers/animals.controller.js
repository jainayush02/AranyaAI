const AnimalsService = require('../services/animals.service');
const ImageKit = require('imagekit');
const Animal = require('../models/Animal');
const User = require('../models/User');
const Plan = require('../models/Plan');
const MedicalRecord = require('../models/MedicalRecord');
const { logActivity } = require('../utils/logger');

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

class AnimalsController {
    static async getAnimals(req, res, next) {
        try {
            const animals = await AnimalsService.getAnimals(req.user.id, req.user.role, req.user.managedBy);
            res.json(animals);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async getUpcomingVaccinations(req, res, next) {
        try {
            const upcoming = await AnimalsService.getUpcomingVaccinations(req.user.id, req.user.role, req.user.managedBy);
            res.json(upcoming);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async createAnimal(req, res, next) {
        try {
            const animal = await AnimalsService.createAnimal(req.user.id, req.user.role, req.user.managedBy, req.body);
            res.json(animal);
        } catch (err) {
            res.status(err.message.includes('Limit') ? 403 : 400).json({ msg: err.message });
        }
    }

    static async deleteAnimal(req, res, next) {
        try {
            await AnimalsService.deleteAnimal(req.user.id, req.user.role, req.params.id);
            res.json({ msg: 'Animal removed' });
        } catch (err) {
            res.status(err.message.includes('Not authorized') ? 401 : (err.message.includes('caretaker') ? 403 : 500)).send(err.message);
        }
    }

    static async updateAnimal(req, res, next) {
        try {
            const animal = await AnimalsService.updateAnimal(req.user.id, req.user.role, req.user.managedBy, req.params.id, req.body);
            res.json(animal);
        } catch (err) {
            res.status(err.message.includes('Not authorized') ? 401 : 500).send(err.message);
        }
    }

    static async getAnimal(req, res, next) {
        try {
            const animal = await AnimalsService.getAnimal(req.user.id, req.user.role, req.user.managedBy, req.params.id);
            res.json(animal);
        } catch (err) {
            res.status(err.message === 'Animal not found' ? 404 : 401).send(err.message);
        }
    }

    static async getLogs(req, res, next) {
        try {
            const logs = await AnimalsService.getLogs(req.user.id, req.user.role, req.user.managedBy, req.params.id);
            res.json(logs);
        } catch (err) {
            res.status(err.message === 'Animal not found' ? 404 : 500).send(err.message);
        }
    }

    static async addLog(req, res, next) {
        try {
            const data = await AnimalsService.addLog(req.user.id, req.user.role, req.user.managedBy, req.params.id, req.body);
            res.json({
                log: data.log,
                animalStatus: data.animalStatus,
                detail: data.detail,
                engine: data.engine,
                msg: `Health log saved. ${data.engine === 'scientist_js' ? 'V2 Neural' : 'V1 Core'} analysis complete.`
            });
        } catch (err) {
            res.status(err.message === 'Animal not found' ? 404 : 500).send(err.message);
        }
    }

    static async reanalyze(req, res, next) {
        try {
            const data = await AnimalsService.reanalyze(req.user.id, req.user.role, req.user.managedBy, req.params.id);
            res.json(data);
        } catch (err) {
            res.status(500).json({ msg: err.message });
        }
    }

    static async getRecords(req, res, next) {
        try {
            const records = await AnimalsService.getRecords(req.user.id, req.user.role, req.user.managedBy, req.params.id);
            res.json(records);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async uploadRecord(req, res, next) {
        try {
            const animal = await Animal.findById(req.params.id);
            if (!animal) return res.status(404).json({ msg: 'Animal not found' });
            const ownerId = req.user.role === 'caretaker' ? req.user.managedBy : req.user.id;
            if (animal.user_id.toString() !== ownerId.toString()) return res.status(404).json({ msg: 'Animal not found' });

            if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });

            const user = await User.findById(ownerId);
            const userPlan = await Plan.findOne({ code: user.plan, active: true });
            const maxStorageMB = userPlan ? userPlan.medicalVaultStorageMB : 10;
            if (maxStorageMB !== -1) {
                const records = await MedicalRecord.find({ user_id: ownerId });
                const currentTotalBytes = records.reduce((acc, r) => acc + (r.fileSize || 0), 0);
                if (currentTotalBytes + req.file.size > maxStorageMB * 1024 * 1024) return res.status(403).json({ msg: 'Storage limit reached!' });
            }

            const uploadResponse = await imagekit.upload({ file: req.file.buffer, fileName: `${Date.now()}-${req.file.originalname}`, folder: '/aranya_medical_vault' });
            const newRecord = new MedicalRecord({ animal_id: req.params.id, user_id: ownerId, recordType: req.body.recordType || 'General', title: req.body.title || req.file.originalname, fileUrl: uploadResponse.url, fileSize: req.file.size });
            await newRecord.save();
            await User.findByIdAndUpdate(ownerId, { $inc: { "usage.storageBytes": req.file.size } });
            await logActivity('medical_vault', req.user, `Uploaded record for animal: ${animal.name}`);
            res.json(newRecord);
        } catch (err) {
            res.status(500).json({ msg: 'Cloud storage upload failed', error: err.message });
        }
    }

    static async deleteRecord(req, res, next) {
        try {
            await AnimalsService.deleteRecord(req.user.id, req.user.role, req.user.managedBy, req.params.recordId);
            res.json({ msg: 'Record removed' });
        } catch (err) {
            res.status(500).send(err.message);
        }
    }

    static async getVaccineRecommendations(req, res, next) {
        try {
            console.log(`[VaccineRecs] Generating for animal: ${req.params.id} (Forced: ${req.query.force || 'false'})`);
            const recommendations = await AnimalsService.getVaccineRecommendations(
                req.user.id,
                req.user.role,
                req.user.managedBy,
                req.params.id,
                req.query.force === 'true'
            );
            res.json(recommendations);
        } catch (err) {
            console.error('[VaccineRecs] Critical Error:', err.message);
            res.status(500).json({ 
                msg: err.message || 'Failed to generate vaccine roadmap',
                message: err.message || 'Failed to generate vaccine roadmap' 
            });
        }
    }

    static async updateVaccinationSchedule(req, res, next) {
        try {
            const { schedule, conclusion } = req.body;
            const updatedAnimal = await AnimalsService.updateVaccinationSchedule(
                req.user.id,
                req.user.role,
                req.user.managedBy,
                req.params.id,
                schedule,
                conclusion
            );
            res.json(updatedAnimal);
        } catch (err) {
            console.error('[VaccineUpdate] Error:', err.message);
            res.status(500).json({ msg: err.message || 'Failed to update vaccination schedule' });
        }
    }

    static async reanalyzeBatch(req, res, next) {
        try {
            const results = await AnimalsService.reanalyzeBatch(req.user.id, req.user.role, req.user.managedBy);
            res.json(results);
        } catch (err) {
            res.status(500).json({ msg: err.message });
        }
    }

    static async addBulkLogs(req, res, next) {
        try {
            const result = await AnimalsService.addBulkLogs(req.user.id, req.user.role, req.user.managedBy, req.params.id, req.body.logs);
            res.json(result);
        } catch (err) {
            res.status(err.message === 'Animal not found' ? 404 : 500).send(err.message);
        }
    }

    static async updateVaccinationStatus(req, res, next) {
        try {
            const animal = await AnimalsService.updateVaccinationStatus(req.user.id, req.user.role, req.user.managedBy, req.params.id, req.body.vaccinated);
            res.json(animal);
        } catch (err) {
            res.status(err.message === 'Animal not found' ? 404 : 500).send(err.message);
        }
    }

    static async updateVitals(req, res, next) {
        try {
            const animal = await AnimalsService.updateVitals(req.user.id, req.user.role, req.user.managedBy, req.params.id, req.body);
            res.json(animal);
        } catch (err) {
            res.status(err.message === 'Animal not found' ? 404 : 500).send(err.message);
        }
    }

    static async getWeather(req, res, next) {
        try {
            const weather = await AnimalsService.getWeather(req.params.location);
            res.json(weather);
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    }
}

module.exports = AnimalsController;
