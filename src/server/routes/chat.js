const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Animal = require('../models/Animal');
const { OpenAI } = require('openai');
const axios = require('axios');
const { logActivity } = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const { searchKnowledge } = require('./chiron');

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
    const { content, image_url, image_urls, chatMode } = req.body;
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
        let intelligenceType = 'arion';

        // Fetch dynamic AI configuration — exclusively from Admin Portal
        let aiConfig = {
            primary: { enabled: false, provider: '', baseURL: '', apiKey: '', models: [] },
            fallback: { enabled: false, provider: '', baseURL: '', apiKey: '', models: [] },
            intelligence: { duckduckgo: { enabled: false }, opensearch: { enabled: false }, tinyfish: { enabled: false } },
            systemPrompt: "",
            aranyaPrompt: "",
            vaccinePrompt: ""
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

            const hasImage = !!(image_url || (image_urls && image_urls.length > 0));

            let systemPrompt = aiConfig.systemPrompt;

            if (chatMode === 'chiron') {
                systemPrompt = `[STRICT_GROUNDING_DIRECTIVE]: You are Chiron. 
                - For identity questions (Name, Breed, Age, Gender), use [PET_PROFILES] and provide direct, simple answers (e.g., "Rocky is a Beagle").
                - For medical/clinical advice, you MUST use the [CHIRON_KNOWLEDGE_BASE].
                - If the Knowledge Base has specific info for the pet's breed, use it. 
                - If the Knowledge Base lacks breed-specific info, you MUST state: "I don't have specific Knowledge Base information for the [Breed] breed, but for dogs in general..." and then provide the general Knowledge Base facts.
                - NEVER use internal memory or general vet knowledge for clinical facts.
                - Always use the full term "Knowledge Base", never "KB".\n\n` + systemPrompt;
            }

            // ── Parallel DB fetch: pet profiles + chat history ──
            const [userAnimals, previousMessages] = await Promise.all([
                chatMode === 'aranya'
                    ? Animal.find({ user_id: req.user.id }).lean().catch(() => [])
                    : Promise.resolve([]),
                ChatMessage.find({
                    conversation_id: req.params.id,
                    user_id: req.user.id,
                    _id: { $ne: userMsg._id }
                }).sort({ createdAt: -1 }).limit(15).lean()
            ]);

            // ── ARANYA AI MODE: Pet Context Injection ──
            let petContextBlock = "";
            if (chatMode === 'aranya' && userAnimals.length > 0) {
                const calcAge = (dob) => {
                    if (!dob) return 'Unknown';
                    const ms = Date.now() - new Date(dob).getTime();
                    const yrs = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
                    const mos = Math.floor((ms % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
                    return yrs > 0 ? `${yrs}y ${mos}m` : `${mos}m`;
                };
                const petLines = userAnimals.map(a => {
                    const age = calcAge(a.dob);
                    const vax = a.vaccinated ? 'Yes' : 'No';
                    const temp = a.recentVitals?.temperature ?? '—';
                    const hr = a.recentVitals?.heartRate ?? '—';
                    const wt = a.recentVitals?.weight ? `${a.recentVitals.weight}kg` : '—';
                    return `• ${a.name} | ${a.category} | ${a.breed} | ${a.gender} | Age:${age} | Status:${a.status} | Vax:${vax} | Temp:${temp}°C HR:${hr}bpm Wt:${wt}`;
                }).join('\n');
                const petInst = aiConfig.petContextInstruction || "";
                petContextBlock = `\n\n[PET_PROFILES]\n${petInst}\n${petLines}\n[PET_PROFILES_END]\n`;
            }

            if (chatMode === 'aranya') {
                const aranyaPrompt = aiConfig.aranyaPrompt || "";
                systemPrompt += petContextBlock;
                systemPrompt += `\n\n[ARANYA_AI_MODE]\n${aranyaPrompt}\n[ARANYA_AI_MODE_END]`;
            }

            // ── CHIRON INTELLIGENCE MODE: RAG + Pet Context Injection ──
            let chironKnowledgeBlock = "";
            let chironSources = [];
            if (chatMode === 'chiron') {
                try {
                    // Load user animals for context
                    const chironAnimals = await Animal.find({ user_id: req.user.id }).lean().catch(() => []);
                    
                    // First, always inject pet context
                    if (chironAnimals.length > 0) {
                        const calcAge = (dob) => {
                            if (!dob) return 'Unknown';
                            const ms = Date.now() - new Date(dob).getTime();
                            const yrs = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
                            const mos = Math.floor((ms % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
                            return yrs > 0 ? `${yrs}y ${mos}m` : `${mos}m`;
                        };
                        const petLines = chironAnimals.map(a => {
                            const age = calcAge(a.dob);
                            const vax = a.vaccinated ? 'Yes' : 'No';
                            const temp = a.recentVitals?.temperature ?? '—';
                            const hr = a.recentVitals?.heartRate ?? '—';
                            const wt = a.recentVitals?.weight ? `${a.recentVitals.weight}kg` : '—';
                            return `• ${a.name} | ${a.category} | ${a.breed} | ${a.gender} | Age:${age} | Status:${a.status} | Vax:${vax} | Temp:${temp}°C HR:${hr}bpm Wt:${wt}`;
                        }).join('\n');
                        petContextBlock = `\n\n[PET_PROFILES]\n${petLines}\n[PET_PROFILES_END]\n`;
                        systemPrompt += petContextBlock;
                    }

                    // Direct Internal Search - bypassing port 8006
                    const topK = aiConfig.chiron?.topK || 5;
                    const retrievedDocs = await searchKnowledge(content, topK);
                    
                    if (retrievedDocs.length > 0) {
                        intelligenceType = 'chiron';
                        chironSources = retrievedDocs.map((doc, i) => ({
                            title: doc.source,
                            snippet: doc.text?.substring(0, 150),
                            source: doc.source,
                            score: doc.score
                        }));

                        chironKnowledgeBlock = retrievedDocs
                            .map((doc, i) => `[Doc ID: DOC_${i+1}] (Source: ${doc.source}) ${doc.text}`)
                            .join('\n\n');

                        systemPrompt += `\n\n[CHIRON_KNOWLEDGE_BASE]\nUse these documents for ALL medical facts. If pet profiles are provided, use them to identify the animal. If a clinical query is about a specific breed not mentioned in these docs, you MUST provide a disclaimer. Always refer to this as the "Knowledge Base".\n${chironKnowledgeBlock}\n[CHIRON_KNOWLEDGE_BASE_END]`;
                    } else {
                        systemPrompt += `\n\n[STRICT_GROUNDING_NOTICE]: No relevant medical documents found in the Knowledge Base. You may identify the pet using [PET_PROFILES], but you MUST refuse all clinical advice using your standard refusal phrase: "I'm sorry, I could not find enough information in the Knowledge Base..."`;
                    }

                    const chironPrompt = aiConfig.chironPrompt || "You are Chiron Intelligence, an expert veterinary advisor. Strictly use the knowledge base and pet profiles to provide grounded, personalized advice. If knowledge is missing, admit it.";
                    systemPrompt += `\n\n[CHIRON_MODE]\n${chironPrompt}\n[CHIRON_MODE_END]`;

                } catch (chironErr) {
                    console.error('[Chiron] RAG query error:', chironErr.message);
                    intelligenceType = 'chiron_fallback';
                }
            }

            if (image_url) {
                console.log(`Processing message with image for conversation ${req.params.id}`);
            }

            // Build TOON compact context
            const toonHistory = [...previousMessages].reverse().map(m => {
                const prefix = m.role === 'ai' ? 'a: ' : 'u: ';
                return `${prefix}${m.content || "[Photo Sent]"}`;
            }).join('\n');

            const historyBlock = toonHistory ? `[HISTORY]\n${toonHistory}\n[HISTORY_END]\n\n` : "";

            const finalMessages = [
                { 
                    role: "system", 
                    content: systemPrompt 
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: `${historyBlock}[TASK]: ${content || "Respond to user"}` },
                        ...(image_url || (image_urls && image_urls.length > 0)
                            ? (image_urls || [image_url]).map(url => ({ type: "image_url", image_url: { url } }))
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

                    const temperature = intelligenceType === 'chiron' ? (aiConfig.chiron?.temperature || 0.3) : 0.7;

                    completionStream = await primaryOpenai.chat.completions.create({
                        model: primaryModelObj.modelId,
                        messages: finalMessages,
                        max_tokens: 900,
                        stream: stream,
                        temperature: temperature
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
                    
                    const temperature = intelligenceType === 'chiron' ? (aiConfig.chiron?.temperature || 0.3) : 0.7;

                    try {
                        completionStream = await fallbackOpenai.chat.completions.create({
                            model: fallbackModelObj.modelId,
                            messages: finalMessages,
                            max_tokens: 900,
                            stream: stream,
                            temperature: temperature
                        });
                    } catch (roleErr) {
                        if (roleErr.message && roleErr.message.includes('400')) {
                            const [firstUser] = finalMessages.slice(1, 2);
                            const noSystemMessages = [{
                                role: 'user',
                                content: firstUser.content.map(c =>
                                    c.type === 'text' ? { ...c, text: `[SYSTEM]\n${systemPrompt}\n[/SYSTEM]\n\n${c.text}` } : c
                                )
                            }];
                            completionStream = await fallbackOpenai.chat.completions.create({
                                model: fallbackModelObj.modelId,
                                messages: noSystemMessages,
                                max_tokens: 900,
                                stream: stream,
                                temperature: temperature
                            });
                        } else throw roleErr;
                    }
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
                let sourceMeta = chatMode === 'chiron' ? (chironSources || []) : [];
                
                // Emit Chiron metadata immediately if applicable
                if (chatMode === 'chiron') {
                    const metadata = {
                        intelligenceType: 'chiron',
                        sources: chironSources || []
                    };
                    res.write(`data: ${JSON.stringify({ metadata })}\n\n`);
                    if (res.flush) res.flush();
                }

                for await (const chunk of completionStream) {
                    const delta = chunk.choices[0]?.delta?.content || "";
                    if (delta) {
                        fullText += delta;
                        res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
                        if (res.flush) res.flush();
                        // 4ms Ultra-Fast Smoothness logic is handled by frontend processing speed
                    }
                }


                // ── ARANYA AI: Smart Web Search (Latest Info Only) ──
                if (chatMode === 'aranya') {
                    const searchMatch = fullText.match(/\[SEARCH_NEEDED:\s*(.+?)\]/i);

                    if (searchMatch) {
                        const searchQuery = searchMatch[1].trim();
                        intelligenceType = 'web';
                        console.log(`[ARANYA_AI] Web search triggered by Node: "${searchQuery}"`);

                        // Strip the search tag from the initial response
                        const cleanedText = fullText
                            .replace(/\[SEARCH_NEEDED:\s*.+?\]/gi, '')
                            .trim();

                        let searchResults = [];
                        const intelligenceConfig = aiConfig.intelligence || {};

                        // ── Delegate Search to Python AI Microservice (port 8005) ──
                        // We always attempt the Python search for Aranya mode now as it has internal fallbacks.
                        try {
                            console.log(`[ARANYA_AI] Delegating search to Python Service (port 8005)... Query: "${searchQuery}"`);
                            const response = await axios.post('http://localhost:8005/api/search', {
                                query: searchQuery,
                                max_results: 4
                            }, { timeout: 8000 });

                            searchResults = response.data.results || [];
                            console.log(`[ARANYA_AI] Python Search Engine returned ${searchResults.length} results.`);
                        } catch (searchErr) {
                            console.error('[ARANYA_AI] Python Search Error:', searchErr.message);
                            // Fallback: if Python fails, we use internal medical training
                            searchResults = [];
                        }

                        // Build source metadata for frontend display (favicon + link on click)
                        sourceMeta = searchResults.slice(0, 3).map(r => {
                            let domain = '';
                            try { domain = new URL(r.url).hostname.replace('www.', ''); } catch (_) {}
                            return { title: r.title, url: r.url, domain };
                        });

                        // Build TOON context from search results (or fallback if empty)
                        const searchContext = searchResults.length > 0
                            ? searchResults.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`).join('\n\n')
                            : 'NO_LATEST_SEARCH_RESULTS_FOUND: Please provide the best answer using your internal medical intelligence.';

                        // Re-prompt the LLM with search context — synthesize a clean, personalized answer (no links)
                        // We strictly include historyMessages here so Aranya MAINTAINS its context window and memory.
                        const searchAugmentedMessages = [
                            { role: 'system', content: systemPrompt },
                            ...previousMessages.map(m => ({ 
                                role: m.role, 
                                content: m.content || "" 
                            })),
                            {
                                role: 'user',
                                content: (aiConfig.searchAugmentationTask || '')
                                    .replace(/\$\{content\}/g, content)
                                    .replace(/\$\{cleanedText\}/g, cleanedText)
                                    .replace(/\$\{searchContext\}/g, searchContext)
                                    || `Based on our previous conversation and this new web context:\n\n${searchContext}\n\nUser Question: "${content}"\n\nPlease provide a synthesized, expert answer. Maintain the personality established in our history. Do NOT include URLs.`
                            }
                        ];

                        // Re-use the same LLM engine for the augmented response
                        let augStream = null;
                        try {
                            const primaryTextModel = aiConfig.primary.models.find(m => m.type === 'text' || m.type === 'text+vision') || aiConfig.primary.models[0];
                            if (aiConfig.primary.enabled && aiConfig.primary.apiKey && primaryTextModel) {
                                const pClient = new OpenAI({
                                    apiKey: primaryTextModel.apiKey || aiConfig.primary.apiKey,
                                    baseURL: primaryTextModel.baseURL || aiConfig.primary.baseURL
                                });
                                augStream = await pClient.chat.completions.create({
                                    model: primaryTextModel.modelId,
                                    messages: searchAugmentedMessages,
                                    max_tokens: 1500,
                                    stream: true
                                });
                            }
                        } catch (_) {}

                        if (!augStream) {
                            try {
                                const fallbackTextModel = aiConfig.fallback.models.find(m => m.type === 'text' || m.type === 'text+vision') || aiConfig.fallback.models[0];
                                if (aiConfig.fallback.enabled && aiConfig.fallback.apiKey && fallbackTextModel) {
                                    const fClient = new OpenAI({
                                        apiKey: fallbackTextModel.apiKey || aiConfig.fallback.apiKey,
                                        baseURL: fallbackTextModel.baseURL || aiConfig.fallback.baseURL,
                                        defaultHeaders: { 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'Aranya AI Chatbot' }
                                    });
                                    augStream = await fClient.chat.completions.create({
                                        model: fallbackTextModel.modelId,
                                        messages: searchAugmentedMessages,
                                        max_tokens: 1500,
                                        stream: true
                                    });
                                }
                            } catch (_) {}
                        }

                        if (augStream) {
                            // Emit search metadata (type + sources) BEFORE starting the synthesis stream
                            const metadata = {
                                intelligenceType,
                                sources: sourceMeta.map(s => ({
                                    ...s,
                                    domain: s.domain || (s.url ? new URL(s.url).hostname.replace('www.', '') : 'Web Result')
                                }))
                            };
                            res.write(`data: ${JSON.stringify({ metadata })}\n\n`);
                            if (res.flush) res.flush();

                            let augText = '';
                            for await (const chunk of augStream) {
                                const delta = chunk.choices[0]?.delta?.content || '';
                                if (delta) {
                                    augText += delta;
                                    res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
                                    if (res.flush) res.flush();
                                }
                            }
                            fullText = augText;
                        }
                    }
                }

                const finalAiMsg = new ChatMessage({
                    conversation_id: req.params.id,
                    user_id: req.user.id,
                    role: 'ai',
                    content: (fullText || aiContent).replace(/\[SEARCH_NEEDED:\s*.+?\]/gi, '').replace(/\[PRODUCT_SEARCH:\s*.+?\]/gi, '').trim(),
                    sources: chatMode === 'chiron' ? (chironSources || []) : (sourceMeta || []),
                    intelligenceType: intelligenceType
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

        const finalAiMsg = new ChatMessage({
            conversation_id: req.params.id,
            user_id: req.user.id,
            role: 'ai',
            content: (aiContent).replace(/\[SEARCH_NEEDED:\s*.+?\]/gi, '').replace(/\[PRODUCT_SEARCH:\s*.+?\]/gi, '').trim(),
            intelligenceType: intelligenceType
        });
        await finalAiMsg.save();

        try {
            await logActivity('chat', { id: req.user.id }, `Used AI chatbot`);
        } catch (_) { }

        res.json({ userMessage: userMsg, aiMessage: finalAiMsg, conversation });
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
