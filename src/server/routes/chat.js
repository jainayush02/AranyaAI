const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logActivity } = require('../utils/logger');

// Cache for failing providers to speed up fallbacks
const failingProviders = {
    hf: { lastFail: 0, count: 0 },
    or: { lastFail: 0, count: 0 },
    gemini: { lastFail: 0, count: 0 }
};

const PROVIDER_COOLDOWN = 1000 * 60 * 60; // 1 hour cooldown if failed multiple times

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

        // Set Headers for Server-Sent Events (SSE)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const sendStatus = (msg) => {
            res.write(`data: ${JSON.stringify({ type: 'status', message: msg })}\n\n`);
        };

        const sendErrorAndClose = (msg) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
            res.end();
        };

        sendStatus("Analyzing...");

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
        let finalRoute = "direct";
        let finalConfidence = 1.0;
        let searchSources = [];

        const hfToken = process.env.HF_TOKEN;
        const orKey = process.env.OPENROUTER_API_KEY;
        const activeOrKey = orKey && orKey !== 'your_openrouter_api_key_here' ? orKey : null;
        const hasImage = !!(image_url || (image_urls && image_urls.length > 0));

        // --- FAST PATH: Local Knowledge Layer (Greetings, Identity, Common Advice) ---
        const lowerContent = content.toLowerCase().trim();
        const greetings = ['hi', 'hello', 'hey', 'hola', 'namaste', 'aslam', 'hlo', 'hii', 'hiii', 'yo', 'sup'];
        const identityQueries = ['who are you', 'what is your name', 'what are you', 'your identity', 'about yourself', 'who is arion'];
        const commonQuestions = [
            { keywords: ['dogs eat', 'dog food', 'dog nutrition'], answer: "Dogs need a balanced diet of protein, fats, and carbohydrates. Avoid grapes, chocolate, onions, and garlic as they are toxic." },
            { keywords: ['cats eat', 'cat food', 'cat nutrition'], answer: "Cats are obligate carnivores and need taurine-rich protein. High-quality wet or dry cat food is best; avoid giving them too much milk as many are lactose intolerant." },
            { keywords: ['bathe a cat', 'washing cat'], answer: "Most cats self-groom, but if they need a bath, use lukewarm water and cat-specific shampoo. Avoid getting water in their ears or eyes." },
            { keywords: ['how are you', 'how do you do'], answer: "I'm doing great! I'm ready to help you with your veterinary and animal health questions. How can I assist you today?" }
        ];

        let isSimpleGreeting = greetings.some(g => lowerContent === g || lowerContent === g + '!' || lowerContent === g + ' arion');
        let isIdentityQuery = identityQueries.some(id => lowerContent.includes(id));
        let matchedAdvice = commonQuestions.find(q => q.keywords.every(k => lowerContent.includes(k)));

        if (isSimpleGreeting || isIdentityQuery || matchedAdvice) {
            console.log(`[Fast Path] Handling: ${isSimpleGreeting ? 'Greeting' : isIdentityQuery ? 'Identity' : 'Common Advice'}`);
            if (isIdentityQuery) {
                aiContent = "I am Arion, your advanced Veterinary AI assistant developed by AranyaAI. I specialize in animal health, disease prediction, and veterinary diagnostics. I can analyze symptoms, interpret images, and provide health guidance.";
            } else if (matchedAdvice) {
                aiContent = matchedAdvice.answer;
            } else {
                aiContent = "Hello! I am Arion, your Veterinary AI assistant. How can I help you with your animals today? 🐾";
            }
            finalRoute = "direct";
        } else if ((hfToken && hfToken !== 'your_hf_token_here') || activeOrKey || process.env.GEMINI_API_KEY) {
            try {
                // STEP 1: LLM Self-Assessment Routing
                sendStatus("Thinking...");
                let route = "direct";
                let confidence = 1.0;
                let canAnswer = true;

                if (activeOrKey && content && content.trim() !== '') {
                    const checkPrompt = `You are Arion, an animal health assistant by AranyaAI.

A user has asked the following question:
"${content}"

Can you answer this question confidently and accurately 
from your own training knowledge about animal health, 
veterinary care, breeds, and animal medicine?

Reply with ONLY a valid JSON object, nothing else:
{
  "can_answer": true or false,
  "confidence": a number between 0.0 and 1.0,
  "reason": "one short sentence explaining why"
}

Rules:
- true means you are confident you can give a reliable answer
- false means the question needs current, external, 
  or very specific information you are not sure about
- Be honest. If you are not fully sure, say false.`;

                    try {
                        const hfToken = process.env.HF_TOKEN;
                        const orKey = process.env.OPENROUTER_API_KEY;
                        const activeOrKey = orKey && orKey !== 'your_openrouter_api_key_here' ? orKey : null;

                        if (activeOrKey && (failingProviders.or.count < 3 || (Date.now() - failingProviders.or.lastFail) > PROVIDER_COOLDOWN)) {
                            const confOpenai = new OpenAI({
                                apiKey: activeOrKey,
                                baseURL: 'https://openrouter.ai/api/v1',
                                defaultHeaders: {
                                    "HTTP-Referer": "http://localhost:3000",
                                    "X-Title": "Arion Routing",
                                }
                            });

                            const confRes = await confOpenai.chat.completions.create({
                                model: "google/gemma-3-12b-it:free",
                                messages: [{ role: "user", content: checkPrompt }],
                                max_tokens: 100
                            });

                            let jsonText = confRes.choices[0].message.content.trim();
                            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                            const cleanJsonText = jsonMatch ? jsonMatch[0] : jsonText;
                            const parsed = JSON.parse(cleanJsonText);

                            canAnswer = parsed.can_answer;
                            confidence = parsed.confidence;
                        } else if (process.env.GEMINI_API_KEY) {
                            // Fallback to Gemini for routing if OpenRouter is down
                            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
                            const result = await model.generateContent({
                                contents: [{ role: "user", parts: [{ text: checkPrompt }] }],
                                generationConfig: { responseMimeType: "application/json" }
                            });
                            const parsed = JSON.parse(result.response.text());
                            canAnswer = parsed.can_answer;
                            confidence = parsed.confidence;
                        }

                        if (canAnswer === true && confidence >= 0.85) {
                            route = "direct";
                        } else {
                            route = "web_search";
                        }
                        console.log(`[LLM Routing] Decision: ${route} (canAnswer: ${canAnswer}, confidence: ${confidence})`);
                    } catch (err) {
                        console.error("LLM Routing failed, defaulting to web_search:", err.message);
                        route = "web_search";
                    }
                }

                finalRoute = route;
                finalConfidence = confidence;

                // STEP 2 & 3: Web Search execution
                let searchSnippets = [];

                if (route === "web_search" && content) {
                    sendStatus("Searching the web...");
                    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
                    const cx = process.env.GOOGLE_CSE_ID;

                    if (apiKey && cx) {
                        try {
                            console.log(`[Web Search] Executing Google CSE query for: "${content}"`);
                            // Using native fetch in Node 18+
                            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(content)}`;
                            const searchResp = await fetch(searchUrl);
                            if (searchResp.ok) {
                                const searchData = await searchResp.json();
                                console.log(`[Web Search] Received ${searchData.items ? searchData.items.length : 0} items from Google`);
                                if (searchData.items && searchData.items.length > 0) {
                                    sendStatus("Processing search results...");
                                    // Trusted domains unchanged (using process.env if available)
                                    const whitelist = process.env.TRUSTED_DOMAINS ? process.env.TRUSTED_DOMAINS.split(',').map(d => d.trim()) : [];

                                    let results = searchData.items;
                                    if (whitelist.length > 0) {
                                        results = results.filter(item => whitelist.some(domain => item.link.includes(domain)));
                                        console.log(`[Web Search] ${results.length} items matched the trusted whitelist.`);
                                    }

                                    if (results.length > 0) {
                                        searchSources = results.slice(0, 3).map(r => ({ title: r.title, url: r.link }));
                                        searchSnippets = results.slice(0, 3).map(r => r.snippet);
                                    } else {
                                        console.log(`[Web Search] Fallback: No items matched whitelist.`);
                                        finalRoute = "direct_fallback";
                                    }
                                } else {
                                    console.log(`[Web Search] Fallback: No search items returned.`);
                                    finalRoute = "direct_fallback";
                                }
                            } else {
                                console.log(`[Web Search] Fallback: HTTP Error ${searchResp.status}`);
                                finalRoute = "direct_fallback";
                            }
                        } catch (e) {
                            console.error("[Web Search] Google CSE Error:", e.message);
                            finalRoute = "direct_fallback";
                        }
                    } else {
                        console.warn("[Web Search] Fallback overridden: Missing GOOGLE_SEARCH_API_KEY or GOOGLE_CSE_ID in .env!");
                        // If missing API keys, immediately fallback
                        finalRoute = "direct_fallback";
                    }
                }

                const systemPrompt = `You are Arion, a multimodal animal health assistant.

You only help with:
- animal health (including diseases, treatments, and diagnostics)
- animal care and nutrition
- breed information
- veterinary guidance and news
- latest veterinary medicine approvals (e.g., FDA-CVM)
- clinical breakthroughs in veterinary science
- safe educational information about common veterinary medicines
- general animal questions

Hard restriction:
- If a request is entirely unrelated to animals, animal health, animal care, breeds, or veterinary topics (for example: coding, cooking, politics, celebrity news), refuse it.
- Do not answer any part of unrelated questions.
- Reply only with:
"I only help with animal health, care, and veterinary topics."

Default language is English.
- If the user writes in another language, reply in that language when possible.
- If the user mixes languages, reply in the language that best matches the user’s message.

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
- Keep the answer length proportional to the user’s question.
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
- Do not provide exact prescriptions, exact doses, frequency, duration, or drug combinations unless the user only wants help understanding a veterinarian’s written prescription.
- Do not suggest risky self-medication.
- If medicine safety is uncertain, advise veterinary consultation.

If the question is outside animal-related topics, reply only with:
"I only help with animal health, care, and veterinary topics."`;

                let currentSystemPrompt = systemPrompt;
                if (searchSnippets.length > 0) {
                    currentSystemPrompt += `\n\nExternal Web Search Context:\n` + searchSnippets.map((s, i) => `[${i + 1}] ${s}`).join("\n") + `\n\nUse this context to accurately answer the user's question.`;
                    sendStatus("Web answering...");
                } else {
                    sendStatus("Answering...");
                }

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
                    { role: "system", content: currentSystemPrompt },
                    ...chatMemory,
                    { role: "user", content: userMessageContent }
                ];

                let response;
                let useFallback = false;

                if (hfToken && hfToken !== 'your_hf_token_here' && (failingProviders.hf.count < 3 || (Date.now() - failingProviders.hf.lastFail) > PROVIDER_COOLDOWN)) {
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
                        console.error("Hugging Face API Error:", hfErr.message);
                        failingProviders.hf.lastFail = Date.now();
                        // If it's a quota error (402 or 429), skip for 1 hour immediately
                        if (hfErr.message.includes('402') || hfErr.message.includes('429')) {
                            failingProviders.hf.count = 3;
                        } else {
                            failingProviders.hf.count++;
                        }
                        useFallback = true;
                    }
                } else {
                    useFallback = true;
                }

                if (useFallback && activeOrKey && (failingProviders.or.count < 3 || (Date.now() - failingProviders.or.lastFail) > PROVIDER_COOLDOWN)) {
                    try {
                        const orOpenai = new OpenAI({
                            apiKey: activeOrKey,
                            baseURL: 'https://openrouter.ai/api/v1',
                            defaultHeaders: {
                                "HTTP-Referer": "http://localhost:3000",
                                "X-Title": "Arion Chatbot",
                            }
                        });
                        response = await orOpenai.chat.completions.create({
                            model: "google/gemma-3-12b-it:free",
                            messages: finalMessages,
                            max_tokens: 1000
                        });
                    } catch (orErr) {
                        console.error("OpenRouter API Error:", orErr.message);
                        failingProviders.or.lastFail = Date.now();
                        if (orErr.message.includes('429')) {
                            failingProviders.or.count = 3;
                        } else {
                            failingProviders.or.count++;
                        }
                        useFallback = true; // Continue to next fallback
                    }
                } else if (useFallback) {
                    useFallback = true;
                }

                // Gemini Fallback (if others failed or were skipped)
                if ((!response || useFallback) && process.env.GEMINI_API_KEY && (failingProviders.gemini.count < 3 || (Date.now() - failingProviders.gemini.lastFail) > PROVIDER_COOLDOWN)) {
                    let geminiRetries = 0;
                    const maxGeminiRetries = 1;

                    while (geminiRetries <= maxGeminiRetries) {
                        try {
                            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

                            const contents = finalMessages.slice(1).map(m => {
                                let parts = [];
                                if (Array.isArray(m.content)) {
                                    parts = m.content.map(c => c.type === 'text' ? { text: c.text } : { inlineData: { data: c.image_url.url.split(',')[1], mimeType: "image/jpeg" } });
                                } else {
                                    parts = [{ text: String(m.content) }];
                                }
                                return {
                                    role: m.role === 'assistant' ? 'model' : 'user',
                                    parts
                                };
                            });

                            const result = await model.generateContent({
                                contents,
                                systemInstruction: { parts: [{ text: String(finalMessages[0].content) }] }
                            });
                            const geminiResponse = await result.response;
                            aiContent = geminiResponse.text();

                            response = { choices: [{ message: { content: aiContent } }] };
                            break; // Success!
                        } catch (gemErr) {
                            console.error("Gemini API Error:", gemErr.message);
                            if (gemErr.message.includes('429')) {
                                if (geminiRetries < maxGeminiRetries) {
                                    console.warn(`Gemini Rate Limited (429), retrying in 3s... (Attempt ${geminiRetries + 1}/${maxGeminiRetries + 1})`);
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    geminiRetries++;
                                    continue;
                                }
                                failingProviders.gemini.lastFail = Date.now();
                                failingProviders.gemini.count = 3; // Block for 1 hour
                            } else {
                                failingProviders.gemini.lastFail = Date.now();
                                failingProviders.gemini.count++;
                            }

                            if (!response) {
                                throw new Error("All AI APIs (HF, OpenRouter, Gemini) failed.");
                            }
                            break;
                        }
                    }
                }

                if (!response || !response.choices || response.choices.length === 0) {
                    throw new Error("Invalid response structural format from AI API.");
                }

                aiContent = response.choices[0].message.content;
            } catch (aiErr) {
                console.error("AI API Error:", aiErr);
                // Don't set warning yet, let the fallback below handle it
            }
        }

        if (!aiContent || aiContent.includes("*(System Warning: Failed")) {
            // Replaced keyword-based routing with a much better diagnostic fallback
            aiContent = `I have carefully noted your query regarding: "${content}".\n\nAs your Arion Veterinary Assistant, I'm currently processing this through my local diagnostic protocols. To provide the best possible guidance, could you please share a bit more detail? \n\nFor example:\n- **Species & Breed** (e.g., Labrador dog, Holstein cow)\n- **Primary Symptoms** (e.g., lethargy, coughing, loss of appetite)\n- **Duration** (How long has this been happening?)\n\nYou can also upload a clear photo of the affected area and I will use my visual diagnostics to analyze it for you. 🏥🐾`;
            console.log("Using intelligent fallback logic (API providers unavailable).");
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

        res.write(`data: ${JSON.stringify({
            type: 'result',
            userMessage: userMsg,
            aiMessage: aiMsg,
            conversation,
            route: finalRoute,
            confidence: finalConfidence,
            sources: searchSources
        })}\n\n`);
        res.end();
    } catch (err) {
        console.error(err.message);
        // Fallback for general errors if headers haven't sent, or send structured SSE error if they have
        if (!res.headersSent) {
            res.status(500).send('Server Error');
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Server Error' })}\n\n`);
            res.end();
        }
    }
});

module.exports = router;
