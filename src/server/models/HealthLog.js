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
    weight: {
        type: Number,
        required: false
    },
    activityLevel: {
        type: Number, // 1 to 10
        required: true
    },
    appetite: {
        type: Number, // 1 to 5
        required: true
    },
    notes: {
        type: String,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('HealthLog', healthLogSchema);
