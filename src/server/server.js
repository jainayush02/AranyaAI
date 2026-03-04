require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Serverless-safe MongoDB connection caching ──
let cached = global._mongooseCache;
if (!cached) {
    cached = global._mongooseCache = { conn: null, promise: null };
}

const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        console.warn("MONGO_URI not found. Starting server without database connection.");
        return;
    }
    if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
    }
    // Reset stale connections
    if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
        cached.promise = null;
    }
    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        }).then((m) => {
            console.log('MongoDB Connected successfully');
            return m;
        }).catch((err) => {
            console.error(`MongoDB connection error: ${err.message}`);
            cached.promise = null;
            throw err;
        });
    }
    try {
        cached.conn = await cached.promise;
    } catch (err) {
        cached.conn = null;
    }
    return cached.conn;
};

// ── Middleware: ensure DB is connected before ANY API request ──
app.use('/api', async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        res.status(503).json({ message: 'Database temporarily unavailable. Please try again.' });
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
    connectDB().then(() => {
        app.listen(PORT, () => {
            console.log(`Backend server running on port ${PORT}`);
        });
    });
}

// Export for Vercel
module.exports = app;
