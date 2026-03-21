const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    price: { type: Number, default: 0 },
    
    // Limits & Features
    maxAnimals: { type: Number, default: 3 }, // -1 for unlimited
    dailyChatMessages: { type: Number, default: 5 }, // -1 for unlimited
    dailyImageUploads: { type: Number, default: 0 },
    medicalVaultStorageMB: { type: Number, default: 10 },
    maxCareCircleMembers: { type: Number, default: 0 },
    
    // Toggles
    allowExport: { type: Boolean, default: false },
    allowBulkImport: { type: Boolean, default: false },
    allowAdvancedAI: { type: Boolean, default: false },
    
    // Status
    isDefault: { type: Boolean, default: false }, // If true, new users get this
    isRecommended: { type: Boolean, default: false },
    active: { type: Boolean, default: true } 
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);
