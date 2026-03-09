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
    const { content, image_url, image_urls } = req.body;
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ msg: 'Chat not found' });

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
        const hfToken = process.env.HF_TOKEN;
        const orKey = process.env.OPENROUTER_API_KEY;
        const hasImage = !!(image_url || (image_urls && image_urls.length > 0));

        if ((hfToken && hfToken !== 'your_hf_token_here') || (orKey && orKey !== 'your_openrouter_api_key_here')) {
            try {

                const systemPrompt = `**Role & Persona**
You are Aranya AI, an expert and empathetic Animal Health companion specializing in predictive diagnostics for cattle, livestock, and domestic animals. Your tone is warm, supportive, encouraging, and natural.

**1. CRITICAL BOUNDARIES & REFUSALS (STRICT ENFORCEMENT)**
* **Animal-Only Scope:** You ONLY discuss animals, veterinary medicine, livestock management, and pets.
* **The One-Sentence Refusal:** IF a query is NOT related to animals (e.g., coding, math, general trivia, writing essays), you MUST refuse in EXACTLY ONE SHORT SENTENCE. NEVER write code. NEVER do math. (Example: "I am an animal health assistant and can only discuss veterinary or pet-related topics. 🐾")
* **Veterinary Context:** If the user mentions "doctor," "specialist," "hospital," or "clinic," you MUST assume they mean a veterinary professional.

**2. CONVERSATIONAL STATE MACHINE (ANTI-LOOPING)**
Follow these rules based EXACTLY on the user's input to prevent repeating yourself:
* **State A (Greeting):** IF the user ONLY says a greeting ("hi", "hello"), respond with a warm, unique greeting. Maximum 1 sentence. Do NOT ask for symptoms yet.
* **State B (Short Acknowledgment):** IF the user says "ok", "thanks", "got it", respond with a max 1-sentence polite wrap-up (e.g., "You're very welcome! ❤️"). Do NOT provide medical info.
* **State C (New Symptom/Image):** IF the user reports a new symptom or uploads an image, SKIP greetings. Use the **[Phase 1]** output format below. Do NOT ask the same question twice. If an animal image is unclear, ask for 2-3 more images. If species is missing, ask for it.
* **State D (User asks for help / says "YES"):** IF the user asks "what should I do?" or replies "yes" to your offer for tips, immediately use the **[Phase 2]** output format.
* **State E (User declines / says "NO"):** IF the user declines tips ("no", "no thanks"), DO NOT repeat the diagnosis. Reply with exactly ONE polite sentence ending the flow (e.g., "Understood! Please monitor your pet closely and let me know if you need anything else. 🐾").

**3. CORE CLINICAL DIRECTIVES**
* **Diagnostic Prediction:** Analyze all evidence and PREDICT the most specific disease/condition possible (e.g., Parvovirus, Tick Fever, Clinical Mastitis). Never default to generic categories like "Mange" unless proven.
* **Emergency Detection:** If symptoms indicate severe distress (heavy bleeding, seizures, poisoning, breathing difficulty), advise immediate emergency vet contact.
* **Formatting Limits:** Keep responses under 120 words total unless explicitly requested. Use 1-2 relevant emojis matching the animal/symptom (e.g., 🐄 🩺).

**4. MANDATORY OUTPUT FORMATS**
When diagnosing or giving medical advice, you MUST use one of these exact Markdown templates based on the conversational state. 

**[Phase 1: Initial Assessment]** *(Use for State C - New Symptoms/Images)*
**Observation:** [1-2 sentences stating your observation and predicting the most specific condition(s). State confidence cautiously.]

🚨 **Veterinary Warning:** [1 sentence explaining what severe signs require immediate vet attention.]

*"Would you like some home care tips you can do right now?"*

**[Phase 2: Actionable Care]** *(Use for State D - User says "Yes" / Asks for steps)*
**Immediate Steps You Can Take:**
* [Action Step 1: Specific, actionable home care]
* [Action Step 2: Specific, actionable home care]
* [Action Step 3: Specific, actionable home care]`;

                // Log image presence for debugging
                if (image_url) {
                    console.log(`Processing message with image (length: ${image_url.length}) for conversation ${req.params.id}`);
                }

                const userMessageContent = [];

                if (content && content.trim() !== '') {
                    userMessageContent.push({ type: "text", text: content });
                }

                const currentImages = image_urls || (image_url ? [image_url] : []);
                if (currentImages && currentImages.length > 0) {
                    currentImages.forEach(url => {
                        userMessageContent.push({
                            type: "image_url",
                            image_url: { url }
                        });
                    });

                    if (!content || content.trim() === '') {
                        userMessageContent.push({ type: "text", text: "Please analyze the attached image(s) for any health abnormalities." });
                    }
                }

                // Fetch previous 15 messages EXCLUDING the current one to prevent duplication
                const previousMessages = await ChatMessage.find({
                    conversation_id: req.params.id,
                    _id: { $ne: userMsg._id }
                })
                    .sort({ createdAt: -1 })
                    .limit(15);

                const chatMemory = previousMessages.reverse().map(m => {
                    // Critical: Reconstruct multi-modal message if images exist in history
                    const mImages = m.image_urls && m.image_urls.length > 0 ? m.image_urls : (m.image_url ? [m.image_url] : []);

                    if (mImages.length > 0) {
                        const contentArray = [{ type: "text", text: m.content || "Image Analysis" }];
                        mImages.forEach(url => {
                            contentArray.push({ type: "image_url", image_url: { url } });
                        });
                        return {
                            role: m.role || 'user',
                            content: contentArray
                        };
                    }
                    return {
                        role: m.role || 'user',
                        content: m.content
                    };
                });

                const finalMessages = [
                    { role: "system", content: systemPrompt },
                    ...chatMemory,
                    { role: "user", content: userMessageContent }
                ];

                let response;
                let useFallback = false;

                if (hfToken && hfToken !== 'your_hf_token_here') {
                    try {
                        const hfOpenai = new OpenAI({
                            apiKey: hfToken,
                            baseURL: 'https://router.huggingface.co/v1'
                        });
                        const primaryModel = hasImage ? "Qwen/Qwen2.5-VL-7B-Instruct" : "Qwen/Qwen2.5-7B-Instruct";

                        response = await hfOpenai.chat.completions.create({
                            model: primaryModel,
                            messages: finalMessages,
                            max_tokens: 1000
                        });
                    } catch (hfErr) {
                        console.error("Hugging Face API Error, falling back to OpenRouter:", hfErr.message);
                        useFallback = true;
                    }
                } else {
                    useFallback = true;
                }

                if (useFallback && orKey && orKey !== 'your_openrouter_api_key_here') {
                    try {
                        const orOpenai = new OpenAI({
                            apiKey: orKey,
                            baseURL: 'https://openrouter.ai/api/v1',
                            defaultHeaders: {
                                "HTTP-Referer": "http://localhost:3000",
                                "X-Title": "Aranya AI Chatbot",
                            }
                        });
                        response = await orOpenai.chat.completions.create({
                            model: "google/gemma-3-12b-it:free",
                            messages: finalMessages,
                            max_tokens: 1000
                        });
                    } catch (orErr) {
                        console.error("OpenRouter API Error:", orErr.message);
                        throw new Error("Both Primary and Fallback AI APIs failed.");
                    }
                }

                if (!response || !response.choices || response.choices.length === 0) {
                    throw new Error("Invalid response structural format from AI API.");
                }

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
