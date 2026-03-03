const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    full_name: { type: String, required: false },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: false }, // Password optional if using OTP only
    mobile: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    settings: {
        emailNotifications: { type: Boolean, default: true },
        healthAlerts: { type: Boolean, default: true },
        weeklyReports: { type: Boolean, default: true },
        language: { type: String, enum: ['en', 'hi', 'gu'], default: 'en' },
    },
    profilePic: { type: String, default: '' },
    otp: { type: String },
    otpExpires: { type: Date },
    lastOtpSentAt: { type: Date },
    isVerified: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    loginCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
