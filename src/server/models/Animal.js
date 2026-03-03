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
    breed: {
        type: String,
        required: [true, 'Please specify the breed']
    },
    status: {
        type: String,
        enum: ['Healthy', 'Warning', 'Critical'],
        default: 'Healthy'
    },
    recentVitals: {
        temperature: { type: Number, default: 38.5 }, // Default to a normal temp
        heartRate: { type: Number, default: 60 } // Default to a normal heart rate
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Animal', animalSchema);
