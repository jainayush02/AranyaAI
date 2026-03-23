const mongoose = require('mongoose');

const healthLogSchema = new mongoose.Schema({
    animal_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Animal',
        required: true
    },
    temperature: {
        type: Number,
        required: true
    },
    heartRate: {
        type: Number,
        required: true
    },
    spo2: {
        type: Number,
        required: false
    },
    respiratoryRate: {
        type: Number,
        required: false
    },
    ambientTemperature: {
        type: Number,
        required: false
    },
    weight: {
        type: Number,
        required: false
    },
    activityLevel: {
        type: Number, // 1 to 5
        required: true
    },
    notes: {
        type: String,
        trim: true
    }
}, { timestamps: true });

healthLogSchema.index({ animal_id: 1, createdAt: -1 });

module.exports = mongoose.model('HealthLog', healthLogSchema);
