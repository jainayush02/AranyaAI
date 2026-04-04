jest.mock('../models/User');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../models/ActivityLog');

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ActivityLog = require('../models/ActivityLog');
const AuthService = require('../services/auth.service');

describe('AuthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock ActivityLog.create to resolve immediately
        ActivityLog.create.mockResolvedValue({});
        // Mock Nodemailer sendMail to resolve immediately
        if (AuthService.transporter) {
            AuthService.transporter.sendMail = jest.fn().mockResolvedValue({ messageId: 'mock-id' });
        }
    });

    test('registerUser - should successfully register a user', async () => {
        const mockUser = {
            id: '123',
            email: 'test@example.com',
            otp: '123456',
            otpExpires: Date.now() + 100000,
            save: jest.fn().mockResolvedValue(true)
        };

        // CORRECT — no existing user found, allow registration
        User.findOne.mockResolvedValue(null);
        User.mockImplementation(() => ({
            ...mockUser,
            save: jest.fn().mockResolvedValue(mockUser)
        }));
        jwt.sign.mockReturnValue('mockToken');

        const result = await AuthService.register({ email: 'test@example.com', password: 'password123', otp: '123456' });
        expect(result.token).toBe('mockToken');
    });

    it('should throw error if email already registered', async () => {
        const mockUser = { email: 'already@exists.com', isVerified: true };
        User.findOne.mockResolvedValue(mockUser); // email exists and verified
        
        await expect(AuthService.register({ email: mockUser.email, password: 'password123', otp: '123456' }))
            .rejects.toThrow(/already exists/i);
    });

    test('loginUser - should successfully login a user with correct password', async () => {
        const mockUser = {
            id: '123',
            password: 'hashedPassword',
            comparePassword: jest.fn().mockResolvedValue(true),
            save: jest.fn().mockResolvedValue(true)
        };
        User.findOne.mockResolvedValue(mockUser);
        jwt.sign.mockReturnValue('mockToken');

        const result = await AuthService.login({ email: 'test@example.com', password: 'password' });
        expect(result.token).toBe('mockToken');
    });

    test('adminForgotPasswordRequest - should generate OTP for admin', async () => {
        const mockAdmin = {
            id: 'admin123',
            email: 'admin@aranya.ai',
            role: 'admin',
            save: jest.fn().mockResolvedValue(true)
        };
        User.findOne.mockResolvedValue(mockAdmin);
        
        const result = await AuthService.adminForgotPasswordRequest('admin@aranya.ai');
        expect(result.success).toBe(true);
        expect(mockAdmin.otp).toBeDefined();
        expect(mockAdmin.save).toHaveBeenCalled();
    });
});
