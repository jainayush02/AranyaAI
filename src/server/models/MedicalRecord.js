const mongoose = require('mongoose');

const medicalRecordSchema = new mongoose.Schema({
    animal_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Animal',
        required: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recordType: {
        type: String,
        default: 'General',
        enum: ['Vaccination', 'Lab Results', 'Prescription', 'Medical Report', 'General']
    },
    title: {
        type: String,
        default: 'New Medical Record'
    },
    fileUrl: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        default: 0
    },
    ocrData: {
        text: String,
        parsedMeta: mongoose.Schema.Types.Mixed
    },
    summary: {
        type: String,
        trim: true
    },
    vetName: String,
    medications: [{
        name: String,
        dosage: String,
        frequency: String
    }],
    visitDate: Date
}, {
    timestamps: true
});

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
