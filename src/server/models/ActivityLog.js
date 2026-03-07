const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
    type: { type: String, enum: ['registration', 'price', 'alert', 'support', 'doc', 'animal', 'admin', 'login', 'profile', 'chat'], default: 'admin' },
    user: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    detail: { type: String, required: true },
}, { timestamps: true });

// Auto-delete records older than 10 days (864,000 seconds)
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 864000 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
