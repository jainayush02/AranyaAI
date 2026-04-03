const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize'); // Keep if needed for other parts, or remove
const hpp = require('hpp');
const { logActivity } = require('./utils/logger');

const app = express();

// ── Trust Proxy: Required for accurate IP rate limiting on Vercel ──
app.set('trust proxy', 1);

// ── Performance: Enable Gzip Compression ──
app.use(compression());

// ── Global Rate Limiting (Abuse Protection) ──
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
    skip: (req) => process.env.NODE_ENV !== 'production'
});

// ── Auth & Sensitive Route Limiting (Brute Force Protection) ──
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // Strict limit for login/OTP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again after 15 minutes.' }
});

const adminLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Admin rate limit exceeded.' }
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
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5000',
    'https://aranya-ai-five.vercel.app',
    'https://aranyaai.vercel.app',
    'https://aranya.ai'
]);

// Add CLIENT_URL from environment if available
if (process.env.CLIENT_URL) {
    allowedOrigins.add(process.env.CLIENT_URL.trim());
    // Also add versions with/without trailing slashes
    if (process.env.CLIENT_URL.endsWith('/')) {
        allowedOrigins.add(process.env.CLIENT_URL.slice(0, -1));
    } else {
        allowedOrigins.add(`${process.env.CLIENT_URL}/`);
    }
}

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

// ── Security Middleware: Manual Input Sanitization (Safe for Vercel/Node 18+) ──
// Definitively avoids 'Cannot set property query' TypeError by only targeting mutable keys
const nosqlSanitize = (v) => {
    if (v instanceof Object) {
        for (const key in v) {
            if (/^\$/.test(key)) {
                delete v[key];
            } else {
                nosqlSanitize(v[key]);
            }
        }
    }
    return v;
};

app.use((req, res, next) => {
    if (req.body) nosqlSanitize(req.body);
    if (req.params) nosqlSanitize(req.params);
    next();
});
app.use(hpp());
// xss-clean is older; helmet handles most modern XSS vectors, 
// using it as an additional layer only if needed.

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '1d',
    setHeaders: (res, path) => {
        res.set('X-Content-Type-Options', 'nosniff'); // Prevent MIME type sniffing
        res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline';"); // Restricted CSP for uploads
    }
}));

// ── Centralized Error Handling (Hardened) ──
app.use((err, req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';
    console.error(`[INTERNAL_ERROR] ${err.stack}`);
    
    // Privacy: Never reveal server internal stacks in production
    res.status(err.status || 500).json({
        message: isProd ? 'A server-side error occurred. Please contact support.' : err.message,
        error: isProd ? {} : err
    });
});

// ── Graceful Shutdown Lifecycle ──
const gracefulShutdown = async (signal) => {
    console.log(`\n[${signal}] Received. Shutting down gracefully...`);
    try {
        await mongoose.connection.close();
        console.log('✅ MongoDB: Connection closed.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Shutdown Error:', err);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── Global Audit Middleware (Optimized) ──
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
        if (res.statusCode >= 400) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const ua = req.headers['user-agent'];
            // Fire and forget logging (not awaited)
            logActivity('security_audit', null, `[${res.statusCode}] ${req.method} ${req.url} from IP: ${ip}`, { ip, userAgent: ua });
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
        throw new Error("MONGO_URI environment variable is not defined.");
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

    // Optimization: Balanced pool size and timeouts for robustness (Free Tier Optimized)
    const options = {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        maxPoolSize: 5,        // Reduced from 10 to 5 to prevent connection exhaustion on Atlas Free Tier
        minPoolSize: 0,
        heartbeatFrequencyMS: 30000,
        connectTimeoutMS: 30000,
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
        throw err;
    }
    return cached.conn;
};

// ── Serverless DB Connection Middleware ──
const ensureDB = async (req, res, next) => {
    try {
        if (!process.env.JWT_SECRET) {
            console.error("❌ CRITICAL: JWT_SECRET missing.");
            if (process.env.NODE_ENV === 'production') {
                return res.status(500).json({ message: 'Server configuration error: JWT_SECRET missing.' });
            }
        }
        await connectDB();
        next();
    } catch (err) {
        console.error("[DB_MIDDLEWARE_ERROR]", err.message);
        res.status(500).json({
            message: 'Database connection failed. Check MONGO_URI and IP whitelist.',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Apply to all API and Upload routes to ensure DB is connected before handling logic
app.use('/api', ensureDB);
app.use('/uploads', ensureDB);

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/animals', require('./routes/animals'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/docs', require('./routes/docs'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/chiron', require('./routes/chiron').router);

app.use((err, req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';
    console.error(`[INTERNAL_ERROR] ${err.stack}`);

    res.status(err.status || 500).json({
        message: isProd ? 'A server-side error occurred. Please contact support.' : err.message,
        error: isProd ? {} : err
    });
});

// Start local server
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Backend server running on port ${PORT}`);
        connectDB().catch(() => { });
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ CRITICAL: Port ${PORT} is already in use by another process.`);
            console.error(`- Run './kill_all.ps1' to clear active processes.`);
        } else {
            console.error('❌ Server error:', err.message);
        }
        process.exit(1);
    });
}

module.exports = app;
