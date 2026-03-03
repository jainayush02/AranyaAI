const mongoose = require('mongoose');
const FaqSchema = new mongoose.Schema({
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: { type: String, default: 'General' },
    order: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model('Faq', FaqSchema);
