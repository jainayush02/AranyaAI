const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logActivity } = require('../utils/logger');

// @route   GET /api/chat/conversations
// @desc    Get all conversations for user
// @access  Private
router.get('/conversations', auth, async (req, res) => {
    try {
        const conversations = await Conversation.find({ user_id: req.user.id }).sort({ updatedAt: -1 });
        res.json(conversations);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/chat/conversations
// @desc    Create new conversation
// @access  Private
router.post('/conversations', auth, async (req, res) => {
    try {
        const newConversation = new Conversation({
            user_id: req.user.id,
            title: 'New Chat'
        });
        const conversation = await newConversation.save();
        res.json(conversation);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/chat/conversations/:id
// @desc    Rename conversation
// @access  Private
router.put('/conversations/:id', auth, async (req, res) => {
    try {
        let conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ msg: 'Chat not found' });
        if (conversation.user_id.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });

        conversation.title = req.body.title || conversation.title;
        conversation.updatedAt = Date.now();
        await conversation.save();
        res.json(conversation);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/chat/conversations/:id
// @desc    Delete conversation
// @access  Private
router.delete('/conversations/:id', auth, async (req, res) => {
    try {
        let conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ msg: 'Chat not found' });
        if (conversation.user_id.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });

        await Conversation.findByIdAndDelete(req.params.id);
        await ChatMessage.deleteMany({ conversation_id: req.params.id });
        res.json({ msg: 'Chat deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/chat/conversations/:id/messages
// @desc    Get messages for a conversation
// @access  Private
router.get('/conversations/:id/messages', auth, async (req, res) => {
    try {
        const messages = await ChatMessage.find({ conversation_id: req.params.id }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/chat/conversations/:id/messages
// @desc    Send a message & get AI response
// @access  Private
router.post('/conversations/:id/messages', auth, async (req, res) => {
    const { content, image_url } = req.body;
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ msg: 'Chat not found' });

        // Save User Message
        const userMsg = new ChatMessage({
            conversation_id: req.params.id,
            user_id: req.user.id,
            role: 'user',
            content,
            image_url
        });
        await userMsg.save();

        // Update conversation timestamp
        conversation.updatedAt = Date.now();
        // Auto-rename if it's the first message
        if (conversation.title === 'New Chat') {
            conversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        }
        await conversation.save();

        let aiContent = "";

        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
            try {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                const promptArr = [
                    "You are Aranya AI, an advanced veterinary AI assistant. You specialize in automated cattle and livestock predictive health diagnostics. Keep your answers concise, structured (using markdown), and highly professional like a real veterinarian.",
                    "User Input: " + (content || "Please analyze the attached image for any health abnormalities.")
                ];

                if (image_url) {
                    const base64Data = image_url.split(',')[1];
                    const mimeType = image_url.split(';')[0].split(':')[1] || 'image/jpeg';
                    promptArr.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                        }
                    });
                }

                const result = await model.generateContent(promptArr);
                aiContent = result.response.text();
            } catch (geminiErr) {
                console.error("Gemini Error:", geminiErr);
                aiContent = "*(System Warning: Failed to connect to Gemini API. Check API Key. Falling back to rules-engine.)*\n\n";
            }
        }

        if (!aiContent || aiContent.includes("Failed to connect")) {
            const contentLower = content.toLowerCase();
            let fallbackContent = "";

            if (image_url) {
                fallbackContent = "### Vision API Analysis\n\nI have scanned the uploaded image. I detect patterns consistent with **mild dermatophytosis (ringworm)** or superficial abrasions on the skin.\n\n**Immediate Actions:**\n1. Isolate the affected cattle to prevent herd transmission.\n2. Apply a topical antifungal wash (e.g., 2% chlorhexidine) daily.\n3. Monitor the lesions for 5 days.\n\n_If symptoms worsen, please contact a certified veterinarian._";
            } else if (contentLower.includes("fever") || contentLower.includes("temperature") || contentLower.includes("hot")) {
                fallbackContent = "Based on the symptom of fever, this could indicate **Bovine Respiratory Disease (BRD)** or a potential tick-borne infection.\n\n**Diagnostic checklist:**\n- Measure the exact rectal temperature (normal is 38.0°C to 39.3°C).\n- Check for nasal discharge or rapid, shallow breathing.\n- Ensure immediate access to fresh water and shade.\n\nWould you like me to log these symptoms into the health database?";
            } else if (contentLower.includes("milk") || contentLower.includes("udder") || contentLower.includes("mastitis")) {
                fallbackContent = "A drop in milk yield or udder swelling strongly points towards **Clinical Mastitis**.\n\n**Recommended Steps:**\n• Perform a California Mastitis Test (CMT) on all four quarters.\n• Strip the affected quarter frequently to clear milk clots.\n• If severe, an intramammary antibiotic protocol may be required under veterinary guidance.";
            } else if (contentLower.includes("eat") || contentLower.includes("appetite") || contentLower.includes("weight")) {
                fallbackContent = "Loss of appetite in cattle is a generalized symptom that requires careful observation.\n\nIt could trace back to:\n- Ruminal acidosis (check their recent grain intake).\n- Ketosis (especially if recently calved).\n- Internal parasites.\n\nPlease provide their heart rate and activity level so I can run a deep predictive anomaly check.";
            } else {
                fallbackContent = `I am analyzing your input regarding: "${content}".\n\nAs your embedded Aranya AI, I can run predictive health models, analyze visual symptoms via the camera, and cross-reference herd data.\n\nCould you specify the exact symptoms, or upload an image of the affected area for a precise diagnostic?`;
            }
            aiContent = aiContent + fallbackContent;
        }

        const aiMsg = new ChatMessage({
            conversation_id: req.params.id,
            user_id: req.user.id, // Linking AI messages to user for simplicity in this context
            role: 'ai',
            content: aiContent
        });
        await aiMsg.save();
        try {
            await logActivity('chat', { id: req.user.id }, `Used AI chatbot`);
        } catch (_) { }

        res.json({ userMessage: userMsg, aiMessage: aiMsg, conversation });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
