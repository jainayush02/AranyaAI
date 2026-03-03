require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Faq = require('../models/Faq');

const DATA = [
    { question: 'How do I add a new animal?', answer: 'Go to Dashboard and click the green "+ Add New Animal" button. Fill in Name and Breed, then click Add.', category: 'Getting Started', order: 1 },
    { question: 'What is the normal temperature for cattle?', answer: 'Normal cattle temp is 38.0°C to 39.0°C. Outside this range triggers health alerts in Aranya AI.', category: 'Health Monitoring', order: 2 },
    { question: 'How often should I log health data?', answer: 'Log vitals at least once daily. Consistent logging improves AI prediction accuracy significantly.', category: 'Health Monitoring', order: 3 },
    { question: 'What do the health status colors mean?', answer: 'Green = Healthy, Yellow = Needs Attention, Red = Critical (contact vet immediately). Auto-updated after each health log.', category: 'Health Monitoring', order: 4 },
    { question: 'Can I export my cattle data?', answer: 'Yes, CSV/PDF export is available for Pro and Enterprise users from the Analytics section.', category: 'Data & Reports', order: 5 },
    { question: 'How does the AI prediction work?', answer: 'Aranya AI uses an LSTM neural network trained on livestock health data to detect patterns and predict health risks early — before symptoms appear.', category: 'AI Features', order: 6 },
    { question: 'How do I use the AI chatbot?', answer: 'Click the green chat icon in the bottom-right corner of any page. Ask anything about animal health, management, or platform features. Supports image uploads.', category: 'AI Features', order: 7 },
    { question: 'How do I upgrade my plan?', answer: 'Click your profile avatar (top-right corner), select Billing, compare plans and upgrade instantly.', category: 'Billing', order: 8 },
];

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        await Faq.deleteMany({});
        await Faq.insertMany(DATA);
        console.log('OK: ' + DATA.length + ' FAQs seeded');
        process.exit(0);
    })
    .catch(e => { console.error(e.message); process.exit(1); });
