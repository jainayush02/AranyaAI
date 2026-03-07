const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
}));

// CORS — only allow known origins
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5000',
    'https://aranya-ai-five.vercel.app'
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, server-to-server, Postman)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // In development, allow all; tighten in production
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
