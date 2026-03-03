const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    type: { type: String, enum: ['registration', 'price', 'alert', 'support', 'doc', 'animal', 'admin'], default: 'admin' },
    user: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    detail: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
