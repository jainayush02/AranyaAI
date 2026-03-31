const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
    conversation_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'conversation',
        required: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'ai'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    image_url: {
        type: String
    },
    image_urls: {
        type: [String],
        default: []
    },
    isPinned: {
        type: Boolean,
        default: false
    },
    reactions: [{
        emoji: String,
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user'
        }
    }],
    sources: [{
        title: String,
        url: String,
        domain: String
    }],
    intelligenceType: {
        type: String,
        enum: ['arion', 'web', 'product', 'chiron', 'chiron_fallback'],
        default: 'arion'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('chatMessage', ChatMessageSchema);
