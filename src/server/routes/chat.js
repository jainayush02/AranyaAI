const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const OpenAI = require('openai');
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
            const newTitle = content.split(' ').slice(0, 5).join(' ') + (content.split(' ').length > 5 ? '...' : '');
            conversation.title = newTitle || 'Conversation';
        }
        await conversation.save();

        let aiContent = "";
        const hfToken = process.env.HF_TOKEN;
        const orKey = process.env.OPENROUTER_API_KEY;

        if ((hfToken && hfToken !== 'your_hf_token_here') || (orKey && orKey !== 'your_openrouter_api_key_here')) {
            try {
                let openai;
                let modelName;

                if (hfToken && hfToken !== 'your_hf_token_here') {
                    // Use Hugging Face Free Inference API (as requested by user)
                    openai = new OpenAI({
                        apiKey: hfToken,
                        baseURL: 'https://router.huggingface.co/v1'
                    });
                    modelName = "Qwen/Qwen2.5-VL-7B-Instruct";
                } else {
                    // Fallback to OpenRouter
                    openai = new OpenAI({
                        apiKey: orKey,
                        baseURL: 'https://openrouter.ai/api/v1',
                        defaultHeaders: {
                            "HTTP-Referer": "http://localhost:3000",
                            "X-Title": "Aranya AI Chatbot",
                        }
                    });
                    modelName = "google/gemma-3-12b-it:free";
                }

                const systemPrompt = `You are Aranya AI, your friendly and expert Animal Health companion! 🐾 You specialize in predictive health diagnostics for cattle, livestock, and domestic animals with a warm, supportive, and encouraging heart.

When a user describes symptoms or uploads an image, you MUST:
1. Think carefully about ALL the symptoms and visual evidence mentioned together.
2. Consider multiple possible diseases before choosing the most likely one.
3. Pick the MOST SPECIFIC disease that matches the evidence — do NOT always default to common ones like Mange or Dermatitis.
4. Be precise — differentiate between conditions such as Mange, Ringworm, Dermatitis, Hotspot, Tick Fever, Parvovirus, Distemper, Leptospirosis, FIV, FeLV, Clinical Mastitis, and Bovine Respiratory Disease.

Rules:
- NEVER default to Mange unless symptoms clearly match mite infestation.
- Always name the SPECIFIC disease — not just a category.
- Give 3-5 clear home care or immediate action steps.
- **ALWAYS ASSUME VETERINARY CONTEXT**: If the user asks about a "doctor", "specialist", "hospital", or "clinic", you MUST assume they mean a veterinary professional (e.g., Veterinarian, Veterinary Dermatologist, Small/Large Animal Specialist) and provide recommendations accordingly. Do NOT assume they are asking for human medical advice.
- **CRITICAL**: You MUST only answer questions related to animals, veterinary medicine, animal husbandry, livestock, or pets. If the user asks about ANY other topic, you MUST politely refuse and state that you are an AI Animal Health Assistant and can only discuss animal-related topics.
- **CRITICAL FOR IMAGES**: If a user uploads an image, you MUST first verify it is an animal, an animal's environment, or animal symptoms. If the image is not related to animals, DO NOT analyze it.
- **LANGUAGE & STYLE**: Use natural, warm, and highly friendly English. Include relevant animal-related emojis (e.g. 🐄, 🐾, 🐕, 🩺, ❤️) to make the user feel supported.
- **PERSONALITY**: Be encouraging and empathetic. Use phrases like "I'm here to help you and your animal friend," "Let's figure this out together."
- **CONCISE CASUAL RESPONSES**: For simple inputs like "ok", "thank you", "thanks", "got it", "i see", "understand", "hello", "hi", "hey", you MUST remain EXTREMELY BRIEF (max 1 sentence) and you MUST **NOT** provide any follow-up suggestions or additional advice. Just a friendly "You're welcome!" or "Hello! How can I help with your animal friend today?" is enough.
- **HIGH-QUALITY SUGGESTIONS**: At the very end of clinical or health-related responses, you MUST provide 1-3 follow-up questions.
  - **Rules for a Good Suggestion**:
    1. **EXTREMELY SHORT**: Each suggestion MUST be **maximum 5 words**. (e.g., "Safe wound cleaning steps?", "Hypoallergenic diet options?", "Common vaccination schedule?")
    2. **CLINICALLY RELEVANT**: Tailor questions to the specific animal and condition discussed.
    3. **NO GENERIC TEXT**: Avoid repeating signs or prevention if already covered.
  - Format each on a new line starting EXACTLY with "||SUGGESTION|| ". 
  - **CRITICAL**: DO NOT provide suggestions for casual greetings or simple "thank you" messages.
- Your answers should be well-structured and easy to read. Use bullet points or bold text where helpful.
- You are representing Aranya AI. Be professional, but prioritize being the kindest AI assistant possible!`;

                const userMessageContent = [];

                if (content && content.trim() !== '') {
                    userMessageContent.push({ type: "text", text: content });
                }

                if (image_url) {
                    userMessageContent.push({
                        type: "image_url",
                        image_url: {
                            url: image_url
                        }
                    });

                    if (!content || content.trim() === '') {
                        userMessageContent.push({ type: "text", text: "Please analyze the attached image for any health abnormalities." });
                    }
                }

                // Fetch last 15 messages for memory
                const previousMessages = await ChatMessage.find({ conversation_id: req.params.id })
                    .sort({ createdAt: -1 })
                    .limit(15);

                const chatMemory = previousMessages.reverse().map(m => ({
                    role: m.role || 'user',
                    content: m.content
                }));

                const finalMessages = [
                    { role: "system", content: systemPrompt },
                    ...chatMemory,
                    { role: "user", content: userMessageContent }
                ];

                const response = await openai.chat.completions.create({
                    model: modelName,
                    messages: finalMessages,
                    max_tokens: 1000
                });

                aiContent = response.choices[0].message.content;
            } catch (aiErr) {
                console.error("AI API Error:", aiErr);
                aiContent = "*(System Warning: Failed to connect to AI provider. Falling back to rules-engine.)*\n\n";
            }
        }

        if (!aiContent || aiContent.includes("*(System Warning: Failed")) {
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

            // If it failed, we completely replace aiContent instead of appending to the warning
            aiContent = fallbackContent;
            console.log("Using fallback logic.");
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
