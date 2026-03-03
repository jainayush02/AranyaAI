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

// Database connection
const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            console.warn("MONGO_URI not found. Starting server without database connection. Please add it to your .env file.");
            return;
        }
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000, // Fail fast if DB unreachable
            socketTimeoutMS: 45000,         // Close sockets after 45s of inactivity
        });
        console.log('MongoDB Connected successfully');
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        // Don't exit process, allow the server to run so the user can see the warning
    }
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
