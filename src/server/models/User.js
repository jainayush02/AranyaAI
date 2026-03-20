const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    full_name: { type: String, required: false },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required: false }, // Password optional if using OTP only
    mobile: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ['admin', 'user', 'caretaker'], default: 'user' },
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    settings: {
        emailNotifications: { type: Boolean, default: true },
        healthAlerts: { type: Boolean, default: true },
        weeklyReports: { type: Boolean, default: true },
        language: { type: String, enum: ['en', 'hi', 'gu'], default: 'en' },
        region: { type: String, default: 'in' },
    },
    profilePic: { type: String, default: '' },
    
    // Security & Auth
    otp: { type: String },
    otpExpires: { type: Date },
    lastOtpSentAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    failedOtpAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    
    isVerified: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    loginCount: { type: Number, default: 0 },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say', ''], default: '' },
    dateOfBirth: { type: Date, default: null },
    age: { type: Number, default: null },
    streakCount: { type: Number, default: 0 },
    lastLogDate: { type: Date, default: null },
    badges: [{ type: String }] // For gamified achievements
}, { timestamps: true });

/**
 * Pre-save Hook: Auto-hash password before saving to DB
 */
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

/**
 * Helper: Compare password in constant-time
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Helper: Check if account is currently locked
 */
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

module.exports = mongoose.model('User', userSchema);
