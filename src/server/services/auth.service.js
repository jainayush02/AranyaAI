const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const ActivityLog = require('../models/ActivityLog');
const MedicalRecord = require('../models/MedicalRecord');
const Plan = require('../models/Plan');
const { logActivity } = require('../utils/logger');
const mongoose = require('mongoose');

// Initialize Google OAuth Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const createTransporter = () => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.GOOGLE_EMAIL_USER,
            pass: process.env.GOOGLE_EMAIL_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });
};

let transporter = createTransporter();

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const adminLoginAttempts = new Map();
const MAX_ADMIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

class AuthService {
    static transporter = transporter;

    static async requestOTP({ email, mobile, type }) {
        const identifier = email || mobile;
        if (!identifier) throw new Error('Email or Mobile is required');

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 90 * 1000);

        let user = await User.findOne({ $or: [{ email: identifier }, { mobile: identifier }] });

        if (user && user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) {
                throw new Error(`Please wait ${Math.ceil(60 - timePassed)} seconds before requesting a new OTP.`);
            }
        }

        if (type === 'register' && user && user.isVerified) {
            throw new Error('User already exists and is verified');
        }

        if (type === 'login' && !user) {
            return { message: 'If an account is associated, an OTP has been sent.', identifier };
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
        user.lastOtpSentAt = new Date();
        await user.save();

        if (mobile) {
            if (twilioClient) {
                try {
                    const formattedNumber = mobile.startsWith('+') ? mobile : `+${mobile.replace(/\D/g, '')}`;
                    await twilioClient.messages.create({
                        body: `[Aranya AI] Your verification code is: ${otp}. Valid for 90 seconds.`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: formattedNumber
                    });
                } catch (smsErr) {
                    console.error('[OTP] Twilio Error:', smsErr.message);
                }
            }
        } else if (email) {
            try {
                const mailOptions = {
                    from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
                    to: email,
                    subject: 'Verification Code - Aranya AI',
                    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                            <h2 style="color: #2D6A4F; text-align: center;">Welcome to Aranya AI</h2>
                            <p>Hello,</p>
                            <p>To access your Aranya AI account, please use the verification code below:</p>
                            <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2D6A4F;">
                                ${otp}
                            </div>
                            <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="text-align: center; color: #888; font-size: 12px;">&copy; 2024 Aranya AI. All rights reserved.</p>
                        </div>`
                };
                await transporter.sendMail(mailOptions);
            } catch (mailErr) {
                console.error('[OTP] Mail Error:', mailErr.message);
                throw new Error('Could not send verification email. Please try again later or use mobile login.');
            }
        }
        return { message: 'OTP sent successfully', identifier };
    }

    static async register({ email, mobile, password, full_name, otp }) {
        if (!otp) throw new Error('OTP is required');
        const identifier = email || mobile;
        let user = await User.findOne({
            $or: [email ? { email } : null, mobile ? { mobile } : null].filter(Boolean)
        });

        if (user && user.isVerified) {
            throw new Error('User already exists');
        }

        if (!user) {
            user = new User({
                email: email || undefined,
                mobile: mobile || undefined,
                otp,
                otpExpires: new Date(Date.now() + 600000), // 10 minutes
                isVerified: false
            });
        }

        if (user.otp !== otp || user.otpExpires < Date.now()) {
            throw new Error('Invalid or expired OTP');
        }

        if (password) user.password = password;
        user.full_name = full_name || user.full_name || '';
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        try {
            await ActivityLog.create({
                type: 'registration',
                user: full_name || email || mobile || 'New User',
                detail: `New user registered: ${full_name || ''} (${email || mobile || 'unknown'})`
            });
        } catch (_) { }

        return this.generateTokenResponse(user);
    }

    static async login({ email, mobile, password, otp }) {
        let user;
        if (email || mobile) {
            user = await User.findOne({
                $or: [email ? { email } : null, mobile ? { mobile } : null].filter(Boolean)
            });
        }
        if (!user) throw new Error('Invalid credentials');

        if (user.blocked || (user.lockUntil && user.lockUntil > Date.now())) {
            throw new Error(user.blocked ? 'Your account has been suspended.' : 'Too many failed attempts. Account locked for 15 minutes.');
        }

        if (otp) {
            if (user.otp === otp && user.otpExpires > Date.now()) {
                user.failedOtpAttempts = 0;
                user.otp = undefined;
                user.otpExpires = undefined;
                user.isVerified = true;
            } else {
                user.failedOtpAttempts = (user.failedOtpAttempts || 0) + 1;
                if (user.failedOtpAttempts >= 5) {
                    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await user.save();
                throw new Error('Invalid or expired code.');
            }
        } else if (password) {
            if (!user.password) throw new Error('No password found. Use OTP to sign in.');
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
                if (user.failedLoginAttempts >= 5) {
                    user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await user.save();
                throw new Error('Invalid credentials.');
            }
            user.failedLoginAttempts = 0;
            user.lockUntil = null;
        } else {
            throw new Error('Password or code required');
        }

        user.lastLoginAt = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        try { await logActivity('login', user, `User logged in using ${password ? 'password' : 'OTP'}`); } catch (_) { }

        return this.generateTokenResponse(user);
    }

    static async adminLogin({ email, password, ip }) {
        const record = adminLoginAttempts.get(ip) || { attempts: 0, lockedUntil: null };
        if (record.lockedUntil && record.lockedUntil > Date.now()) {
            throw new Error(`Too many failed attempts. Try again in ${Math.ceil((record.lockedUntil - Date.now()) / 60000)} minute(s).`);
        }

        const DUMMY_HASH = '$2a$10$dummyhashfortimingattackprevention..........';
        const handleFail = async () => {
            await bcrypt.compare('dummy_password_for_timing', DUMMY_HASH);
            record.attempts += 1;
            if (record.attempts >= MAX_ADMIN_ATTEMPTS) record.lockedUntil = Date.now() + LOCKOUT_MS;
            adminLoginAttempts.set(ip, record);
            const remaining = MAX_ADMIN_ATTEMPTS - record.attempts;
            throw new Error(remaining <= 0 ? 'Account locked for 15 minutes.' : `Invalid credentials. ${remaining} attempt(s) remaining.`);
        };

        if (!email || !password) return await handleFail();
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user || user.role !== 'admin' || !user.password) return await handleFail();

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return await handleFail();

        adminLoginAttempts.delete(ip);
        try { await logActivity('admin', user, `Administrator logged in from IP ${ip}`); } catch (_) { }

        const payload = { user: { id: user.id, role: user.role } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '4h' });
        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
                profilePic: user.profilePic || ''
            }
        };
    }

    static async googleLogin({ accessToken, isMobileApp, idToken }) {
        let email, name, picture;
        
        if (isMobileApp && idToken) {
            const ticket = await client.verifyIdToken({
                idToken: idToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            const payload = ticket.getPayload();
            email = payload.email;
            name = payload.name;
            picture = payload.picture;
        } else {
            const googleRes = await require('axios').get('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            email = googleRes.data.email;
            name = googleRes.data.name;
            picture = googleRes.data.picture;
        }

        if (!email) throw new Error('Google authentication failed. No email provided.');

        let user = await User.findOne({ email });
        if (!user) {
            user = new User({
                email,
                full_name: name || '',
                profilePic: picture || '',
                isVerified: true,
                failedLoginAttempts: 0,
                failedOtpAttempts: 0
            });
            await user.save();
        }

        if (user.blocked || (user.lockUntil && user.lockUntil > Date.now())) {
            throw new Error(user.blocked ? 'Your account has been suspended.' : 'Too many failed attempts. Account locked.');
        }

        user.lastLoginAt = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        try { await logActivity('login', user, 'User logged in via Google SSO'); } catch (_) { }

        return this.generateTokenResponse(user);
    }

    static async googleAdminLogin({ accessToken, ip }) {
        const googleRes = await require('axios').get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const email = googleRes.data.email;
        if (!email) throw new Error('Google authentication failed.');

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user || user.role !== 'admin') {
            throw new Error('Unauthorized. Admin access only.');
        }

        user.lastLoginAt = new Date();
        await user.save();

        try { await logActivity('admin', user, `Administrator logged in via Google SSO from IP ${ip}`); } catch (_) { }

        const payload = { user: { id: user.id, role: user.role } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '4h' });
        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
                profilePic: user.profilePic || ''
            }
        };
    }

    static async getProfile(userId) {
        const user = await User.findById(userId).select('-password -otp -otpExpires').lean();
        if (!user) throw new Error('User not found');

        const PlanModel = mongoose.model('Plan');
        let planRules = {};

        if (user.plan) {
            const planDoc = await PlanModel.findOne({ code: user.plan }).lean();
            if (planDoc) {
                planRules = planDoc;
                user.planName = planDoc.name;
            }
        } else {
            const defaultPlan = await PlanModel.findOne({ isDefault: true }).lean();
            if (defaultPlan) {
                planRules = defaultPlan;
                user.plan = defaultPlan.code;
                user.planName = defaultPlan.name;
                await User.findByIdAndUpdate(userId, { plan: defaultPlan.code });
            }
        }

        user.limits = { ...planRules, ...(user.planOverrides || {}) };

        if (user.role === 'caretaker') {
            const manager = await User.findById(user.managedBy).select('usage').lean();
            user.usage = manager?.usage || { storageBytes: 0 };
        } else if (!user.usage || user.usage.storageBytes === 0) {
            try {
                const stats = await MedicalRecord.aggregate([
                    { $match: { user_id: new mongoose.Types.ObjectId(userId.toString()) } },
                    { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$fileSize', 512000] } } } }
                ]);
                const total = (stats && stats.length > 0) ? stats[0].totalSize : 0;
                if (total > 0) {
                    await User.findByIdAndUpdate(userId, { "usage.storageBytes": total });
                    user.usage = { storageBytes: total };
                } else {
                    user.usage = { storageBytes: 0 };
                }
            } catch (err) {
                user.usage = { storageBytes: 0 };
            }
        }
        return user;
    }

    static async updateProfile(userId, data) {
        const { email, mobile, new_mobile, full_name, gender, dateOfBirth, age, settings } = data;
        let user = await User.findById(userId);
        if (!user) {
            user = await User.findOne({ $or: [email ? { email } : null, mobile ? { mobile } : null].filter(Boolean) });
        }
        if (!user) throw new Error('User not found');

        if (full_name !== undefined) user.full_name = full_name;
        if (new_mobile !== undefined) user.mobile = new_mobile;
        if (gender !== undefined) user.gender = gender;
        if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth || null;
        if (age !== undefined) user.age = age || null;
        if (settings) user.settings = { ...user.settings, ...settings };

        await user.save();
        try { await logActivity('profile', user, `Updated profile information`); } catch (_) { }

        return {
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
        };
    }

    static async deleteAccount(userId) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        if (user.role === 'admin') throw new Error('Administrator accounts cannot be deleted through this portal.');

        const Animal = require('../models/Animal');
        const HealthLog = require('../models/HealthLog');
        const MedicalRecord = require('../models/MedicalRecord');

        const userAnimals = await Animal.find({ user_id: userId });
        const animalIds = userAnimals.map(a => a._id);

        if (animalIds.length > 0) {
            await HealthLog.deleteMany({ animal_id: { $in: animalIds } });
            await MedicalRecord.deleteMany({ animal_id: { $in: animalIds } });
        }

        await Animal.deleteMany({ user_id: userId });
        const identifiers = [user.full_name, user.email, user.mobile].filter(Boolean);
        await ActivityLog.deleteMany({ user: { $in: identifiers } });
        await User.findByIdAndDelete(userId);
    }

    static async uploadProfilePic(userId, file) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        user.profilePic = base64Image;
        await user.save();
        try { await logActivity('profile', user, `Updated profile picture (Cloud optimized)`); } catch (_) { }
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            full_name: user.full_name,
            profilePic: user.profilePic
        };
    }

    static async forgotPasswordRequest(email) {
        if (!email) throw new Error('Email is required.');
        const user = await User.findOne({ email });
        
        // Admin accounts must use the admin-forgot-password flow for security
        if (!user || user.role === 'admin') {
            console.log(`[FORGOT-PASSWORD] Skip: ${email} (Found: ${!!user}, Role: ${user?.role})`);
            return { success: true };
        }

        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) throw new Error(`Please wait ${Math.ceil(60 - timePassed)} seconds.`);
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000);
        user.lastOtpSentAt = new Date();
        await user.save();

        const mailOptions = {
            from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
            to: email,
            subject: 'Password Reset - Aranya AI',
            html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #2D6A4F; text-align: center;">Reset Your Password</h2>
                    <p>Hello${user.full_name ? ` ${user.full_name}` : ''},</p>
                    <p>We received a request to reset your password. Use the code below:</p>
                    <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #2D6A4F;">
                        ${otp}
                    </div>
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for <strong>90 seconds</strong>. If you didn't request a password reset, please ignore this email.</p>
                </div>`
        };
        
        try {
            await transporter.sendMail(mailOptions);
            console.log(`[FORGOT-PASSWORD] Reset OTP sent to ${email}`);
        } catch (err) {
            console.error('[FORGOT-PASSWORD] Mail Error:', err.message);
            throw new Error('Failed to send reset email. Please try again later.');
        }
        return { success: true };
    }

    static async forgotPasswordReset({ email, otp, newPassword }) {
        const user = await User.findOne({ email });
        if (!user || user.role === 'admin' || user.otp !== otp || user.otpExpires < Date.now()) {
            throw new Error('Invalid or expired OTP');
        }
        user.password = newPassword;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();
        try { await logActivity('security', user, 'Password reset via email'); } catch (_) { }
    }

    static async adminForgotPasswordRequest(email) {
        if (!email) throw new Error('Email is required.');
        const user = await User.findOne({ email, role: 'admin' });
        if (!user) {
            console.log(`[ADMIN-FORGOT] Skip: ${email} (Admin not found)`);
            return { success: true };
        }

        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) throw new Error(`Please wait ${Math.ceil(60 - timePassed)} seconds.`);
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000);
        user.lastOtpSentAt = new Date();
        await user.save();

        const mailOptions = {
            from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
            to: email,
            subject: 'Admin Password Reset - Aranya AI',
            html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #ec4899; text-align: center;">Reset Admin Password</h2>
                    <p>Hello Administrator,</p>
                    <p>We received a request to reset your admin password. Use the code below:</p>
                    <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #ec4899;">
                        ${otp}
                    </div>
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for <strong>90 seconds</strong>. If you didn't request this code, please secure your account immediately.</p>
                </div>`
        };
        
        try {
            await transporter.sendMail(mailOptions);
            console.log(`[ADMIN-FORGOT] Reset OTP sent to ${email}`);
        } catch (err) {
            console.error('[ADMIN-FORGOT] Mail Error:', err.message);
            throw new Error('Failed to send admin reset email.');
        }
        return { success: true };
    }

    static async adminForgotPasswordReset({ email, otp, newPassword }) {
        const user = await User.findOne({ email, role: 'admin' });
        if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
            throw new Error('Invalid or expired OTP');
        }
        user.password = newPassword;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();
        try { await logActivity('admin', user, 'Admin password reset via email'); } catch (_) { }
    }

    // ── Verify Mobile ──
    static async verifyMobileRequest(userId, mobile) {
        if (!mobile) throw new Error('Mobile number is required');
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        const existing = await User.findOne({ mobile, _id: { $ne: userId } });
        if (existing) throw new Error('This mobile number is already linked to another account.');

        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) throw new Error(`Please wait ${Math.ceil(60 - timePassed)} seconds.`);
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000);
        user.lastOtpSentAt = new Date();
        await user.save();

        if (twilioClient) {
            try {
                const formattedNumber = mobile.startsWith('+') ? mobile : `+${mobile.replace(/\D/g, '')}`;
                await twilioClient.messages.create({
                    body: `[Aranya AI] Your mobile verification code is: ${otp}. Valid for 90 seconds.`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: formattedNumber
                });
            } catch (smsErr) {
                console.error('[MOBILE-VERIFY] SMS Error:', smsErr.message);
            }
        } else {
            console.warn('[MOBILE-VERIFY] Twilio not configured.');
        }

        return { message: 'Verification code sent to your mobile.' };
    }

    static async verifyMobileConfirm(userId, mobile, otp) {
        if (!mobile || !otp) throw new Error('Mobile and OTP are required');
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        if (user.otp !== otp || !user.otpExpires || user.otpExpires < Date.now()) {
            throw new Error('Invalid or expired verification code.');
        }

        user.mobile = mobile;
        user.mobileVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        try { await logActivity('profile', user, `Verified mobile number: ${mobile}`); } catch (_) { }
        return { message: 'Mobile number verified and linked!', user: { mobile: user.mobile, mobileVerified: true } };
    }

    // ── Verify Email ──
    static async verifyEmailRequest(userId, email) {
        if (!email) throw new Error('Email is required');
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        if (user.lastOtpSentAt) {
            const timePassed = (Date.now() - user.lastOtpSentAt.getTime()) / 1000;
            if (timePassed < 60) throw new Error(`Please wait ${Math.ceil(60 - timePassed)} seconds.`);
        }

        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 90 * 1000);
        user.lastOtpSentAt = new Date();
        await user.save();

        const mailOptions = {
            from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
            to: email,
            subject: 'Email Verification - Aranya AI',
            html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #2D6A4F; text-align: center;">Verify Your Email</h2>
                    <p>Hello${user.full_name ? ` ${user.full_name}` : ''},</p>
                    <p>Use the code below to verify your email address:</p>
                    <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #2D6A4F;">
                        ${otp}
                    </div>
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">This code is valid for <strong>90 seconds</strong>.</p>
                </div>`
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (mailErr) {
            console.error('[EMAIL-VERIFY] Mail Error:', mailErr.message);
            throw new Error('Failed to send verification email.');
        }

        return { message: 'Verification code sent to your email.' };
    }

    static async verifyEmailConfirm(userId, email, otp) {
        if (!email || !otp) throw new Error('Email and OTP are required');
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        if (user.otp !== otp || !user.otpExpires || user.otpExpires < Date.now()) {
            throw new Error('Invalid or expired verification code.');
        }

        user.email = email;
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        try { await logActivity('profile', user, `Verified email address: ${email}`); } catch (_) { }
        return { message: 'Email verified and linked!', user: { email: user.email, isVerified: true } };
    }

    // ── Care Circle ──
    static async getCareCircle(userId) {
        const members = await User.find({ managedBy: userId, role: 'caretaker' })
            .select('full_name email mobile role createdAt profilePic')
            .sort({ createdAt: -1 })
            .lean();
        return members;
    }

    static async inviteCareCircleMember(userId, data) {
        const { full_name, email, mobile, password } = data;
        if (!full_name) throw new Error('Full name is required');

        const owner = await User.findById(userId);
        if (!owner) throw new Error('User not found');

        // Check plan limits
        const userPlan = await Plan.findOne({ code: owner.plan, active: true });
        const maxCareCircleMembers = userPlan ? (userPlan.maxCareCircleMembers || 0) : 0;
        if (maxCareCircleMembers !== -1) {
            const currentCount = await User.countDocuments({ managedBy: userId, role: 'caretaker' });
            if (currentCount >= maxCareCircleMembers) {
                throw new Error(`Plan limit reached: ${maxCareCircleMembers} care circle member(s).`);
            }
        }

        // Check if member already exists
        if (email) {
            const existing = await User.findOne({ email });
            if (existing) throw new Error('A user with this email already exists.');
        }

        const newMember = new User({
            full_name,
            email: email || undefined,
            mobile: mobile || undefined,
            password: password || undefined,
            role: 'caretaker',
            managedBy: userId,
            isVerified: true
        });
        await newMember.save();

        try { await logActivity('staff_management', { id: userId }, `Added new Care Circle member: ${full_name}`); } catch (_) { }

        // Send invitation email if email provided
        if (email) {
            const mailOptions = {
                from: `"Aranya AI" <${process.env.GOOGLE_EMAIL_USER}>`,
                to: email,
                subject: `Welcome to the Care Circle - Aranya AI`,
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                        <h2 style="color: #2D6A4F; font-size: 26px; margin: 0;">Aranya AI Collaboration</h2>
                        <p>Hello ${full_name},</p>
                        <p>You have been invited to join the Care Circle by ${owner.full_name || 'your team lead'}.</p>
                        <p>You can now sign in to Aranya AI to start managing animals and health records.</p>
                        <a href="${process.env.CLIENT_URL || process.env.VITE_CLIENT_URL || 'http://localhost:5173'}/login" style="display:inline-block; background: #2D6A4F; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 16px;">Sign In Now</a>
                        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;">
                        <p style="color: #cbd5e1; font-size: 11px;">&copy; 2026 Aranya AI. All rights reserved.</p>
                    </div>`
            };
            try {
                await transporter.sendMail(mailOptions);
            } catch (mailErr) {
                console.error('[INVITE] Nodemailer execution failed:', mailErr.message);
                throw new Error('Invite created but welcome email failed to send.');
            }
        }

        return { message: 'Invitation email sent!', member: newMember };
    }

    static async removeCareCircleMember(userId, memberId) {
        const member = await User.findOne({ _id: memberId, managedBy: userId });
        if (!member) throw new Error('Member not found or not in your circle');

        await User.findByIdAndDelete(memberId);
        try { await logActivity('staff_management', { id: userId }, `Removed Care Circle member: ${member.full_name}`); } catch (_) { }
        return { message: 'Member removed from Care Circle' };
    }

    static async getCareCircleActivities(userId) {
        const members = await User.find({ managedBy: userId }).select('_id');
        const memberIds = members.map(s => s._id);

        const logs = await ActivityLog.find({
            userId: { $in: [userId, ...memberIds] }
        })
            .sort({ createdAt: -1 })
            .limit(50);

        return logs;
    }

    static generateTokenResponse(user) {
        const payload = { user: { id: user.id, role: user.role, managedBy: user.managedBy } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                mobile: user.mobile,
                role: user.role,
                full_name: user.full_name,
                profilePic: user.profilePic || ''
            }
        };
    }
}

module.exports = AuthService;
