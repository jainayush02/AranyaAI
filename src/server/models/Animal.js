const mongoose = require('mongoose');

const animalSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please provide an animal name or ID'],
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Please provide a category (e.g., Cow, Dog, Cat, Horse)']
    },
    breed: {
        type: String,
        required: [true, 'Please specify the breed']
    },
    status: {
        type: String,
        enum: ['Healthy', 'Warning', 'Critical', 'HEALTHY', 'ALERT', 'CRITICAL'],
        default: 'HEALTHY'
    },
    statusDetail: {
        type: String,
        default: 'System Stable'
    },
    aiErrorScore: {
        type: Number,
        default: 0
    },

    gender: {
        type: String,
        enum: ['Male', 'Female'],
        required: [true, 'Please specify the animal gender']
    },
    dob: {
        type: Date,
        required: false
    },
    vaccinated: {
        type: Boolean,
        default: false
    },
    recentVitals: {
        temperature: { type: Number, default: 38.5 }, // Default to a normal temp
        heartRate: { type: Number, default: 60 }, // Default to a normal heart rate
        weight: { type: Number }
    },
    location: {
        type: String,
        default: 'Not Specified'
    },
    syncRealTime: {
        type: Boolean,
        default: true
    },
    vaccinationSchedule: [{
        name: { type: String, required: true },
        type: { type: String, enum: ['Core', 'Optional'], default: 'Core' },
        status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
        lastDate: { type: Date },
        dueDate: { type: Date },
        frequencyMonths: { type: Number },
        description: { type: String },
        dateSet: { type: Date, default: Date.now }
    }],
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

animalSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('Animal', animalSchema);
