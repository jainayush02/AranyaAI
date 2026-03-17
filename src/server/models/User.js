const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    full_name: { type: String, required: false },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: false }, // Password optional if using OTP only
    mobile: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ['admin', 'user', 'caretaker'], default: 'user' },
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
    loginCount: { type: Number, default: 0 },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say', ''], default: '' },
    dateOfBirth: { type: Date, default: null },
    age: { type: Number, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
