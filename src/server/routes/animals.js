const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const AnimalsController = require('../controllers/animals.controller');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Invalid file type. Only JPG, PNG, WEBP, and PDF are allowed.'), false);
    }
});

// @route   GET /api/animals
router.get('/', auth, AnimalsController.getAnimals);

// @route   GET /api/animals/vaccinations/upcoming
router.get('/vaccinations/upcoming', auth, AnimalsController.getUpcomingVaccinations);

// @route   POST /api/animals
router.post('/', auth, AnimalsController.createAnimal);

// @route   DELETE /api/animals/:id
router.delete('/:id', auth, AnimalsController.deleteAnimal);

// @route   PUT /api/animals/:id
router.put('/:id', auth, AnimalsController.updateAnimal);

// @route   GET /api/animals/:id
router.get('/:id', auth, AnimalsController.getAnimal);

// @route   GET /api/animals/:id/logs
router.get('/:id/logs', auth, AnimalsController.getLogs);

// @route   POST /api/animals/:id/reanalyze
router.post('/:id/reanalyze', auth, AnimalsController.reanalyze);

// @route   POST /api/animals/:id/logs
router.post('/:id/logs', auth, AnimalsController.addLog);

// @route   GET /api/animals/:id/records
router.get('/:id/records', auth, AnimalsController.getRecords);

// @route   GET /api/animals/:id/vaccine-recommendations
router.get('/:id/vaccine-recommendations', auth, AnimalsController.getVaccineRecommendations);

// @route   PUT /api/animals/:id/vaccination-schedule
router.put('/:id/vaccination-schedule', auth, AnimalsController.updateVaccinationSchedule);

// @route   POST /api/animals/:id/records
router.post('/:id/records', [auth, upload.single('recordFile')], AnimalsController.uploadRecord);

// @route   DELETE /api/animals/:id/records/:recordId
router.delete('/:id/records/:recordId', auth, AnimalsController.deleteRecord);

// @route   POST /api/animals/reanalyze-batch
router.post('/reanalyze-batch', auth, AnimalsController.reanalyzeBatch);

// @route   POST /api/animals/:id/bulk-logs
router.post('/:id/bulk-logs', auth, AnimalsController.addBulkLogs);

// @route   PUT /api/animals/:id/vaccination
router.put('/:id/vaccination', auth, AnimalsController.updateVaccinationStatus);

// @route   PUT /api/animals/:id/vitals
router.put('/:id/vitals', auth, AnimalsController.updateVitals);

// @route   GET /api/animals/weather/:location
router.get('/weather/:location', AnimalsController.getWeather);

module.exports = router;
