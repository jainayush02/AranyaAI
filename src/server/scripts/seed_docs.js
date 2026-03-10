require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const mongoose = require('mongoose');

// Load DocArticle model
const DocArticle = require('../models/DocArticle');

const SEED_DOCS = [
    // ── Getting Started ─────────────────────────────────
    {
        title: 'Introduction to Aranya AI',
        category: 'getting-started',
        order: 1,
        published: true,
        content: `
<p>Aranya AI is your advanced intelligent companion for livestock management. Our platform combines cutting-edge AI analytics with user-friendly interfaces to help farmers monitor health, predict risks, and optimize farm productivity.</p>
<h3>Core Philosophy</h3>
<p>We believe that technology should empower, not complicate. Aranya AI is built to provide actionable insights that directly impact the well-being of your animals and the efficiency of your operations.</p>
<h3>What You Can Do</h3>
<p>With Aranya AI, you can track individual animal health vitals, get AI-driven risk predictions, log temperature and pulse readings, and view a complete health history for each animal in your herd.</p>
        `.trim(),
        steps: [
            'Create your account using your email or mobile number',
            'Complete your farm profile setup',
            'Add your first animal from the Dashboard',
            'Start logging health data for AI predictions'
        ]
    },
    {
        title: 'Adding Your First Animal',
        category: 'getting-started',
        order: 2,
        published: true,
        content: `
<p>Ready to start tracking? Adding an animal is the first step towards data-driven farming. Follow these steps to get your first record into the system.</p>
<h3>Required Information</h3>
<p>Make sure you have the animal's name, age, and breed information ready before starting the process. A unique Tag ID is optional but recommended for large herds.</p>
<h3>After Adding</h3>
<p>Once added, the animal will appear on your dashboard. You can then open its profile to start logging health vitals like temperature and heart rate.</p>
        `.trim(),
        steps: [
            'Navigate to the Dashboard',
            'Click the green "+ Add New Animal" button (top right)',
            'Enter the animal Name and Breed in the dialog',
            'Click "Add Animal" to save to your herd',
            'Click on the animal card to open its health profile'
        ]
    },
    {
        title: 'Logging Health Data',
        category: 'getting-started',
        order: 3,
        published: true,
        content: `
<p>Consistency is key to accurate AI predictions. Log health data daily or weekly to ensure the system has enough data to detect subtle changes in animal behavior or physical status.</p>
<h3>Why Consistent Logging Matters</h3>
<p>Aranya AI's machine learning model improves with more data. The more health readings you log, the more accurately the system can predict risk and alert you to potential issues before they become serious.</p>
<h3>What to Log</h3>
<p>Focus on temperature, heart rate (pulse), and behavioral observations. These three indicators are the strongest predictors of health status.</p>
        `.trim(),
        steps: [
            'Open an Animal Profile from the Dashboard',
            'Scroll to the "Log Health Data" section',
            'Input current Temperature (°C) using the slider',
            'Input current Heart Rate (BPM)',
            'Add behavioral notes if anything seems unusual',
            'Click "Save Health Log" — AI prediction runs automatically'
        ]
    },
    {
        title: 'Understanding Health Status',
        category: 'getting-started',
        order: 4,
        published: true,
        content: `
<p>Each animal in Aranya AI is assigned a health status based on its most recent vitals and AI analysis. Understanding these statuses helps you prioritize care.</p>
<h3>Status Levels</h3>
<p><strong>✅ Healthy</strong> — All vitals are within normal range. No immediate action needed.</p>
<p><strong>⚠️ Needs Attention</strong> — One or more vitals are slightly outside normal range. Monitor closely and consider consulting a vet.</p>
<p><strong>🔴 Critical</strong> — Vitals are significantly abnormal. Immediate veterinary attention is recommended.</p>
<h3>AI Confidence Score</h3>
<p>Each prediction comes with a confidence percentage. Higher confidence means the AI has more data to work with and the prediction is more reliable.</p>
        `.trim(),
        steps: [
            'View the colored status badge on each animal card on the Dashboard',
            'Green = Healthy, Yellow = Attention, Red = Critical',
            'Open the animal profile for a detailed breakdown',
            'Check the AI prediction confidence score',
            'Use the health trend chart to see changes over time'
        ]
    },

    // ── Features ─────────────────────────────────────────
    {
        title: 'Dashboard Overview',
        category: 'features',
        order: 1,
        published: true,
        content: `
<p>The Aranya Dashboard provides a high-level view of your entire farm. Here's a breakdown of the key metrics you'll see every time you log in.</p>
<h3>Summary Cards</h3>
<p>At the top of the dashboard, you'll find four summary cards showing: Total Cattle, Healthy animals, Animals Needing Attention, and Critical cases. These update in real time as you add health logs.</p>
<h3>Herd Grid</h3>
<p>Below the summary cards is your herd grid — a visual collection of all your animals. Each card shows the animal's name, breed, and current health status at a glance.</p>
<h3>AI Insights Banner</h3>
<p>The green banner at the top of the herd grid shows an AI-generated insight about your overall herd health score. This updates automatically based on the latest health logs.</p>
        `.trim(),
        steps: [
            'View the 4 summary stat cards at the top for a quick herd overview',
            'Read the AI Insights banner for an overall herd health score',
            'Use the search bar to quickly find a specific animal by name',
            'Click any animal card to open its detailed health profile',
            'Use "Select All" for bulk actions like deleting multiple animals'
        ]
    },
    {
        title: 'Animal Profiles',
        category: 'features',
        order: 2,
        published: true,
        content: `
<p>Each animal in your herd has a dedicated profile page that serves as the complete health record for that animal.</p>
<h3>Profile Sections</h3>
<p>The profile is organized into sections: the hero section (name, breed, current vitals), the health log form, and the health history.</p>
<h3>Vital Cards</h3>
<p>The blue and green vital cards show the last recorded temperature and heart rate. These update every time you submit a new health log.</p>
<h3>Health Form</h3>
<p>Use the form to record new health readings. The AI processes the data immediately and updates the animal's status prediction in real time.</p>
        `.trim(),
        steps: [
            'Click on any animal card from the Dashboard',
            'View current vitals (temperature, heart rate) in the colored cards',
            'Scroll down to the "Log Health Data" form',
            'Adjust the temperature slider and heart rate input',
            'Click "Save & Run AI Analysis" for instant predictions',
            'Use the "← Back" button to return to the Dashboard'
        ]
    },
    {
        title: 'Health Trends & Analytics',
        category: 'features',
        order: 3,
        published: true,
        content: `
<p>Aranya AI goes beyond simple data logging — it analyzes trends in your animal's vitals over time to provide predictive health insights.</p>
<h3>How the AI Works</h3>
<p>The AI model uses an LSTM (Long Short-Term Memory) neural network trained on livestock health data to detect patterns that may indicate developing health issues, even before visible symptoms appear.</p>
<h3>Risk Prediction</h3>
<p>The model outputs a risk score from 0 to 100. Low scores (0–33) indicate healthy status, mid-range (34–66) indicates attention needed, and high scores (67–100) indicate critical status.</p>
<h3>Data Requirements</h3>
<p>For best results, log at least 5–7 data points for an animal before relying on predictions. More data = higher confidence = more reliable alerts.</p>
        `.trim(),
        steps: [
            'Log health data consistently for best AI accuracy',
            'Open an animal profile to view the current AI risk score',
            'Higher confidence % = more reliable prediction',
            'Watch for status changes from Healthy → Attention as an early warning',
            'Contact a vet immediately if status changes to Critical'
        ]
    },
    {
        title: 'AI Assistant Guide',
        category: 'features',
        order: 4,
        published: true,
        content: `
<p>The Aranya AI Assistant is an intelligent chatbot powered by Gemini AI that can answer questions about livestock health, farm management, diet, and the Aranya platform itself.</p>
<h3>How to Access</h3>
<p>Click the green chat bubble icon in the bottom-right corner of any page to open the AI Assistant. It's available on all pages except the Admin console.</p>
<h3>What You Can Ask</h3>
<p>The assistant can help with: symptoms of common cattle diseases, dietary recommendations, vaccination schedules, interpreting health readings, and how to use Aranya AI features.</p>
<h3>Chat History</h3>
<p>Your conversation history is saved automatically. You can access previous chats from the sidebar inside the chat window, rename conversations, or delete them.</p>
        `.trim(),
        steps: [
            'Click the green 💬 chat icon in the bottom-right corner',
            'Type your question in the input box at the bottom',
            'You can also upload images for visual analysis',
            'Click the sidebar icon to view your chat history',
            'Start a new conversation with the "+ New Chat" button',
            'Rename or delete conversations by hovering over them in the sidebar'
        ]
    },

    // ── Video Tutorials ───────────────────────────────────
    {
        title: 'Complete Walkthrough',
        category: 'video-tutorials',
        order: 1,
        published: true,
        content: `
<p>This video tutorial provides a complete walkthrough of the Aranya AI platform — from account creation to logging your first health record and reading AI predictions.</p>
<p>Perfect for new users getting started for the first time. Follow along step by step to set up your farm profile and add your first animal.</p>
        `.trim(),
        steps: []
    },
    {
        title: 'Health Monitoring Best Practices',
        category: 'video-tutorials',
        order: 2,
        published: true,
        content: `
<p>Learn the best practices for monitoring your livestock health using Aranya AI. This video covers how often to log health data, what readings matter most, and how to interpret the AI's predictions.</p>
<p>Ideal for farmers who have already set up their account and want to get more value from the health tracking system.</p>
        `.trim(),
        steps: []
    },
    {
        title: 'Using the AI Assistant',
        category: 'video-tutorials',
        order: 3,
        published: true,
        content: `
<p>A deep-dive tutorial on using the Aranya AI chatbot. Learn how to ask effective questions, use image uploads for visual analysis, and manage your conversation history.</p>
<p>This video also covers tips for getting the most accurate and helpful responses from the AI assistant.</p>
        `.trim(),
        steps: []
    },
    {
        title: 'Tips for Farmers',
        category: 'video-tutorials',
        order: 4,
        published: true,
        content: `
<p>Practical tips and tricks from experienced farmers using Aranya AI. This video covers time-saving workflows, how to use bulk actions, and how to organize a large herd efficiently.</p>
<p>Includes real-world advice on integrating daily health logging into your farm routine without it feeling like extra work.</p>
        `.trim(),
        steps: []
    }
];

async function seedDocs() {
    try {
        // Load .env from server directory
        require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('❌ MONGO_URI not found in .env file!');
            process.exit(1);
        }

        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected!\n');

        // Check existing count
        const existing = await DocArticle.countDocuments();
        if (existing > 0) {
            console.log(`⚠️  Found ${existing} existing articles. Clearing them first...`);
            await DocArticle.deleteMany({});
            console.log('🗑️  Cleared existing articles.\n');
        }

        console.log(`📚 Seeding ${SEED_DOCS.length} documentation articles...\n`);
        let count = 0;
        for (const doc of SEED_DOCS) {
            await DocArticle.create(doc);
            count++;
            console.log(`  ✅ [${count}/${SEED_DOCS.length}] "${doc.title}" (${doc.category})`);
        }

        console.log(`\n🎉 Done! ${count} articles imported successfully.`);
        console.log('   Refresh the Documentation page to see them.\n');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err.message);
        process.exit(1);
    }
}

seedDocs();
