const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    price: { type: Number, required: true, default: 0 },
    maxAnimals: { type: Number, default: 3 },
    dailyChatMessages: { type: Number, default: 5 },
    dailyImageUploads: { type: Number, default: 0 },
    medicalVaultStorageMB: { type: Number, default: 10 },
    maxCareCircleMembers: { type: Number, default: 0 },
    allowExport: { type: Boolean, default: false },
    allowBulkImport: { type: Boolean, default: false },
    allowAdvancedAI: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Plan', PlanSchema);
