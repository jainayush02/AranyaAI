require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const animalRoutes = require('./routes/animals');
const settingsRoutes = require('./routes/settings');
const chatRoutes = require('./routes/chat');
const docsRoutes = require('./routes/docs');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/animals', animalRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/admin', adminRoutes);

// Serverless-safe MongoDB connection caching
// Persists across warm function invocations on Vercel
let cached = global._mongooseCache;
if (!cached) {
    cached = global._mongooseCache = { conn: null, promise: null };
}

const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        console.warn("MONGO_URI not found. Starting server without database connection.");
        return;
    }

    // Return existing connection if still alive
    if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
    }

    // Reuse in-flight connection promise to avoid duplicate connections
    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: true,
        }).then((m) => {
            console.log('MongoDB Connected successfully');
            return m;
        }).catch((err) => {
            console.error(`Error connecting to MongoDB: ${err.message}`);
            cached.promise = null; // Reset so next request retries
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

connectDB();

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Backend server running on port ${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
