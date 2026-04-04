const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ChatController = require('../controllers/chat.controller');
const rateLimit = require('express-rate-limit');

const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Chat moving too fast! Please wait a moment before your next message.' }
});

// @route   GET /api/chat/conversations
router.get('/conversations', auth, ChatController.getConversations);

// @route   POST /api/chat/conversations
router.post('/conversations', auth, ChatController.createConversation);

// @route   PUT /api/chat/conversations/:id
router.put('/conversations/:id', auth, ChatController.renameConversation);

// @route   DELETE /api/chat/conversations/:id
router.delete('/conversations/:id', auth, ChatController.deleteConversation);

// @route   GET /api/chat/conversations/:id/messages
router.get('/conversations/:id/messages', auth, ChatController.getMessages);

// @route   GET /api/chat/daily-count
router.get('/daily-count', auth, ChatController.getDailyCount);

// @route   POST /api/chat/conversations/:id/messages
router.post('/conversations/:id/messages', [auth, aiLimiter], ChatController.sendMessage);

// @route   PUT /api/chat/messages/:msgId/pin
router.put('/messages/:msgId/pin', auth, ChatController.pinMessage);

// @route   PUT /api/chat/messages/:msgId/react
router.put('/messages/:msgId/react', auth, ChatController.reactMessage);

// @route   GET /api/chat/search
router.get('/search', auth, ChatController.searchMessages);

module.exports = router;
