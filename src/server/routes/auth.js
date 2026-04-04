const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

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

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype) return cb(null, true);
        cb('Error: Images Only!');
    }
});

// @route POST /api/auth/request-otp
router.post('/request-otp', authLimiter, AuthController.requestOTP);

// @route POST /api/auth/register
router.post('/register', authLimiter, AuthController.register);

// @route POST /api/auth/login
router.post('/login', authLimiter, AuthController.login);

// @route POST /api/auth/admin-login
router.post('/admin-login', authLimiter, AuthController.adminLogin);

// @route POST /api/auth/google
router.post('/google', authLimiter, AuthController.googleLogin);

// @route POST /api/auth/google-admin
router.post('/google-admin', authLimiter, AuthController.googleAdminLogin);

// @route GET /api/auth/profile
router.get('/profile', authMiddleware, AuthController.getProfile);

// @route PUT /api/auth/profile
router.put('/profile', authMiddleware, AuthController.updateProfile);

// @route DELETE /api/auth/profile
router.delete('/profile', authMiddleware, AuthController.deleteAccount);

// @route POST /api/auth/send-report
router.post('/send-report', authMiddleware, AuthController.sendReport);

// @route POST /api/auth/profile/upload
router.post('/profile/upload', authMiddleware, upload.single('profilePic'), AuthController.uploadProfilePic);

// @route POST /api/auth/forgot-password/request
router.post('/forgot-password/request', AuthController.forgotPasswordRequest);

// @route POST /api/auth/forgot-password/reset
router.post('/forgot-password/reset', AuthController.forgotPasswordReset);

// @route POST /api/auth/forgot-password/admin/request
router.post('/forgot-password/admin/request', AuthController.adminForgotPasswordRequest);

// @route POST /api/auth/forgot-password/admin/reset
router.post('/forgot-password/admin/reset', AuthController.adminForgotPasswordReset);

// @route POST /api/auth/verify-mobile/request
router.post('/verify-mobile/request', authMiddleware, AuthController.verifyMobileRequest);

// @route POST /api/auth/verify-mobile/confirm
router.post('/verify-mobile/confirm', authMiddleware, AuthController.verifyMobileConfirm);

// @route POST /api/auth/verify-email/request
router.post('/verify-email/request', authMiddleware, AuthController.verifyEmailRequest);

// @route POST /api/auth/verify-email/confirm
router.post('/verify-email/confirm', authMiddleware, AuthController.verifyEmailConfirm);

// @route GET /api/auth/care-circle
router.get('/care-circle', authMiddleware, AuthController.getCareCircle);

// @route POST /api/auth/care-circle/invite
router.post('/care-circle/invite', authMiddleware, AuthController.inviteCareCircleMember);

// @route DELETE /api/auth/care-circle/:id
router.delete('/care-circle/:id', authMiddleware, AuthController.removeCareCircleMember);

// @route GET /api/auth/care-circle/activities
router.get('/care-circle/activities', authMiddleware, AuthController.getCareCircleActivities);

module.exports = router;
