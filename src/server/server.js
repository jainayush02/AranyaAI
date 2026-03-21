const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Global Rate Limiting (Abuse Protection) ──
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { message: 'Too many requests from this IP, please try again after 15 minutes.' }
});

// App-wide production protection
if (process.env.NODE_ENV === 'production') {
    app.use('/api', globalLimiter);
}

// Security headers - Enforce HSTS and prevent clickjacking/sniffing
app.use(helmet({
    contentSecurityPolicy: false, // Disable if using external scripts/images
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Allow Google SSO popups
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

// Tightened CORS - ONLY allow trusted origins
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5000',
    'https://aranya-ai-five.vercel.app',
    'https://aranya.ai'
];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Log suspicious origin attempts
            console.warn(`[SECURITY] Blocked CORS request from untrusted origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Middleware: Enforce HTTPS in production
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Global Audit Middleware ──
app.use((req, res, next) => {
    const originalSend = res.send;
    res.send = function (content) {
        if (res.statusCode >= 400) {
            const { logActivity } = require('./utils/logger');
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            logActivity('security_audit', null, `[${res.statusCode}] ${req.method} ${req.url} from IP: ${ip}`);
        }
        return originalSend.apply(res, arguments);
    };
    next();
});

// ── Serverless-safe MongoDB connection caching ──
let cached = global._mongooseCache;
if (!cached) {
    cached = global._mongooseCache = { conn: null, promise: null };
}

// Global connection state monitoring
mongoose.connection.on('connected', () => console.log('✅ MongoDB: Connected to Cluster'));
mongoose.connection.on('reconnected', () => console.log('🟢 MongoDB: Connection Restored'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB: Connection Error:', err));
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB: Disconnected. Attempting to restore...');
    cached.conn = null;
    cached.promise = null;
});

const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        console.warn("MONGO_URI not found. Starting server without database connection.");
        return;
    }

    // Return existing connection if healthy
    if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
    }

    // If currently connecting, wait for the existing promise
    if (cached.promise) {
        try {
            cached.conn = await cached.promise;
            return cached.conn;
        } catch (err) {
            console.error('🔄 MongoDB: Existing connection promise failed, resetting...');
            cached.promise = null; // Reset on failure
        }
    }

    // Initialize new connection
    console.log('🔄 MongoDB: Initializing connection...');
    const options = {
        serverSelectionTimeoutMS: 20000, // Increased for stability on slow networks
        socketTimeoutMS: 45000,
        maxPoolSize: 15,                 // Slightly higher for local concurrent requests
        minPoolSize: 5,                  // Keep more warm connections
        heartbeatFrequencyMS: 5000,      // Faster heartbeat to detect local drops
        maxIdleTimeMS: 30000,            // Close idle connections to prevent stale ones
        waitQueueTimeoutMS: 10000,
        connectTimeoutMS: 15000
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, options).then((m) => {
        return m;
    }).catch((err) => {
        console.error(`❌ MongoDB: Critical error during initial connect: ${err.message}`);
        cached.promise = null;
        throw err;
    });

    try {
        cached.conn = await cached.promise;

        // Background ping for long-running processes (Localhost stability)
        if (process.env.NODE_ENV !== 'production' && !global._pingInterval) {
            global._pingInterval = setInterval(() => {
                if (mongoose.connection.readyState === 1) {
                    mongoose.connection.db.admin().ping()
                        .catch(e => console.warn('📡 MongoDB Keep-alive ping failed'));
                }
            }, 30000);
        }

    } catch (err) {
        cached.conn = null;
    }
    return cached.conn;
};

// ── Middleware: ensure DB is connected before ANY API request ──
app.use('/api', async (req, res, next) => {
    try {
        const conn = await connectDB();
        if (!conn) throw new Error('DB Connection Failed');
        next();
    } catch (err) {
        console.error(`[RESTORE] Middleware caught DB failure: ${err.message}`);
        res.status(503).json({
            message: 'Database connection lost. We are automatically attempting to restore it.'
        });
    }
});

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/animals', require('./routes/animals'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/docs', require('./routes/docs'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/plans', require('./routes/plans'));

// Start local server (not on Vercel)
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Backend server running on port ${PORT}`);
        // Attempt background connection; middleware will handle the rest
        connectDB().catch(err => console.error('Initial DB connect trial failed:', err.message));
    });
}

// Export for Vercel
module.exports = app;
