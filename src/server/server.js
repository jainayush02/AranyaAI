const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression'); // Performance: Compress responses
const { logActivity } = require('./utils/logger'); // Move require to top for performance

const app = express();

// ── Performance: Enable Gzip Compression ──
app.use(compression());

// ── Global Rate Limiting (Abuse Protection) ──
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes.' },
    skip: (req) => process.env.NODE_ENV !== 'production' // Skip in dev for testing
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
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

// Optimized CORS - Using a Set for O(1) lookups
const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:5000',
    'https://aranya-ai-five.vercel.app',
    'https://aranya.ai'
]);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
        } else {
            console.warn(`[SECURITY] Blocked CORS request from untrusted origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Middleware: Enforce HTTPS in production (Vercel usually does this, but keeping for safety)
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});

// JSON and Body Parsing - Reduced limit to 10MB to avoid memory pressure on Vercel
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '1d' }));

// ── Global Audit Middleware (Optimized) ──
app.use((req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            // Fire and forget logging (not awaited)
            logActivity('security_audit', null, `[${res.statusCode}] ${req.method} ${req.url} from IP: ${ip}`);
        }
    });
    next();
});

// ── Serverless-safe MongoDB connection caching ──
let cached = global._mongooseCache;
if (!cached) {
    cached = global._mongooseCache = { conn: null, promise: null };
}

// Global connection state monitoring
mongoose.connection.on('connected', () => console.log('✅ MongoDB: Connected to Cluster'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB: Connection Error:', err));
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB: Disconnected. Cache cleared.');
    cached.conn = null;
    cached.promise = null;
});

const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        console.error("❌ CRITICAL: MONGO_URI missing.");
        return null;
    }

    if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
    }

    if (cached.promise) {
        try {
            cached.conn = await cached.promise;
            return cached.conn;
        } catch (err) {
            cached.promise = null;
        }
    }

    // Optimization: Reduced pool size and timeouts for faster serverless response
    const options = {
        serverSelectionTimeoutMS: 5000,  // Reduced from 20s to 5s
        socketTimeoutMS: 45000,
        maxPoolSize: 10,                // Reduced from 50 to 10 (ideal for Vercel)
        minPoolSize: 0,
        heartbeatFrequencyMS: 30000,
        connectTimeoutMS: 10000,
        dbName: 'aranya_db',
        family: 4,
        maxIdleTimeMS: 60000,
        waitQueueTimeoutMS: 10000
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, options).then((m) => {
        return m;
    }).catch((err) => {
        console.error(`❌ MongoDB Error: ${err.message}`);
        cached.promise = null;
        throw err;
    });

    try {
        cached.conn = await cached.promise;
    } catch (err) {
        cached.conn = null;
    }
    return cached.conn;
};

// ── Middleware: ensure DB is connected ──
app.use('/api', async (req, res, next) => {
    try {
        const conn = await connectDB();
        if (!conn) throw new Error('DB Connection Failed');
        next();
    } catch (err) {
        res.status(503).json({ message: 'Database busy. Retrying...' });
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

// Start local server
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Backend server running on port ${PORT}`);
        connectDB().catch(() => { });
    });
}

module.exports = app;
