const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const ActivityLog = require('../models/ActivityLog');
const MedicalRecord = require('../models/MedicalRecord');
const Plan = require('../models/Plan');
const { logActivity } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // Max 10 attempts in 15 mins (slightly more generous for human error)
    message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

// ── JWT Auth Middleware (for protected routes) ──
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// Initialize Google OAuth Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Initialize Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GOOGLE_EMAIL_USER,
        pass: process.env.GOOGLE_EMAIL_PASS
    }
});

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

// ── In-memory brute-force store (per IP) ──────────────────────────────────
// Structure: { [ip]: { attempts: number, lockedUntil: Date|null } }
const adminLoginAttempts = new Map();
const MAX_ADMIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function getClientIP(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

function checkAdminRateLimit(ip) {
    const record = adminLoginAttempts.get(ip);
    if (!record) return { blocked: false, attemptsLeft: MAX_ADMIN_ATTEMPTS };
    if (record.lockedUntil && record.lockedUntil > Date.now()) {
        const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
        return { blocked: true, minutesLeft };
    }
    // Lock expired — reset
    if (record.lockedUntil && record.lockedUntil <= Date.now()) {
        adminLoginAttempts.delete(ip);
        return { blocked: false, attemptsLeft: MAX_ADMIN_ATTEMPTS };
    }
    return { blocked: false, attemptsLeft: MAX_ADMIN_ATTEMPTS - record.attempts };
}

function recordFailedAdminAttempt(ip) {
    const record = adminLoginAttempts.get(ip) || { attempts: 0, lockedUntil: null };
    record.attempts += 1;
    if (record.attempts >= MAX_ADMIN_ATTEMPTS) {
        record.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    adminLoginAttempts.set(ip, record);
}

function clearAdminAttempts(ip) {
    adminLoginAttempts.delete(ip);
}

// Helper to generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Multer config - Use memory storage for serverless compatibility (Vercel/Netlify)
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit for Base64 efficiency
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb('Error: Images Only!');
        }
    }
});

// @route POST /api/auth/request-otp
// @route POST /api/auth/request-otp
router.post('/request-otp', authLimiter, async (req, res) => {
    try {
        const { email, mobile, type } = req.body; // type: 'register' or 'login'
        const identifier = email || mobile;

        if (!identifier) {
            return res.status(400).json({ message: 'Email or Mobile is required' });
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 90 * 1000); // 90 seconds

        let user = await User.findOne({ $or: [{ email: identifier }, { mobile: identifier }] });

        // Enforce 60s resend delay
        if (user && user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) {
                const waitSec = Math.ceil(60 - timePassed);
                return res.status(429).json({ message: `Please wait ${waitSec} seconds before requesting a new OTP.` });
            }
        }

        if (type === 'register' && user && user.isVerified) {
            return res.status(400).json({ message: 'User already exists and is verified' });
        }

        if (type === 'login' && !user) {
            // Privacy: Don't reveal account doesn't exist, but don't proceed to save
            return res.status(200).json({ message: 'If an account is associated, an OTP has been sent.', identifier });
        }

        if (!user) {
            user = new User({
                email: identifier.includes('@') ? identifier : undefined,
                mobile: !identifier.includes('@') ? identifier : undefined,
                isVerified: false
            });
        }

        user.otp = otp;
        user.otpExpires = otpExpires;
        user.lastOtpSentAt = new Date(); // Track when it was sent
        await user.save();

        // ── OTP SENDING ──
        if (mobile) {
            if (twilioClient) {
                try {
                    const formattedNumber = mobile.startsWith('+') ? mobile : `+${mobile.replace(/\D/g, '')}`;
                    await twilioClient.messages.create({
                        body: `[Aranya AI] Your verification code is: ${otp}. Valid for 90 seconds.`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: formattedNumber
                    });
                    console.log(`[OTP] SMS sent to ${formattedNumber}`);
                } catch (smsErr) {
                    console.error('[OTP] Twilio Error:', smsErr.message);
                    console.warn(`[OTP] Failed to send SMS to ${mobile}. User should retry.`);
                }
            } else {
                console.warn('[OTP] Twilio not configured. SMS delivery unavailable.');
                console.warn(`[OTP] OTP generated for ${mobile} but could not be delivered.`);
            }
        } else if (email) {
            // Email OTP
            try {
                const mailOptions = {
                    from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
                    to: email,
                    subject: 'Verification Code - Aranya AI',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                            <h2 style="color: #2D6A4F; text-align: center;">Welcome to Aranya AI</h2>
                            <p>Hello,</p>
                            <p>To access your Aranya AI account, please use the verification code below:</p>
                            <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2D6A4F;">
                                ${otp}
                            </div>
                            <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="text-align: center; color: #888; font-size: 12px;">&copy; 2024 Aranya AI. All rights reserved.</p>
                        </div>
                    `
                };
                await transporter.sendMail(mailOptions);
                console.log(`[OTP] Email sent to ${email}`);
            } catch (mailErr) {
                console.error('[OTP] Mail Error:', mailErr.message);
                console.warn(`[OTP] Failed to send email to ${email}. User should retry.`);
            }
        }

        res.status(200).json({ message: 'OTP sent successfully', identifier });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/register
// @route POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, mobile, password, full_name, otp } = req.body;

        if (!otp) {
            return res.status(400).json({ message: 'OTP is required' });
        }

        const identifier = email || mobile;
        let user = await User.findOne({
            $or: [
                email ? { email } : null,
                mobile ? { mobile } : null
            ].filter(Boolean)
        });

        if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Password hashing is now handled in User model pre-save hook
        if (password) {
            user.password = password;
        }

        user.full_name = full_name || user.full_name || '';
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;

        await user.save();

        // Log new registration activity
        try {
            await ActivityLog.create({
                type: 'registration',
                user: full_name || email || mobile || 'New User',
                detail: `New user registered: ${full_name || ''} (${email || mobile || 'unknown'})`
            });
        } catch (_) { }

        const payload = { user: { id: user.id, role: user.role, managedBy: user.managedBy } };
        const secret = process.env.JWT_SECRET;
        if (!secret) { console.error('[SECURITY] JWT_SECRET not set!'); return res.status(500).json({ message: 'Server configuration error.' }); }

        // Users get 24h sessions (Admins are handled separately)
        jwt.sign(payload, secret, { expiresIn: '24h' }, (err, token) => {
            if (err) throw err;
            res.status(201).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    mobile: user.mobile,
                    role: user.role,
                    full_name: user.full_name,
                    profilePic: user.profilePic || ''
                }
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/login
// @route POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, mobile, password, otp } = req.body;

        let user;
        if (email || mobile) {
            user = await User.findOne({
                $or: [
                    email ? { email } : null,
                    mobile ? { mobile } : null
                ].filter(Boolean)
            });
        }

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (user.blocked || (user.lockUntil && user.lockUntil > Date.now())) {
            const msg = user.blocked ? 'Your account has been suspended.' : 'Too many failed attempts. Account locked for 15 minutes.';
            return res.status(403).json({ message: msg });
        }

        // Login via OTP
        if (otp) {
            if (user.otp === otp && user.otpExpires > Date.now()) {
                // OTP match - Reset failed attempts
                user.failedOtpAttempts = 0;
                user.otp = undefined;
                user.otpExpires = undefined;
                user.isVerified = true;
            } else {
                // Brute force protection for OTP
                user.failedOtpAttempts = (user.failedOtpAttempts || 0) + 1;
                if (user.failedOtpAttempts >= 5) {
                    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await user.save();
                return res.status(400).json({ message: 'Invalid or expired code.' });
            }
        }
        // Login via Password
        else if (password) {
            if (!user.password) {
                return res.status(400).json({ message: 'No password found. Use OTP to sign in.' });
            }
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
                if (user.failedLoginAttempts >= 5) {
                    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await user.save();
                return res.status(401).json({ message: 'Invalid credentials.' });
            }
            // Success - Reset counters
            user.failedLoginAttempts = 0;
            user.lockUntil = null;
        } else {
            return res.status(400).json({ message: 'Password or code required' });
        }

        if (user.blocked) {
            return res.status(403).json({ message: 'Your account has been suspended. Please contact support.' });
        }

        // Track login metrics for admin CRM
        user.lastLoginAt = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        try {
            await logActivity('login', user, `User logged in using ${password ? 'password' : 'OTP'}`);
        } catch (_) { }

        const payload = { user: { id: user.id, role: user.role, managedBy: user.managedBy } };
        const secret = process.env.JWT_SECRET;
        if (!secret) { console.error('[SECURITY] JWT_SECRET not set!'); return res.status(500).json({ message: 'Server configuration error.' }); }
        jwt.sign(payload, secret, { expiresIn: '24h' }, (err, token) => {
            if (err) throw err;
            res.status(200).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    mobile: user.mobile,
                    role: user.role,
                    full_name: user.full_name,
                    profilePic: user.profilePic || ''
                }
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ═══════════════════════════════════════════════════════════
// @route POST /api/auth/admin-login
// @desc  Hardened admin-only login
//        — role enforcement (must be 'admin')
//        — password-only (no OTP bypass)
//        — brute-force lockout: 5 attempts → 15-min ban
//        — constant-time bcrypt to prevent timing attacks
//        — role embedded in JWT for downstream middleware
// ═══════════════════════════════════════════════════════════
// @route POST /api/auth/admin-login
router.post('/admin-login', authLimiter, async (req, res) => {
    const ip = getClientIP(req);

    // 1. Rate-limit check BEFORE touching the DB
    const limitCheck = checkAdminRateLimit(ip);
    if (limitCheck.blocked) {
        return res.status(429).json({
            message: `Too many failed attempts. Try again in ${limitCheck.minutesLeft} minute(s).`
        });
    }

    // Generic fail helper — always runs bcrypt.compare even for missing users
    // to prevent user-enumeration via timing differences
    const DUMMY_HASH = '$2a$10$dummyhashfortimingattackprevention..........';
    const genericFail = async () => {
        await bcrypt.compare('dummy_password_for_timing', DUMMY_HASH);
        recordFailedAdminAttempt(ip);
        const remaining = MAX_ADMIN_ATTEMPTS - (adminLoginAttempts.get(ip)?.attempts || 0);
        const msg = remaining <= 0
            ? `Account locked for 15 minutes due to too many failed attempts.`
            : `Invalid credentials. ${remaining} attempt(s) remaining.`;
        return res.status(401).json({ message: msg });
    };

    try {
        const { email, password } = req.body;

        // 2. Both fields required — no graceful fallback
        if (!email || !password) {
            return await genericFail();
        }

        // 3. Find user by email only (admin accounts use email)
        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // 4. Role gate — must exist AND be 'admin'
        if (!user || user.role !== 'admin') {
            return await genericFail();
        }

        // 5. Must have a password set
        if (!user.password) {
            return await genericFail();
        }

        // 6. Constant-time bcrypt comparison
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return await genericFail();
        }

        // 7. Success — clear lockout counter
        clearAdminAttempts(ip);

        // 8. Issue JWT with role embedded (so API middleware can gate admin routes)
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('[SECURITY] JWT_SECRET not set in environment!');
            return res.status(500).json({ message: 'Server configuration error.' });
        }

        const payload = { user: { id: user.id, role: user.role } };
        try {
            await logActivity('admin', user, `Administrator logged in from IP ${ip}`);
        } catch (_) { }

        jwt.sign(payload, secret, { expiresIn: '4h' }, (err, token) => {
            if (err) throw err;
            console.log(`[AUDIT] Admin login success: ${user.email} from IP ${ip} at ${new Date().toISOString()}`);
            res.status(200).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    full_name: user.full_name,
                    profilePic: user.profilePic || ''
                }
            });
        });

    } catch (error) {
        console.error('[admin-login] Server error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});
// @route GET /api/auth/profile
// @desc  Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password').lean();
        if (!user) return res.status(404).json({ message: 'User not found' });

        const mongoose = require('mongoose');
        const PlanModel = mongoose.model('Plan');
        let planRules = {};

        if (user.plan) {
            const planDoc = await PlanModel.findOne({ code: user.plan }).lean();
            if (planDoc) planRules = planDoc;
        } else {
            const defaultPlan = await PlanModel.findOne({ isDefault: true }).lean();
            if (defaultPlan) {
                planRules = defaultPlan;
                user.plan = defaultPlan.code;
                await mongoose.model('User').findByIdAndUpdate(req.user.id, { plan: defaultPlan.code });
            }
        }

        user.limits = { ...planRules, ...(user.planOverrides || {}) };

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route PUT /api/auth/profile
// @desc  Update user profile (e.g., full name, mobile)
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { email, mobile, new_mobile, full_name, gender, dateOfBirth, age, settings } = req.body;

        let user = await User.findById(req.user.id);

        if (!user) {
            // Fallback: try by email/mobile
            user = await User.findOne({
                $or: [
                    email ? { email } : null,
                    mobile ? { mobile } : null
                ].filter(Boolean)
            });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (full_name !== undefined) user.full_name = full_name;
        if (new_mobile !== undefined) user.mobile = new_mobile;
        if (gender !== undefined) user.gender = gender;
        if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth || null;
        if (age !== undefined) user.age = age || null;

        if (settings) {
            user.settings = { ...user.settings, ...settings };
        }

        await user.save();
        try {
            await logActivity('profile', user, `Updated profile information`);
        } catch (_) { }

        res.status(200).json({
            message: 'Profile updated',
            user: {
                id: user.id,
                email: user.email,
                mobile: user.mobile,
                role: user.role,
                full_name: user.full_name,
                profilePic: user.profilePic,
                gender: user.gender,
                dateOfBirth: user.dateOfBirth,
                age: user.age,
                settings: user.settings
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route DELETE /api/auth/profile
// @desc  Delete user account and all related data
router.delete('/profile', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find user first
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Don't allow platform admins to delete their account through this route easily for safety
        if (user.role === 'admin') {
            return res.status(403).json({ message: 'Administrator accounts cannot be deleted through this portal. Please contact the platform owner.' });
        }

        const Animal = require('../models/Animal');
        const HealthLog = require('../models/HealthLog');
        const MedicalRecord = require('../models/MedicalRecord');

        // Delete all related animals
        const userAnimals = await Animal.find({ user_id: userId });
        const animalIds = userAnimals.map(a => a._id);

        // Delete health logs and medical records for all animals
        if (animalIds.length > 0) {
            await HealthLog.deleteMany({ animal_id: { $in: animalIds } });
            await MedicalRecord.deleteMany({ animal_id: { $in: animalIds } });
        }

        // Delete all animals
        await Animal.deleteMany({ user_id: userId });

        // Delete activity logs
        await ActivityLog.deleteMany({ user: { $in: [user.full_name, user.email, user.mobile].filter(Boolean) } });

        // Finally delete the user
        await User.findByIdAndDelete(userId);

        console.log(`[ACCOUNT_DELETED] User account for ${user.email || user.mobile} removed permanently.`);

        res.status(200).json({ message: 'Account and all related data deleted successfully.' });
    } catch (error) {
        console.error('[Account Deletion Error]:', error);
        res.status(500).json({ message: 'Server Error during account deletion.' });
    }
});

// @route POST /api/auth/send-report
// @desc  Manually trigger the Weekly Performance Digest
router.post('/send-report', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const Animal = require('../models/Animal');
        const animals = await Animal.find({ user_id: user.id });

        const { sendWeeklyDigest } = require('../utils/notifications');
        console.log(`[ReportRequest] Starting manual trigger for user ID: ${user._id} (${user.email})`);

        if (!user.email) {
            return res.status(400).json({ message: 'No email address found for your account. Please set an email in your profile to receive reports.' });
        }

        const success = await sendWeeklyDigest(user, animals, true); // force=true

        if (success) {
            console.log(`[ReportRequest] Manual report successfully sent to ${user.email}`);
            res.json({ message: `Success! Performance digest sent to ${user.email}.` });
        } else {
            console.warn(`[ReportRequest] Notification service returned 'false' for ${user.email}`);
            res.status(400).json({ message: `We could not reach ${user.email}. Please ensure your email is correct and verified.` });
        }
    } catch (error) {
        console.error('[auth/send-report] Critical Failure:', error);
        res.status(500).json({ message: 'A server error occurred while processing your report. Please check the logs.' });
    }
});

// @route POST /api/auth/profile/upload
// @desc  Upload profile picture (Memory Storage + Base64 for Vercel/Cloud compatibility)
router.post('/profile/upload', authMiddleware, upload.single('profilePic'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        let user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Convert Buffer to Base64 data URL for database storage
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        // Save Base64 to DB (Bypasses read-only filesystem issues on Vercel)
        user.profilePic = base64Image;
        await user.save();

        try {
            await logActivity('profile', user, `Updated profile picture (Cloud optimized)`);
        } catch (_) { }

        res.status(200).json({
            message: 'Profile picture updated',
            profilePic: user.profilePic,
            user: {
                id: user.id,
                email: user.email,
                mobile: user.mobile,
                role: user.role,
                full_name: user.full_name,
                profilePic: user.profilePic
            }
        });
    } catch (error) {
        console.error('[Upload Error]', error);
        res.status(500).json({ message: 'Server error during upload. Please ensure image size is under 2MB.' });
    }
});

// ═══════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════

// @route POST /api/auth/forgot-password/request
// @desc  Send OTP to email for password reset
router.post('/forgot-password/request', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required.' });

        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal whether user exists
            return res.status(200).json({ message: 'If an account with this email exists, a reset code has been sent.' });
        }

        // Block admin from user reset flow
        if (user.role === 'admin') {
            return res.status(200).json({ message: 'If an account with this email exists, a reset code has been sent.' });
        }

        // Rate limit: 60s between requests
        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) {
                return res.status(429).json({ message: `Please wait ${Math.ceil(60 - timePassed)} seconds before requesting again.` });
            }
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000); // 90 seconds
        user.lastOtpSentAt = new Date();
        await user.save();

        // Send reset email
        try {
            const mailOptions = {
                from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
                to: email,
                subject: 'Password Reset - Aranya AI',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                        <h2 style="color: #2D6A4F; text-align: center;">Reset Your Password</h2>
                        <p>Hello${user.full_name ? ` ${user.full_name}` : ''},</p>
                        <p>We received a request to reset your password. Use the code below:</p>
                        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #2D6A4F;">
                            ${otp}
                        </div>
                        <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for <strong>90 seconds</strong>. If you didn't request a password reset, please ignore this email.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="text-align: center; color: #888; font-size: 12px;">&copy; 2026 Aranya AI. All rights reserved.</p>
                    </div>
                `
            };
            await transporter.sendMail(mailOptions);
            console.log(`[FORGOT-PASSWORD] Reset email sent to ${email}`);
        } catch (mailErr) {
            console.error('[FORGOT-PASSWORD] Mail Error:', mailErr.message);
            return res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
        }

        res.status(200).json({ message: 'If an account with this email exists, a reset code has been sent.' });
    } catch (error) {
        console.error('[forgot-password/request]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/forgot-password/reset
// @desc  Verify OTP and set new password
router.post('/forgot-password/reset', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset code.' });
        }

        if (user.otp !== otp || !user.otpExpires || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired reset code.' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        console.log(`[FORGOT-PASSWORD] Password reset for ${email}`);
        res.status(200).json({ message: 'Password reset successful! You can now sign in with your new password.' });
    } catch (error) {
        console.error('[forgot-password/reset]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/forgot-password/admin/request
// @desc  Send OTP to admin email for password reset
router.post('/forgot-password/admin/request', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required.' });

        const user = await User.findOne({ email });
        // Only proceed for admin accounts, but don't reveal if user exists
        if (!user || user.role !== 'admin') {
            return res.status(200).json({ message: 'If an admin account with this email exists, a reset code has been sent.' });
        }

        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) {
                return res.status(429).json({ message: `Please wait ${Math.ceil(60 - timePassed)} seconds.` });
            }
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000);
        user.lastOtpSentAt = new Date();
        await user.save();

        try {
            const mailOptions = {
                from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
                to: email,
                subject: 'Admin Password Reset - Aranya AI',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                        <h2 style="color: #dc2626; text-align: center;">🔐 Admin Password Reset</h2>
                        <p>Hello ${user.full_name || 'Admin'},</p>
                        <p>A password reset was requested for your admin account. Use the code below:</p>
                        <div style="background-color: #fef2f2; padding: 15px; text-align: center; border-radius: 5px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #dc2626;">
                            ${otp}
                        </div>
                        <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for <strong>90 seconds</strong>. If you didn't request this, please secure your account immediately.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="text-align: center; color: #888; font-size: 12px;">&copy; 2026 Aranya AI. All rights reserved.</p>
                    </div>
                `
            };
            await transporter.sendMail(mailOptions);
            console.log(`[FORGOT-PASSWORD-ADMIN] Reset email sent to ${email}`);
        } catch (mailErr) {
            console.error('[FORGOT-PASSWORD-ADMIN] Mail Error:', mailErr.message);
            return res.status(500).json({ message: 'Failed to send reset email.' });
        }

        res.status(200).json({ message: 'If an admin account with this email exists, a reset code has been sent.' });
    } catch (error) {
        console.error('[forgot-password/admin/request]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/forgot-password/admin/reset
// @desc  Verify OTP and set new admin password
router.post('/forgot-password/admin/reset', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Email, OTP, and new password are required.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        const user = await User.findOne({ email });
        if (!user || user.role !== 'admin') {
            return res.status(400).json({ message: 'Invalid or expired reset code.' });
        }
        if (user.otp !== otp || !user.otpExpires || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired reset code.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        console.log(`[FORGOT-PASSWORD-ADMIN] Password reset for admin: ${email}`);
        res.status(200).json({ message: 'Admin password reset successful! You can now sign in.' });
    } catch (error) {
        console.error('[forgot-password/admin/reset]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/google


// @desc  Google Login / Register — USER ONLY (blocks admins)
router.post('/google', async (req, res) => {
    try {
        const { idToken, accessToken } = req.body;
        let userData = null;

        if (idToken) {
            const ticket = await client.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            const payload = ticket.getPayload();
            userData = { email: payload.email, name: payload.name, picture: payload.picture };
        } else if (accessToken) {
            // Standard approach for GSI access tokens
            const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { access_token: accessToken },
                timeout: 8000
            });
            userData = { email: response.data.email, name: response.data.name, picture: response.data.picture };
        } else {
            return res.status(400).json({ message: 'Google Token is required' });
        }

        const { email, name, picture } = userData;
        let user = await User.findOne({ email });

        // Block admin accounts from user login
        if (user && user.role === 'admin') {
            return res.status(403).json({ message: 'Admin accounts must use the Admin Portal to sign in.' });
        }

        // Auto-registration — create user if they don't exist
        if (!user) {
            user = new User({
                email,
                full_name: name || 'New User',
                profilePic: picture,
                isVerified: true,
                role: 'user', // Always default to user for SSO signup
                plan: 'free',
                loginCount: 1,
                lastLoginAt: new Date()
            });
            await user.save();
            console.log(`[AUDIT] New SSO Registration: ${email}`);
        } else {
            // Existing user — update profile info if needed
            if (!user.full_name) user.full_name = name;
            if (!user.profilePic) user.profilePic = picture;
            user.isVerified = true;
            user.lastLoginAt = new Date();
            user.loginCount = (user.loginCount || 0) + 1;
            await user.save();
            try {
                await logActivity('login', user, `Logged in via Google SSO`);
            } catch (_) { }
        }

        const payload = { user: { id: user.id, role: user.role, managedBy: user.managedBy } };
        const secret = process.env.JWT_SECRET;
        if (!secret) { console.error('[SECURITY] JWT_SECRET not set!'); return res.status(500).json({ message: 'Server configuration error.' }); }

        jwt.sign(payload, secret, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            res.status(200).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    mobile: user.mobile,
                    role: user.role,
                    full_name: user.full_name,
                    profilePic: user.profilePic
                }
            });
        });

    } catch (error) {
        const errorDetail = error.response?.data || error.message;
        console.error('[Google Login] Error:', errorDetail);

        // Temporary diagnostic logging
        try {
            const fs = require('fs');
            const logPath = require('path').join(__dirname, 'google_auth_error.log');
            fs.appendFileSync(logPath, `${new Date().toISOString()} - ${JSON.stringify(errorDetail)}\n`);
        } catch (_) { }

        res.status(401).json({ message: 'Invalid Google Token' });
    }
});

// @route POST /api/auth/google-admin
// @desc  Google Login — ADMIN ONLY (blocks non-admins)
router.post('/google-admin', async (req, res) => {
    try {
        const { idToken, accessToken } = req.body;
        let userData = null;

        if (idToken) {
            const ticket = await client.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            const payload = ticket.getPayload();
            userData = { email: payload.email, name: payload.name, picture: payload.picture };
        } else if (accessToken) {
            // Standard approach for GSI access tokens
            const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { access_token: accessToken },
                timeout: 8000
            });
            userData = { email: response.data.email, name: response.data.name, picture: response.data.picture };
        } else {
            return res.status(400).json({ message: 'Google Token is required' });
        }

        const { email, name, picture } = userData;
        const user = await User.findOne({ email });

        // Must exist AND must be admin
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Unauthorized. Only admin accounts can access this portal.' });
        }

        // Update profile data
        if (!user.full_name) user.full_name = name;
        if (!user.profilePic) user.profilePic = picture;
        user.lastLoginAt = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        const secret = process.env.JWT_SECRET;
        if (!secret) { console.error('[SECURITY] JWT_SECRET not set!'); return res.status(500).json({ message: 'Server configuration error.' }); }

        const payload = { user: { id: user.id, role: user.role } };
        try {
            await logActivity('admin', user, `Administrator logged in via Google SSO`);
        } catch (_) { }

        jwt.sign(payload, secret, { expiresIn: '4h' }, (err, token) => {
            if (err) throw err;
            console.log(`[AUDIT] Admin Google login: ${user.email} at ${new Date().toISOString()}`);
            res.status(200).json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    full_name: user.full_name,
                    profilePic: user.profilePic
                }
            });
        });

    } catch (error) {
        const errorDetail = error.response?.data || error.message;
        console.error('[Google Admin Login] Error:', errorDetail);

        // Temporary diagnostic logging
        try {
            const fs = require('fs');
            const logPath = require('path').join(__dirname, 'google_auth_error.log');
            fs.appendFileSync(logPath, `${new Date().toISOString()} [ADMIN] - ${JSON.stringify(errorDetail)}\n`);
        } catch (_) { }

        res.status(401).json({ message: 'Google authentication failed.' });
    }
});


// ═══════════════════════════════════════════════════════
// MOBILE VERIFICATION (from Profile page)
// ═══════════════════════════════════════════════════════

// @route POST /api/auth/verify-mobile/request
// @desc  Send OTP to a new mobile number for verification
router.post('/verify-mobile/request', authMiddleware, async (req, res) => {
    try {
        const { mobile } = req.body;
        if (!mobile) return res.status(400).json({ message: 'Mobile number is required' });

        // Check if mobile is already in use by another account
        const existingUser = await User.findOne({ mobile });
        if (existingUser && existingUser.id !== req.user.id) {
            return res.status(400).json({ message: 'This mobile number is already linked to another account.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Rate limit: 60s between requests
        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) {
                return res.status(429).json({ message: `Please wait ${Math.ceil(60 - timePassed)} seconds.` });
            }
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000); // 90 seconds
        user.lastOtpSentAt = new Date();
        // Store pending mobile temporarily
        user._pendingMobile = mobile;
        await user.save();

        // Send OTP via Twilio
        if (twilioClient) {
            try {
                const formattedNumber = mobile.startsWith('+') ? mobile : `+${mobile.replace(/\D/g, '')}`;
                await twilioClient.messages.create({
                    body: `[Aranya AI] Your verification code is: ${otp}. Valid for 90 seconds.`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: formattedNumber
                });
                console.log(`[MOBILE-VERIFY] SMS sent to ${formattedNumber}`);
            } catch (smsErr) {
                console.error('[MOBILE-VERIFY] SMS Error:', smsErr.message);
            }
        } else {
            console.warn('[MOBILE-VERIFY] Twilio not configured.');
        }

        res.status(200).json({ message: 'Verification code sent to your mobile.' });
    } catch (error) {
        console.error('[verify-mobile/request]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/verify-mobile/confirm
// @desc  Verify OTP and link mobile number to account
router.post('/verify-mobile/confirm', authMiddleware, async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        if (!mobile || !otp) return res.status(400).json({ message: 'Mobile and OTP are required' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.otp !== otp || !user.otpExpires || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired verification code.' });
        }

        user.mobile = mobile;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        try {
            await logActivity('profile', user, `Verified mobile number: ${mobile}`);
        } catch (_) { }

        res.status(200).json({
            message: 'Mobile number verified and linked!',
            user: {
                id: user.id,
                email: user.email,
                mobile: user.mobile,
                role: user.role,
                full_name: user.full_name,
                profilePic: user.profilePic
            }
        });
    } catch (error) {
        console.error('[verify-mobile/confirm]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ═══════════════════════════════════════════════════════
// EMAIL VERIFICATION (from Profile page)
// ═══════════════════════════════════════════════════════

// @route POST /api/auth/verify-email/request
// @desc  Send OTP to a new email address for verification
router.post('/verify-email/request', authMiddleware, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email address is required' });

        // Basic email format validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }

        // Check if email is already in use by another account
        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser.id !== req.user.id) {
            return res.status(400).json({ message: 'This email is already linked to another account.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Rate limit: 60s between requests
        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) {
                return res.status(429).json({ message: `Please wait ${Math.ceil(60 - timePassed)} seconds.` });
            }
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000); // 90 seconds
        user.lastOtpSentAt = new Date();
        await user.save();

        // Send OTP via email
        try {
            const mailOptions = {
                from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
                to: email,
                subject: 'Email Verification - Aranya AI',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                        <h2 style="color: #2D6A4F; text-align: center;">Verify Your Email</h2>
                        <p>Hello,</p>
                        <p>You requested to link this email to your Aranya AI account. Use the code below to verify:</p>
                        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2D6A4F;">
                            ${otp}
                        </div>
                        <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for 90 seconds. If you did not request this, please ignore this email.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="text-align: center; color: #888; font-size: 12px;">&copy; 2026 Aranya AI. All rights reserved.</p>
                    </div>
                `
            };
            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL-VERIFY] Verification email sent to ${email}`);
        } catch (mailErr) {
            console.error('[EMAIL-VERIFY] Mail Error:', mailErr.message);
            return res.status(500).json({ message: 'Failed to send verification email. Please check email configuration.' });
        }

        res.status(200).json({ message: 'Verification code sent to your email.' });
    } catch (error) {
        console.error('[verify-email/request]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/verify-email/confirm
// @desc  Verify OTP and link email to account
router.post('/verify-email/confirm', authMiddleware, async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.otp !== otp || !user.otpExpires || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired verification code.' });
        }

        // Link email to account
        user.email = email;
        user.otp = undefined;
        user.otpExpires = undefined;
        user.isVerified = true;
        await user.save();

        try {
            await logActivity('profile', user, `Verified email address: ${email}`);
        } catch (_) { }

        res.status(200).json({
            message: 'Email verified and linked!',
            user: {
                id: user.id,
                email: user.email,
                mobile: user.mobile,
                role: user.role,
                full_name: user.full_name,
                profilePic: user.profilePic
            }
        });
    } catch (error) {
        console.error('[verify-email/confirm]', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route GET /api/auth/profile
// @desc  Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password -otp -otpExpires').lean();
        if (!user) return res.status(404).json({ message: 'User not found' });

        const mongoose = require('mongoose');
        const PlanModel = mongoose.model('Plan');
        let planRules = {};

        if (user.plan) {
            const planDoc = await PlanModel.findOne({ code: user.plan }).lean();
            if (planDoc) {
                planRules = planDoc;
                user.planName = planDoc.name; // Dynamic name from DB
            }
        } else {
            const defaultPlan = await PlanModel.findOne({ isDefault: true }).lean();
            if (defaultPlan) {
                planRules = defaultPlan;
                user.plan = defaultPlan.code;
                user.planName = defaultPlan.name;
                await mongoose.model('User').findByIdAndUpdate(req.user.id, { plan: defaultPlan.code });
            }
        }

        user.limits = { ...planRules, ...(user.planOverrides || {}) };

        // High-Performance Storage Logic with Self-Healing Sync
        if (req.user.role === 'caretaker') {
            const manager = await mongoose.model('User').findById(req.user.managedBy).select('usage');
            user.usage = manager ? manager.usage : { storageBytes: 0 };
        } else if (!user.usage || user.usage.storageBytes === 0) {
            // Self-Healing: If counter is zero, perform one-time background sync
            try {
                const stats = await MedicalRecord.aggregate([
                    { $match: { user_id: new mongoose.Types.ObjectId(req.user.id.toString()) } },
                    { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$fileSize', 512000] } } } }
                ]);
                const total = (stats && stats.length > 0) ? stats[0].totalSize : 0;

                if (total > 0) {
                    await mongoose.model('User').findByIdAndUpdate(req.user.id, { "usage.storageBytes": total });
                    user.usage = { storageBytes: total };
                } else {
                    user.usage = { storageBytes: 0 };
                }
            } catch (err) {
                user.usage = { storageBytes: 0 };
            }
        } else {
            // Standard Production Load: Fast O(1) read
            if (!user.usage) user.usage = { storageBytes: 0 };
        }

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ── Care Circle Management Routes ──

// @route GET /api/auth/care-circle
// @desc  Get all members of the care circle managed by the current user
router.get('/care-circle', authMiddleware, async (req, res) => {
    try {
        const members = await User.find({ managedBy: req.user.id, role: 'caretaker' }).select('-password -otp');
        res.json(members);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/care-circle/invite
// @desc  Add a new member to the Care Circle
router.post('/care-circle/invite', authMiddleware, async (req, res) => {
    try {
        const { full_name, email, mobile, password } = req.body;

        // 1. Get the owner's record and plan limits
        const owner = await User.findById(req.user.id);
        const ownerName = owner?.full_name || 'an Aranya Owner';

        const Plan = require('../models/Plan');
        const userPlan = await Plan.findOne({ code: owner.plan, active: true });
        const maxMembers = userPlan ? userPlan.maxCareCircleMembers : 0;

        if (maxMembers !== -1) {
            const currentMemberCount = await User.countDocuments({ managedBy: req.user.id, role: 'caretaker' });
            if (currentMemberCount >= maxMembers) {
                return res.status(403).json({
                    message: `Your "${userPlan?.name || 'Free'}" plan allows only ${maxMembers} Care Circle members. Please upgrade to add more.`
                });
            }
        }

        // 2. Check if user already exists
        let existingUser = await User.findOne({
            $or: [
                email ? { email } : null,
                mobile ? { mobile } : null
            ].filter(Boolean)
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User with this email/mobile already exists' });
        }

        const newMember = new User({
            full_name,
            email: email || undefined,
            mobile: mobile || undefined,
            password: password || 'Aranya@123',
            role: 'caretaker',
            managedBy: req.user.id,
            isVerified: true // Pre-verified by owner
        });

        await newMember.save();

        // 3. ── AUTOMATED EMAIL INVITATION ──
        if (email) {
            try {
                const mailOptions = {
                    from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
                    to: email,
                    subject: `Welcome to the Care Circle - Aranya AI`,
                    html: `
                        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 20px; background: #ffffff;">
                             <div style="text-align: center; margin-bottom: 25px;">
                                <h2 style="color: #2D6A4F; font-size: 26px; margin: 0;">Aranya AI Collaboration</h2>
                                <p style="color: #64748b; font-size: 14px;">Transforming Animal Care Together</p>
                            </div>

                            <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">
                                You have been invited by <strong>${ownerName}</strong> to join their <strong>Care Circle</strong> as a **Caretaker**. 
                                You can now log in to the portal to help monitor their herd's biometrics and health records.
                            </p>
                            
                            <div style="background-color: #f8fafc; padding: 25px; border-radius: 16px; margin: 30px 0; border: 1.5px dashed #cbd5e1; position: relative;">
                                <div style="color: #2D6A4F; font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px;">Your Temporary Access Details</div>
                                <p style="margin: 8px 0; font-size: 16px; color: #334155;"><strong>Portal ID:</strong> ${email}</p>
                                <p style="margin: 8px 0; font-size: 16px; color: #334155;"><strong>Secret Key:</strong> ${password || 'Aranya@123'}</p>
                            </div>

                            <div style="text-align: center; margin-top: 35px;">
                                <a href="${process.env.CLIENT_URL || process.env.VITE_CLIENT_URL || 'http://localhost:5173'}/login" 
                                   style="background-color: #2D6A4F; color: #ffffff; padding: 16px 35px; text-decoration: none; border-radius: 14px; font-weight: 800; display: inline-block; font-size: 16px; box-shadow: 0 10px 15px -3px rgba(45, 95, 63, 0.3);">
                                    Access User Portal
                                </a>
                            </div>

                            <div style="margin-top: 40px; padding-top: 25px; border-top: 1px solid #f1f5f9; text-align: center;">
                                <p style="color: #94a3b8; font-size: 13px;">Please change your password after logging in for the first time.</p>
                                <p style="color: #cbd5e1; font-size: 11px;">&copy; 2026 Aranya AI. All rights reserved.</p>
                            </div>
                        </div>
                    `
                };
                await transporter.sendMail(mailOptions);
                console.log(`[INVITE] Professional invitation email sent to ${email}`);
            } catch (mailErr) {
                console.error('[INVITE] Nodemailer execution failed:', mailErr.message);
            }
        }

        try {
            await logActivity('staff_management', { id: req.user.id }, `Added new Care Circle member: ${full_name}`);
        } catch (_) { }

        res.status(201).json({ message: 'Member added and invitation email sent!', member: newMember });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route DELETE /api/auth/care-circle/:id
// @desc  Remove a Care Circle member
router.delete('/care-circle/:id', authMiddleware, async (req, res) => {
    try {
        const member = await User.findOne({ _id: req.params.id, managedBy: req.user.id });
        if (!member) {
            return res.status(404).json({ message: 'Member not found or not in your circle' });
        }

        await User.findByIdAndDelete(req.params.id);

        try {
            await logActivity('staff_management', { id: req.user.id }, `Removed Care Circle member: ${member.full_name}`);
        } catch (_) { }

        res.json({ message: 'Member removed from Care Circle' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route GET /api/auth/care-circle/activities
// @desc  Get activities of owner and their care circle
router.get('/care-circle/activities', authMiddleware, async (req, res) => {
    try {
        const ActivityLog = require('../models/ActivityLog');

        // 1. Get all members managed by this user
        const members = await User.find({ managedBy: req.user.id }).select('_id');
        const memberIds = members.map(s => s._id);

        // 2. Fetch logs for self + circle members
        const logs = await ActivityLog.find({
            userId: { $in: [req.user.id, ...memberIds] }
        })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
