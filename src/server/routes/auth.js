const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const twilio = require('twilio');
const ActivityLog = require('../models/ActivityLog');

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

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `profile_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
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
router.post('/request-otp', async (req, res) => {
    try {
        const { email, mobile, type } = req.body; // type: 'register' or 'login'
        const identifier = email || mobile;

        if (!identifier) {
            return res.status(400).json({ message: 'Email or Mobile is required' });
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 60 * 1000); // 60 seconds (Matches resend time)

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
            return res.status(404).json({ message: 'User not found. Please sign up first.' });
        }

        if (!user) {
            user = new User({
                email: email || undefined,
                mobile: mobile || undefined,
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
                    // Ensure number is in E.164 format (starts with +)
                    const formattedNumber = mobile.startsWith('+') ? mobile : `+${mobile.replace(/\D/g, '')}`;

                    await twilioClient.messages.create({
                        body: `[Aranya AI] Your verification code is: ${otp}. Valid for 90 seconds.`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: formattedNumber
                    });
                    console.log(`[OTP] Real SMS sent to ${formattedNumber}`);
                } catch (smsErr) {
                    console.error('[OTP] Twilio Error:', smsErr.message);
                    // Fallback to console log in development if Twilio fails
                    console.log(`[OTP] Fallback log to ${mobile}: ${otp}`);
                }
            } else {
                console.warn('[OTP] Twilio not configured. Mobile OTP logged to console.');
                console.log(`[OTP] Sent to ${mobile}: ${otp}`);
            }
        } else {
            // Email OTP - still logging for now
            console.log(`[OTP] Email OTP for ${email}: ${otp}`);
        }

        res.status(200).json({ message: 'OTP sent successfully', identifier });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/register
router.post('/register', async (req, res) => {
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

        // Hash password if provided
        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
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

        const payload = { user: { id: user.id } };
        const secret = process.env.JWT_SECRET || 'fallback_secret';
        jwt.sign(payload, secret, { expiresIn: '7d' }, (err, token) => {
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
router.post('/login', async (req, res) => {
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

        // Login via OTP
        if (otp) {
            if (user.otp === otp && user.otpExpires > Date.now()) {
                // OTP match
                user.otp = undefined;
                user.otpExpires = undefined;
                user.isVerified = true;
                await user.save();
            } else {
                return res.status(400).json({ message: 'Invalid or expired OTP' });
            }
        }
        // Login via Password
        else if (password) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }
        } else {
            return res.status(400).json({ message: 'Password or OTP required' });
        }

        if (user.blocked) {
            return res.status(403).json({ message: 'Your account has been suspended. Please contact support.' });
        }

        // Track login metrics for admin CRM
        user.lastLoginAt = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        const payload = { user: { id: user.id } };
        const secret = process.env.JWT_SECRET || 'fallback_secret';
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
router.post('/admin-login', async (req, res) => {
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
// @route PUT /api/auth/profile
// @desc  Update user profile (e.g., full name, mobile)
router.put('/profile', async (req, res) => {
    try {
        const { email, mobile, new_mobile, full_name } = req.body;

        let user = await User.findOne({
            $or: [
                email ? { email } : null,
                mobile ? { mobile } : null
            ].filter(Boolean)
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (full_name !== undefined) user.full_name = full_name;
        if (new_mobile !== undefined) user.mobile = new_mobile;

        await user.save();

        res.status(200).json({
            message: 'Profile updated',
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
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route POST /api/auth/profile/upload
// @desc  Upload profile picture
router.post('/profile/upload', upload.single('profilePic'), async (req, res) => {
    try {
        const { email, mobile } = req.body;
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        let user = await User.findOne({
            $or: [
                email ? { email } : null,
                mobile ? { mobile } : null
            ].filter(Boolean)
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Save path to DB (relative path to be served)
        user.profilePic = `/uploads/${req.file.filename}`;
        await user.save();

        res.status(200).json({
            message: 'Profile picture uploaded',
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
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
