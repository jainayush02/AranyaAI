const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');
const Plan = require('../models/Plan');
const { OpenAI } = require('openai');
const { logActivity } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10, // Max 10 messages per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Chat moving too fast! Please wait a moment before your next message.' }
});

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
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ msg: 'Chat not found' });

        // Ownership check
        if (conversation.user_id.toString() !== req.user.id) {
            return res.status(404).json({ msg: 'Chat not found' });
        }

        const messages = await ChatMessage.find({ conversation_id: req.params.id }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/chat/daily-count
// @desc    Get current daily chat count
router.get('/daily-count', auth, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const count = await ChatMessage.countDocuments({
            sender: req.user.id,
            role: 'user',
            createdAt: { $gte: today }
        });
        res.json({ count });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/chat/conversations/:id/messages
// @desc    Send a message & get AI response
// @access  Private
router.post('/conversations/:id/messages', [auth, aiLimiter], async (req, res) => {
    const { content, image_url, image_urls } = req.body;
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ msg: 'Chat not found' });

        // Ownership check
        if (conversation.user_id.toString() !== req.user.id) {
            return res.status(404).json({ msg: 'Chat not found' });
        }

        // --- PLAN LIMIT ENFORCEMENT: AI Daily Limit ---
        const user = await User.findById(req.user.id);
        const userPlan = await Plan.findOne({ code: user.plan, active: true });
        const dailyLimit = userPlan ? userPlan.dailyChatMessages : 5;

        if (dailyLimit !== -1) {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const messageCount = await ChatMessage.countDocuments({
                user_id: req.user.id,
                role: 'user',
                createdAt: { $gte: startOfToday }
            });

            if (messageCount >= dailyLimit) {
                return res.status(403).json({
                    msg: `You've reached your daily limit of ${dailyLimit} AI messages on the "${userPlan?.name || 'Free'}" plan. Please upgrade to chat more today.`
                });
            }
        }
        // --- END PLAN LIMIT ENFORCEMENT ---

        // Save User Message
        const userMsg = new ChatMessage({
            conversation_id: req.params.id,
            user_id: req.user.id,
            role: 'user',
            content,
            image_url,
            image_urls: image_urls || (image_url ? [image_url] : [])
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

        // Fetch dynamic AI configuration — exclusively from Admin Portal
        let aiConfig = {
            primary: {
                provider: 'Hugging Face',
                customProvider: '',
                baseURL: 'https://router.huggingface.co/v1',
                apiKey: '',
                models: [],
                enabled: true
            },
            fallback: {
                provider: 'OpenRouter',
                customProvider: '',
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: '',
                models: [],
                enabled: true
            },
            systemPrompt: `You are Arion, a multimodal animal health assistant.

You only help with:
- animal health
- animal care
- breed information
- veterinary guidance
- safe educational information about common veterinary medicines
- general animal questions

Hard restriction:
- If a request is not about animals, animal health, animal care, breeds, veterinary guidance, or safe general veterinary medicine information, refuse it.
- Do not answer any part of unrelated questions.
- Do not provide extra help, explanations, facts, code, or general knowledge for unrelated topics.
- Do not provide partial help for unrelated topics.
- Do not say "however" and then continue answering.
- Reply only with:
"I only help with animal health, care, and veterinary topics."

Default language is English.
- If the user writes in another language, reply in that language when possible.
- If the user mixes languages, reply in the language that best matches the user's message.

Use the last 15 messages in the current session for continuity.
- Use memory only to improve continuity and avoid repeated questions.
- If memory conflicts with the latest user message, trust the latest message.

Do not invent missing facts.
- First extract details already provided by the user, image, or session memory, such as species, breed, age, sex, weight, main problem, and symptom duration.
- Do not ask for details already given.
- If the user already provides the important details in one message, use them directly and do not ask the same questions again.
- If important details are missing, ask short and focused follow-up questions before giving guidance.
- Do not assume missing facts.

Case handling:
- If the user gives multiple symptoms, focus first on the most serious or dangerous sign.
- If the user gives multiple animals or multiple separate cases in one message, do not mix them together.
- Separate them clearly and handle one case at a time.
- If needed, ask which case should be handled first.

Image behavior:
- Use images as supporting information, not as final proof of a condition.
- First decide whether the image is clear enough for a basic visual assessment.
- If the affected area is reasonably visible, provide a helpful response based on visible findings.
- If the image is clear enough for a basic assessment, do not ask for more images before helping.
- If the image is partly clear, give a cautious answer and briefly mention what is visible and what is unclear.
- Ask for 2 to 3 clearer images only when the image is too blurry, too dark, too far away, too cropped, or the affected area is not visible enough.
- Never say the image is unclear if the affected area is reasonably visible.
- Never claim you can see details that are not clearly visible.
- If needed, ask for one full-body image, one close-up of the affected area, and one image in better light.
- If the image is clearly unusable, say:
"I cannot see the problem clearly in this image. Please upload 2 to 3 clearer images."

Anti-hallucination rules:
- Do not make up symptoms, image findings, history, diagnoses, or medicines.
- Do not present guesses as facts.
- If you are not sure, clearly say so.
- Use careful wording such as:
  - "This may be related to..."
  - "One possible reason is..."
  - "This needs a veterinarian to confirm."
- Treat predicted disease labels as clues, not confirmed diagnoses.

Response length control:
- Keep the answer length proportional to the user's question.
- For short or vague questions, give a short and focused reply.
- For simple questions, keep the response brief.
- For detailed or serious health questions, give a fuller answer only when needed.
- Do not give long explanations unless the user asks for more detail.
- Ask follow-up questions instead of giving a long generic answer when important details are missing.

Emoji style:
- Use a few relevant emojis when helpful.
- Keep emojis minimal and professional.
- Do not use too many emojis in one response.
- Avoid emojis in serious emergency messages unless they improve clarity.

For health questions:
- If the user gives limited information, first ask 1 to 3 short follow-up questions.
- Use the full structured format only when the case is detailed, serious, or the user asks for a full explanation.

When using the full format, use these headings:
- Assessment
- What it might be
- How serious it seems
- Which animal doctor can help
- Medicine or care notes
- What you should do now

Do not include a disclaimer in every response if the interface already shows a permanent veterinary safety notice below the chatbox.
- Only include a brief warning when the case is urgent, emergency-level, high-risk, or when medication safety needs special caution.

Use simple urgency levels:
- Mild
- Needs a vet visit
- Urgent
- Emergency

Medicine safety:
- Only provide general educational information about common veterinary medicines.
- Do not provide exact prescriptions, exact doses, frequency, duration, or drug combinations unless the user only wants help understanding a veterinarian's written prescription.
- Do not suggest risky self-medication.
- If medicine safety is uncertain, advise veterinary consultation.

If the question is outside animal-related topics, reply only with:
"I only help with animal health, care, and veterinary topics."`
        };

        try {
            const dbConfig = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
            if (dbConfig && dbConfig.value) {
                // Ensure spreading works properly
                aiConfig = { ...aiConfig, ...dbConfig.value };
                // Also overwrite systemPrompt explicitly in case it was somehow stored as a prototype string
                if (dbConfig.value.systemPrompt) {
                    aiConfig.systemPrompt = dbConfig.value.systemPrompt;
                }
            } else {
                // Backward compatibility during migration
                const oldConfig = await SystemSettings.findOne({ key: 'ai_config' });
                if (oldConfig && oldConfig.value) {
                    aiConfig.primary.apiKey = oldConfig.value.hfToken || aiConfig.primary.apiKey;
                    aiConfig.primary.models[0].modelId = oldConfig.value.primaryModel || aiConfig.primary.models[0].modelId;
                    aiConfig.primary.models[1].modelId = oldConfig.value.visionModel || aiConfig.primary.models[1].modelId;
                    aiConfig.primary.enabled = oldConfig.value.useHF;

                    aiConfig.fallback.apiKey = oldConfig.value.openRouterKey || aiConfig.fallback.apiKey;
                    aiConfig.fallback.models[0].modelId = oldConfig.value.fallbackModel || aiConfig.fallback.models[0].modelId;
                    aiConfig.fallback.enabled = oldConfig.value.useOpenRouter;
                }
            }
        } catch (confErr) {
            console.error("Error fetching AI config from DB, using defaults:", confErr.message);
        }
        const { stream = true } = req.body;
        try {
            // The conversation and userMsg creation are already done above.
            // Using the already destructured variables from req.body

            let aiContent = "";
            const hasImage = !!(image_url || (image_urls && image_urls.length > 0));

            const systemPrompt = aiConfig.systemPrompt;

            if (image_url) {
                console.log(`Processing message with image (length: ${image_url.length}) for conversation ${req.params.id}`);
            }

            // The previous userMessageContent logic is now fully integrated into finalMessages below.

            // 1. Fetch history excluding the current message to avoid repetition loops
            const previousMessages = await ChatMessage.find({
                conversation_id: req.params.id,
                user_id: req.user.id,
                _id: { $ne: userMsg._id } // Critical fix for memory loop
            }).sort({ createdAt: -1 }).limit(10); // Optimal last 10 messages

            // 2. Build the TOON compact context (\n instead of JSON saves ~30% tokens)
            const toonHistory = previousMessages.reverse().map(m => {
                const prefix = m.role === 'ai' ? 'a: ' : 'u: ';
                return `${prefix}${m.content || "[Photo Sent]"}`;
            }).join('\n');

            // 3. Construct the message list with clear HISTORY gating
            const historyBlock = toonHistory ? `[HISTORY]\n${toonHistory}\n[HISTORY_END]\n\n` : "";
            
            const finalMessages = [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: `${historyBlock}[TASK]: ${content || "Respond to user"}` },
                        ...(image_url || (image_urls && image_urls.length > 0) ? 
                            (image_urls || [image_url]).map(url => ({ type: "image_url", image_url: { url } })) 
                            : [])
                    ]
                }
            ];


            const contextHasImage = hasImage || previousMessages.some(m =>
                (m.image_url && m.image_url.length > 0) || (m.image_urls && m.image_urls.length > 0)
            );

            let completionStream;
            let useFallback = false;

            // --- Attempt Primary Engine ---
            if (aiConfig.primary.enabled && aiConfig.primary.apiKey && aiConfig.primary.apiKey !== 'your_hf_token_here') {
                try {
                    const primaryTextModel = aiConfig.primary.models.find(m => m.type === 'text' || m.type === 'text+vision');
                    const primaryVisionModel = aiConfig.primary.models.find(m => m.type === 'vision' || m.type === 'text+vision');
                    const primaryModelObj = contextHasImage ? (primaryVisionModel || primaryTextModel) : primaryTextModel;

                    if (!primaryModelObj) throw new Error("No primary model configured.");

                    const primaryOpenai = new OpenAI({
                        apiKey: primaryModelObj.apiKey || aiConfig.primary.apiKey,
                        baseURL: primaryModelObj.baseURL || aiConfig.primary.baseURL
                    });

                    completionStream = await primaryOpenai.chat.completions.create({
                        model: primaryModelObj.modelId,
                        messages: finalMessages,
                        max_tokens: 1500,
                        stream: stream
                    });
                } catch (pErr) {
                    console.error("Primary GenAI Engine Error:", pErr.message);
                    useFallback = true;
                }
            } else {
                useFallback = true;
            }

            // --- Attempt Fallback Engine ---
            if (useFallback && aiConfig.fallback.enabled && aiConfig.fallback.apiKey && aiConfig.fallback.apiKey !== 'your_openrouter_api_key_here') {
                try {
                    const fallbackTextModel = aiConfig.fallback.models.find(m => m.type === 'text' || m.type === 'text+vision');
                    const fallbackVisionModel = aiConfig.fallback.models.find(m => m.type === 'vision' || m.type === 'text+vision');
                    const fallbackModelObj = contextHasImage ? (fallbackVisionModel || fallbackTextModel) : fallbackTextModel;

                    if (!fallbackModelObj) throw new Error("No fallback model configured.");

                    const fallbackOpenai = new OpenAI({
                        apiKey: fallbackModelObj.apiKey || aiConfig.fallback.apiKey,
                        baseURL: fallbackModelObj.baseURL || aiConfig.fallback.baseURL,
                        defaultHeaders: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Aranya AI Chatbot" }
                    });

                    completionStream = await fallbackOpenai.chat.completions.create({
                        model: fallbackModelObj.modelId,
                        messages: finalMessages,
                        max_tokens: 1500,
                        stream: stream
                    });
                } catch (fErr) {
                    console.error("Fallback GenAI Engine Error:", fErr.message);
                }
            }

            if (!completionStream) throw new Error("AI Engines unavailable.");

            if (stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                let fullText = "";
                for await (const chunk of completionStream) {
                    const delta = chunk.choices[0]?.delta?.content || "";
                    if (delta) {
                        fullText += delta;
                        res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
                        if (res.flush) res.flush();
                    }
                }

                const finalAiMsg = new ChatMessage({
                    conversation_id: req.params.id,
                    user_id: req.user.id,
                    role: 'ai',
                    content: fullText
                });
                await finalAiMsg.save();
                res.write(`data: ${JSON.stringify({ done: true, messageId: finalAiMsg._id })}\n\n`);
                return res.end();
            } else {
                aiContent = completionStream.choices[0].message.content;
            }
        } catch (aiErr) {
            console.error("AI API Error:", aiErr.message);
            aiContent = "Arion is temporarily over capacity. Please provide more specifics or try again later.";
        }
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

// @route   PUT /api/chat/messages/:msgId/pin
// @desc    Toggle pin on a message
// @access  Private
router.put('/messages/:msgId/pin', auth, async (req, res) => {
    try {
        const msg = await ChatMessage.findById(req.params.msgId);
        if (!msg) return res.status(404).json({ msg: 'Message not found' });

        // Ownership check: Must own the conversation containing the message
        const conversation = await Conversation.findById(msg.conversation_id);
        if (!conversation || conversation.user_id.toString() !== req.user.id) {
            return res.status(404).json({ msg: 'Message not found' });
        }

        msg.isPinned = !msg.isPinned;
        await msg.save();
        res.json(msg);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/chat/messages/:msgId/react
// @desc    Toggle emoji reaction on a message
// @access  Private
router.put('/messages/:msgId/react', auth, async (req, res) => {
    try {
        const { emoji } = req.body;
        if (!emoji) return res.status(400).json({ msg: 'Emoji is required' });

        const msg = await ChatMessage.findById(req.params.msgId);
        if (!msg) return res.status(404).json({ msg: 'Message not found' });

        // Ownership check: Must own the conversation to react
        const conversation = await Conversation.findById(msg.conversation_id);
        if (!conversation || conversation.user_id.toString() !== req.user.id) {
            return res.status(404).json({ msg: 'Message not found' });
        }

        const existingIdx = msg.reactions.findIndex(
            r => r.emoji === emoji && r.user_id.toString() === req.user.id
        );

        if (existingIdx !== -1) {
            msg.reactions.splice(existingIdx, 1); // Remove reaction
        } else {
            msg.reactions.push({ emoji, user_id: req.user.id });
        }

        await msg.save();
        res.json(msg);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/chat/search
// @desc    Search messages across all user conversations
// @access  Private
router.get('/search', auth, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json([]);

        // Escaping regex special characters to prevent ReDoS (Regular Expression Denial of Service)
        const escapedQ = q.trim().substring(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const conversations = await Conversation.find({ user_id: req.user.id }).select('_id');
        const convIds = conversations.map(c => c._id);

        const messages = await ChatMessage.find({
            conversation_id: { $in: convIds },
            content: { $regex: escapedQ, $options: 'i' }
        })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();

        // Attach conversation title to each result
        const convMap = {};
        const convData = await Conversation.find({ _id: { $in: convIds } }).select('title').lean();
        convData.forEach(c => { convMap[c._id.toString()] = c.title; });

        const results = messages.map(m => ({
            ...m,
            conversationTitle: convMap[m.conversation_id.toString()] || 'Chat'
        }));

        res.json(results);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
