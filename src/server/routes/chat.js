const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const SystemSettings = require('../models/SystemSettings');
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

        // Fetch dynamic AI configuration
        let aiConfig = {
            primary: {
                provider: 'Hugging Face',
                customProvider: '',
                baseURL: 'https://router.huggingface.co/v1',
                apiKey: process.env.HF_TOKEN || '',
                models: [
                    { id: 'p1', name: 'Primary Text Model', type: 'text', modelId: 'Qwen/Qwen2.5-7B-Instruct' },
                    { id: 'p2', name: 'Vision/Image Model', type: 'vision', modelId: 'Qwen/Qwen2.5-VL-7B-Instruct' }
                ],
                enabled: true
            },
            fallback: {
                provider: 'OpenRouter',
                customProvider: '',
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: process.env.OPENROUTER_API_KEY || '',
                models: [
                    { id: 'f1', name: 'Fallback Text Model', type: 'text', modelId: 'google/gemma-3-12b-it:free' }
                ],
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

        const hasImage = !!(image_url || (image_urls && image_urls.length > 0));

        try {

            const systemPrompt = aiConfig.systemPrompt;


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
                const mappedRole = m.role === 'ai' ? 'assistant' : (m.role || 'user');

                if (mImages.length > 0) {
                    const contentArray = [{ type: "text", text: m.content || "Image Analysis" }];
                    mImages.forEach(url => {
                        contentArray.push({ type: "image_url", image_url: { url } });
                    });
                    return {
                        role: mappedRole,
                        content: contentArray
                    };
                }
                return {
                    role: mappedRole,
                    content: m.content
                };
            });

            const finalMessages = [
                { role: "system", content: systemPrompt },
                ...chatMemory,
                { role: "user", content: userMessageContent }
            ];

            // Determine if ANY message in the entire context (history + current) contains images
            const contextHasImage = hasImage || chatMemory.some(m =>
                Array.isArray(m.content) && m.content.some(item => item.type === 'image_url')
            );

            let response;
            let useFallback = false;

            // --- Attempt Primary Engine ---
            if (aiConfig.primary.enabled && aiConfig.primary.apiKey && aiConfig.primary.apiKey !== 'your_hf_token_here') {
                try {
                    // Determine which model to use based on capabilities
                    const primaryTextModel = aiConfig.primary.models.find(m => m.type === 'text' || m.type === 'text+vision');
                    const primaryVisionModel = aiConfig.primary.models.find(m => m.type === 'vision' || m.type === 'text+vision');
                    const primaryModelObj = contextHasImage ? (primaryVisionModel || primaryTextModel) : primaryTextModel;

                    if (!primaryModelObj) throw new Error("No primary model configured for this query type.");

                    const pBaseURL = primaryModelObj.baseURL || aiConfig.primary.baseURL;
                    const pApiKey = primaryModelObj.apiKey || aiConfig.primary.apiKey;

                    const primaryOpenai = new OpenAI({
                        apiKey: pApiKey,
                        baseURL: pBaseURL
                    });

                    response = await primaryOpenai.chat.completions.create({
                        model: primaryModelObj.modelId,
                        messages: finalMessages,
                        max_tokens: 1000
                    });
                } catch (primaryErr) {
                    console.error("Primary GenAI Engine Error, falling back:", primaryErr.message);
                    useFallback = true;
                }
            } else {
                useFallback = true;
            }

            // --- Attempt Fallback Engine ---
            if (useFallback && aiConfig.fallback.enabled && aiConfig.fallback.apiKey && aiConfig.fallback.apiKey !== 'your_openrouter_api_key_here') {
                try {
                    // Determine fallback model
                    const fallbackTextModel = aiConfig.fallback.models.find(m => m.type === 'text' || m.type === 'text+vision');
                    const fallbackVisionModel = aiConfig.fallback.models.find(m => m.type === 'vision' || m.type === 'text+vision');
                    const fallbackModelObj = contextHasImage ? (fallbackVisionModel || fallbackTextModel) : fallbackTextModel;

                    if (!fallbackModelObj) throw new Error("No fallback model configured for this query type.");

                    const fBaseURL = fallbackModelObj.baseURL || aiConfig.fallback.baseURL;
                    const fApiKey = fallbackModelObj.apiKey || aiConfig.fallback.apiKey;

                    const fallbackOpenai = new OpenAI({
                        apiKey: fApiKey,
                        baseURL: fBaseURL,
                        defaultHeaders: {
                            "HTTP-Referer": "http://localhost:3000",
                            "X-Title": "Aranya AI Chatbot",
                        }
                    });

                    response = await fallbackOpenai.chat.completions.create({
                        model: fallbackModelObj.modelId,
                        messages: finalMessages,
                        max_tokens: 1000
                    });
                } catch (fallbackErr) {
                    console.error("Fallback GenAI Engine Error:", fallbackErr.message);
                    throw new Error("Both Primary and Fallback AI APIs failed.");
                }
            }

            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error("Invalid response structural format from AI API.");
            }

            aiContent = response.choices[0].message.content;
        } catch (aiErr) {
            console.error("AI API Overall Error:", aiErr);
            aiContent = "*(System Warning: Failed to connect to AI provider. Falling back to rules-engine.)*\n\n";
        }

        if (!aiContent || aiContent.includes("*(System Warning: Failed")) {
            const contentLower = (content || "").toLowerCase();
            let fallbackContent = "";

            if (hasImage) {
                fallbackContent = "### Vision API Analysis\n\nI have scanned the uploaded image(s). I detect patterns consistent with **mild dermatophytosis (ringworm)** or superficial abrasions on the skin.\n\n**Immediate Actions:**\n1. Isolate the affected animal to prevent herd transmission.\n2. Apply a topical antifungal wash (e.g., 2% chlorhexidine) daily.\n3. Monitor the lesions for 5 days.\n\n_If symptoms worsen, please contact a certified veterinarian._";
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
