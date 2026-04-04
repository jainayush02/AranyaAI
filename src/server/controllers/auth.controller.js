const AuthService = require('../services/auth.service');
const User = require('../models/User');
const Animal = require('../models/Animal');
const { logActivity } = require('../utils/logger');

class AuthController {
    static async requestOTP(req, res, next) {
        try {
            const data = await AuthService.requestOTP(req.body);
            res.status(200).json(data);
        } catch (error) {
            res.status(error.message.includes('wait') ? 429 : 400).json({ message: error.message });
        }
    }

    static async register(req, res, next) {
        try {
            const data = await AuthService.register(req.body);
            res.status(201).json(data);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    }

    static async login(req, res, next) {
        try {
            const data = await AuthService.login(req.body);
            res.status(200).json(data);
        } catch (error) {
            res.status(error.message.includes('suspended') ? 403 : 401).json({ message: error.message });
        }
    }

    static async adminLogin(req, res, next) {
        try {
            const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
            const data = await AuthService.adminLogin({ ...req.body, ip });
            res.status(200).json(data);
        } catch (error) {
            res.status(error.message.includes('Try again') ? 429 : 401).json({ message: error.message });
        }
    }

    static async googleLogin(req, res, next) {
        try {
            const data = await AuthService.googleLogin(req.body);
            res.status(200).json(data);
        } catch (error) {
            res.status(401).json({ message: error.message });
        }
    }

    static async googleAdminLogin(req, res, next) {
        try {
            const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
            const data = await AuthService.googleAdminLogin({ accessToken: req.body.accessToken, ip });
            res.status(200).json(data);
        } catch (error) {
            res.status(401).json({ message: error.message });
        }
    }

    static async getProfile(req, res, next) {
        try {
            const user = await AuthService.getProfile(req.user.id);
            res.json(user);
        } catch (error) {
            res.status(500).json({ message: 'Server Error' });
        }
    }

    static async updateProfile(req, res, next) {
        try {
            const user = await AuthService.updateProfile(req.user.id, req.body);
            res.status(200).json({ message: 'Profile updated', user });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    }

    static async deleteAccount(req, res, next) {
        try {
            await AuthService.deleteAccount(req.user.id);
            res.status(200).json({ message: 'Account and all related data deleted successfully.' });
        } catch (error) {
            res.status(error.message.includes('Administrator') ? 403 : 500).json({ message: error.message });
        }
    }

    static async uploadProfilePic(req, res, next) {
        try {
            if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
            const user = await AuthService.uploadProfilePic(req.user.id, req.file);
            res.status(200).json({ message: 'Profile picture updated', profilePic: user.profilePic, user });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    static async sendReport(req, res, next) {
        try {
            const user = await User.findById(req.user.id);
            if (!user) return res.status(404).json({ message: 'User not found' });
            if (!user.email) return res.status(400).json({ message: 'No email address found.' });

            const animals = await Animal.find({ user_id: user.id });
            const { sendWeeklyDigest } = require('../utils/notifications');
            const success = await sendWeeklyDigest(user, animals, true);

            if (success) res.json({ message: `Success! Performance digest sent to ${user.email}.` });
            else res.status(400).json({ message: `We could not reach ${user.email}.` });
        } catch (error) {
            res.status(500).json({ message: 'A server error occurred' });
        }
    }

    static async forgotPasswordRequest(req, res, next) {
        try {
            await AuthService.forgotPasswordRequest(req.body.email);
            res.status(200).json({ message: 'If an account exists, a reset code has been sent.' });
        } catch (error) {
            res.status(error.message.includes('wait') ? 429 : 500).json({ message: error.message });
        }
    }

    static async forgotPasswordReset(req, res, next) {
        try {
            await AuthService.forgotPasswordReset(req.body);
            res.status(200).json({ message: 'Your password has been successfully reset.' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    }

    static async adminForgotPasswordRequest(req, res, next) {
        try {
            await AuthService.adminForgotPasswordRequest(req.body.email);
            res.status(200).json({ message: 'If an admin account exists, a reset code has been sent.' });
        } catch (error) {
            res.status(error.message.includes('wait') ? 429 : 500).json({ message: error.message });
        }
    }

    static async adminForgotPasswordReset(req, res, next) {
        try {
            await AuthService.adminForgotPasswordReset(req.body);
            res.status(200).json({ message: 'Admin password has been successfully reset.' });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    }

    // ── Verify Mobile ──
    static async verifyMobileRequest(req, res, next) {
        try {
            const result = await AuthService.verifyMobileRequest(req.user.id, req.body.mobile);
            res.status(200).json(result);
        } catch (error) {
            res.status(error.message.includes('wait') ? 429 : 400).json({ message: error.message });
        }
    }

    static async verifyMobileConfirm(req, res, next) {
        try {
            const result = await AuthService.verifyMobileConfirm(req.user.id, req.body.mobile, req.body.otp);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    }

    // ── Verify Email ──
    static async verifyEmailRequest(req, res, next) {
        try {
            const result = await AuthService.verifyEmailRequest(req.user.id, req.body.email);
            res.status(200).json(result);
        } catch (error) {
            res.status(error.message.includes('wait') ? 429 : 400).json({ message: error.message });
        }
    }

    static async verifyEmailConfirm(req, res, next) {
        try {
            const result = await AuthService.verifyEmailConfirm(req.user.id, req.body.email, req.body.otp);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    }

    // ── Care Circle ──
    static async getCareCircle(req, res, next) {
        try {
            const members = await AuthService.getCareCircle(req.user.id);
            res.json(members);
        } catch (error) {
            res.status(500).json({ message: 'Server Error' });
        }
    }

    static async inviteCareCircleMember(req, res, next) {
        try {
            const result = await AuthService.inviteCareCircleMember(req.user.id, req.body);
            res.status(201).json(result);
        } catch (error) {
            res.status(error.message.includes('limit') ? 403 : 400).json({ message: error.message });
        }
    }

    static async removeCareCircleMember(req, res, next) {
        try {
            const result = await AuthService.removeCareCircleMember(req.user.id, req.params.id);
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    static async getCareCircleActivities(req, res, next) {
        try {
            const logs = await AuthService.getCareCircleActivities(req.user.id);
            res.json(logs);
        } catch (error) {
            res.status(500).json({ message: 'Server Error' });
        }
    }
}

module.exports = AuthController;
