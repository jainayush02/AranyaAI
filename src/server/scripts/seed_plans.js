require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Plan = require('../models/Plan');

async function seedPlans() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Check if plans exist
        const count = await Plan.countDocuments();
        if (count > 0) {
            console.log('Plans already exist. Aborting seed over-write.');
            process.exit(0);
        }

        const defaultPlans = [
            {
                name: 'Free Starter',
                code: 'free',
                price: 0,
                maxAnimals: 3,
                dailyChatMessages: 5,
                dailyImageUploads: 1,
                medicalVaultStorageMB: 10,
                maxCareCircleMembers: 0,
                allowExport: false,
                allowBulkImport: false,
                allowAdvancedAI: false,
                isDefault: true,
                active: true
            },
            {
                name: 'Pro Standard',
                code: 'pro',
                price: 199,
                maxAnimals: 50,
                dailyChatMessages: -1, // unlimited
                dailyImageUploads: 50,
                medicalVaultStorageMB: 500,
                maxCareCircleMembers: 3,
                allowExport: true,
                allowBulkImport: true,
                allowAdvancedAI: true,
                isDefault: false,
                active: true
            },
            {
                name: 'MaxPro Enterprise',
                code: 'max-pro',
                price: 999,
                maxAnimals: -1, // unlimited
                dailyChatMessages: -1,
                dailyImageUploads: -1,
                medicalVaultStorageMB: -1,
                maxCareCircleMembers: -1,
                allowExport: true,
                allowBulkImport: true,
                allowAdvancedAI: true,
                isDefault: false,
                active: true
            }
        ];

        for (const p of defaultPlans) {
            await Plan.create(p);
            console.log(`Created plan: ${p.name}`);
        }

        console.log('Finished seeding plans.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seedPlans();
