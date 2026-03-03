const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const emailToPromote = process.argv[2];

if (!emailToPromote) {
    console.log('\n---------------------------------------------------------');
    console.log('Aranya AI Ownership Setup');
    console.log('---------------------------------------------------------');
    console.log('Usage: node promote_admin.js [your-email]');
    console.log('Example: node promote_admin.js ayush.jain098@gmail.com');
    console.log('---------------------------------------------------------\n');
    process.exit(1);
}

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
    console.error('Error: MONGO_URI not found in .env file.');
    process.exit(1);
}

mongoose.connect(mongoUri)
    .then(async () => {
        const user = await User.findOneAndUpdate(
            { email: emailToPromote.toLowerCase() },
            { role: 'admin' },
            { new: true }
        );

        if (user) {
            console.log('\n✨ Platform Ownership Verified!');
            console.log(`User: ${user.email}`);
            console.log(`Status: ${user.role.toUpperCase()}`);
            console.log('You can now log in via the Admin Portal.\n');
        } else {
            console.log(`\n❌ Error: User with email "${emailToPromote}" not found.`);
            console.log('Make sure you have registered first in the normal Sign Up page.\n');
        }
        mongoose.connection.close();
    })
    .catch(err => {
        console.error('Connection error:', err);
        process.exit(1);
    });
