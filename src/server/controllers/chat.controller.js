const ChatService = require('../services/chat.service');
const ChatMessage = require('../models/ChatMessage');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');
const Plan = require('../models/Plan');
const { OpenAI } = require('openai');
const axios = require('axios');
const { logActivity } = require('../utils/logger');
const Conversation = require('../models/Conversation');

class ChatController {
    static async getConversations(req, res, next) {
        try {
            const conversations = await ChatService.getConversations(req.user.id);
            res.json(conversations);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async createConversation(req, res, next) {
        try {
            const conversation = await ChatService.createConversation(req.user.id);
            res.json(conversation);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async renameConversation(req, res, next) {
        try {
            const conversation = await ChatService.renameConversation(req.user.id, req.params.id, req.body.title);
            res.json(conversation);
        } catch (err) {
            res.status(err.message === 'Chat not found' ? 404 : 401).json({ msg: err.message });
        }
    }

    static async deleteConversation(req, res, next) {
        try {
            await ChatService.deleteConversation(req.user.id, req.params.id);
            res.json({ msg: 'Chat deleted' });
        } catch (err) {
            res.status(err.message === 'Chat not found' ? 404 : 401).send(err.message);
        }
    }

    static async getMessages(req, res, next) {
        try {
            const messages = await ChatService.getMessages(req.user.id, req.params.id);
            res.json(messages);
        } catch (err) {
            res.status(404).json({ msg: 'Chat not found' });
        }
    }

    static async getDailyCount(req, res, next) {
        try {
            const count = await ChatService.getDailyCount(req.user.id);
            res.json({ count });
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async sendMessage(req, res, next) {
        const { content, image_url, image_urls, chatMode, stream = true } = req.body;
        try {
            const user = await User.findById(req.user.id);
            const userPlan = await Plan.findOne({ code: user.plan, active: true });
            const dailyLimit = userPlan ? userPlan.dailyChatMessages : 5;

            if (dailyLimit !== -1) {
                const count = await ChatService.getDailyCount(req.user.id);
                if (count >= dailyLimit) return res.status(403).json({ msg: `Daily limit of ${dailyLimit} messages reached.` });
            }

            const userMsg = new ChatMessage({ conversation_id: req.params.id, user_id: req.user.id, role: 'user', content, image_url, image_urls: image_urls || (image_url ? [image_url] : []) });
            await userMsg.save();

            let aiConfig = { primary: { enabled: false, provider: '', baseURL: '', apiKey: '', models: [] }, fallback: { enabled: false, provider: '', baseURL: '', apiKey: '', models: [] }, intelligence: { duckduckgo: { enabled: false }, opensearch: { enabled: false }, tinyfish: { enabled: false } }, systemPrompt: "", aranyaPrompt: "", vaccinePrompt: "" };
            const dbConfig = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
            if (dbConfig?.value) aiConfig = { ...aiConfig, ...dbConfig.value };
            console.log('[DEBUG] Fetched aiConfig:', JSON.stringify({ primary: !!aiConfig.primary?.enabled, fallback: !!aiConfig.fallback?.enabled }, null, 2));

            const thinkingStartTime = Date.now();
            let headersSent = false;
            const emitThinking = (text) => {
                if (!stream) return;
                if (!headersSent) {
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache, no-transform');
                    res.setHeader('Connection', 'keep-alive');
                    res.flushHeaders();
                    res.write(`data: ${JSON.stringify({ thinkingStart: thinkingStartTime })}\n\n`);
                    headersSent = true;
                }
                res.write(`data: ${JSON.stringify({ thinking: text })}\n\n`);
                if (res.flush) res.flush();
            };

            // Dynamic query topic for contextual thinking
            const queryTopic = content.length > 70 ? content.substring(0, 70) + '...' : content;

            // Mode-specific thinking: Step 1 — what the system is doing with this query
            if (chatMode === 'chiron') {
                emitThinking(`Searching knowledge base for "${queryTopic}"`);
            } else if (chatMode === 'aranya') {
                emitThinking(`Analyzing pet health context for "${queryTopic}"`);
            } else {
                emitThinking(`Searching for "${queryTopic}"`);
            }

            const previousMessages = await ChatMessage.find({ conversation_id: req.params.id, user_id: req.user.id, _id: { $ne: userMsg._id } }).sort({ createdAt: -1 }).limit(10).lean();

            if (previousMessages.length > 0) {
                emitThinking(`Reading ${previousMessages.length} previous message${previousMessages.length > 1 ? 's' : ''} for context`);
            }

            const { systemPrompt, toonHistory, intelligenceType, chironSources } = await ChatService.buildContextualPrompt(req.user.id, chatMode, content, previousMessages, aiConfig);

            // Mode-specific thinking: Step 2 — what was found
            if (chatMode === 'chiron' && chironSources?.length > 0) {
                emitThinking(`Found ${chironSources.length} relevant knowledge source${chironSources.length > 1 ? 's' : ''}`);
            } else if (chatMode === 'chiron') {
                emitThinking('No matching documents found in knowledge base');
            }

            const finalMessages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: [{ type: 'text', text: `${toonHistory}[TASK]: ${content}` }, ...((image_urls || (image_url ? [image_url] : [])).map(url => ({ type: 'image_url', image_url: { url } })))] }];

            const engines = await ChatService.selectLLMEngine(aiConfig, !!(image_url || image_urls?.length));
            console.log('[DEBUG] Selected engines:', engines.map(e => ({ type: e.type, model: e.modelId, name: e.name })));
            
            let completionStream = null;
            let currentEngine = null;

            for (const engine of engines) {
                try {
                    emitThinking(`Generating response with ${engine.name || engine.modelId}`);
                    console.log(`[DEBUG] Attempting generation with engine: ${engine.type} (${engine.modelId})`);
                    
                    const client = new OpenAI({ apiKey: engine.apiKey, baseURL: engine.baseURL });
                    const chironTemp = aiConfig.chiron?.temperature ?? 0.3;
                    completionStream = await client.chat.completions.create({
                        model: engine.modelId,
                        messages: finalMessages,
                        max_tokens: engine.maxTokens || 1200,
                        stream: stream,
                        temperature: chatMode === 'chiron' ? chironTemp : (engine.temperature ?? 0.7),
                        frequency_penalty: engine.frequencyPenalty ?? 0.5,
                        presence_penalty: engine.presencePenalty ?? 0.3
                    });
                    currentEngine = engine;
                    console.log(`[DEBUG] Engine ${engine.type} success!`);
                    break;
                } catch (pErr) { 
                    console.error(`[DEBUG] Engine ${engine.type} (${engine.modelId}) failed:`, pErr.message); 
                    if (pErr.response) {
                        console.error(`[DEBUG] Error response data:`, pErr.response.data);
                    }
                }
            }

            if (!completionStream) throw new Error('AI engines unavailable.');

            if (stream) {
                res.write(`data: ${JSON.stringify({ thinkingDone: true, thinkingDuration: Date.now() - thinkingStartTime })}\n\n`);
                if (chatMode === 'chiron') res.write(`data: ${JSON.stringify({ metadata: { intelligenceType: 'chiron', sources: chironSources } })}\n\n`);

                let fullText = "";
                let inThinkBlock = false;
                let buffer = "";

                for await (const chunk of completionStream) {
                    const reasoningDelta = chunk.choices[0]?.delta?.reasoning_content || "";
                    if (reasoningDelta) {
                        res.write(`data: ${JSON.stringify({ thoughtToken: reasoningDelta })}\n\n`);
                        if (res.flush) res.flush();
                        continue;
                    }

                    const delta = chunk.choices[0]?.delta?.content || "";
                    if (delta) {
                        buffer += delta;

                        if (!inThinkBlock && buffer.includes('<think>')) {
                            const parts = buffer.split('<think>');
                            if (parts[0]) {
                                fullText += parts[0];
                                res.write(`data: ${JSON.stringify({ token: parts[0] })}\n\n`);
                            }
                            inThinkBlock = true;
                            buffer = parts.slice(1).join('<think>');
                        }

                        if (inThinkBlock && buffer.includes('</think>')) {
                            const parts = buffer.split('</think>');
                            if (parts[0]) {
                                res.write(`data: ${JSON.stringify({ thoughtToken: parts[0] })}\n\n`);
                            }
                            inThinkBlock = false;
                            buffer = parts.slice(1).join('</think>');
                            if (buffer) {
                                fullText += buffer;
                                res.write(`data: ${JSON.stringify({ token: buffer })}\n\n`);
                            }
                            buffer = "";
                            if (res.flush) res.flush();
                            continue;
                        }

                        if (inThinkBlock) {
                            if (buffer.length > 8) {
                                const toEmit = buffer.slice(0, -8);
                                res.write(`data: ${JSON.stringify({ thoughtToken: toEmit })}\n\n`);
                                buffer = buffer.slice(-8);
                            }
                        } else {
                            if (buffer.length > 8 && !buffer.includes('<')) {
                                fullText += buffer;
                                res.write(`data: ${JSON.stringify({ token: buffer })}\n\n`);
                                buffer = "";
                            }
                        }
                        
                        if (res.flush) res.flush();
                    }
                }
                
                if (buffer) {
                    if (inThinkBlock) res.write(`data: ${JSON.stringify({ thoughtToken: buffer })}\n\n`);
                    else {
                        fullText += buffer;
                        res.write(`data: ${JSON.stringify({ token: buffer })}\n\n`);
                    }
                    if (res.flush) res.flush();
                }

                // ARANYA AI: Web Search Logic
                if (chatMode === 'aranya' && fullText.includes('[SEARCH_NEEDED:')) {
                    const searchMatch = fullText.match(/\[SEARCH_NEEDED:\s*(.+?)\]/i);
                    const searchQuery = searchMatch[1].trim();
                    emitThinking(`Searching web for "${searchQuery}"...`);
                    try {
                        const pyServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8005';
                        const sRes = await axios.post(`${pyServiceUrl.replace(/\/$/, '')}/api/search`, { query: searchQuery, max_results: 4 }, { timeout: 8000 });
                        const sResults = sRes.data.results || [];
                        const sourceMeta = sResults.map(r => ({ title: r.title, url: r.url, domain: new URL(r.url).hostname.replace('www.', '') }));
                        res.write(`data: ${JSON.stringify({ metadata: { intelligenceType: 'web', sources: sourceMeta } })}\n\n`);

                        const sContext = sResults.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`).join('\n\n');
                        const sMessages = [{ role: 'system', content: systemPrompt }, ...previousMessages.map(m => ({ role: m.role, content: m.content || "" })), { role: 'user', content: `Context:\n${sContext}\nQuestion: "${content}"\nProvide synthesized answer.` }];

                        const client = new OpenAI({ apiKey: currentEngine.apiKey, baseURL: currentEngine.baseURL });
                        const augStream = await client.chat.completions.create({ model: currentEngine.modelId, messages: sMessages, max_tokens: 1000, stream: true });

                        fullText = "";
                        for await (const chunk of augStream) {
                            const delta = chunk.choices[0]?.delta?.content || "";
                            if (delta) {
                                fullText += delta;
                                res.write(`data: ${JSON.stringify({ token: delta })}\n\n`);
                                if (res.flush) res.flush();
                            }
                        }
                    } catch (sErr) { console.error('Web search failed:', sErr.message); }
                }

                const finalAiMsg = await ChatService.saveConversation(req.user.id, req.params.id, content, fullText, chironSources, intelligenceType);
                res.write(`data: ${JSON.stringify({ done: true, messageId: finalAiMsg._id })}\n\n`);
                return res.end();
            } else {
                const aiResponse = completionStream.choices[0].message.content;
                const finalAiMsg = await ChatService.saveConversation(req.user.id, req.params.id, content, aiResponse, chironSources, intelligenceType);
                res.json({ userMessage: userMsg, aiMessage: finalAiMsg });
            }
        } catch (err) {
            console.error('Chat error:', err.message);
            if (stream && !res.headersSent) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.write(`data: ${JSON.stringify({ token: '⚠️ AI engine is temporarily unavailable.' })}\n\n`);
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                return res.end();
            }
            res.status(500).send('Server Error');
        }
    }

    static async pinMessage(req, res, next) {
        try {
            const msg = await ChatMessage.findById(req.params.msgId);
            if (!msg) return res.status(404).json({ msg: 'Message not found' });
            
            // Security check
            const conversation = await Conversation.findById(msg.conversation_id);
            if (!conversation || conversation.user_id.toString() !== req.user.id) {
                return res.status(404).json({ msg: 'Message not found' });
            }

            msg.isPinned = !msg.isPinned;
            await msg.save();
            res.json(msg);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async reactMessage(req, res, next) {
        try {
            const { emoji } = req.body;
            if (!emoji) return res.status(400).json({ msg: 'Emoji is required' });

            const msg = await ChatMessage.findById(req.params.msgId);
            if (!msg) return res.status(404).json({ msg: 'Message not found' });

            // Security check
            const conversation = await Conversation.findById(msg.conversation_id);
            if (!conversation || conversation.user_id.toString() !== req.user.id) {
                return res.status(404).json({ msg: 'Message not found' });
            }

            const existingIdx = msg.reactions?.findIndex(
                r => r.emoji === emoji && r.user_id.toString() === req.user.id
            ) ?? -1;

            if (existingIdx !== -1) {
                msg.reactions.splice(existingIdx, 1); // Remove reaction
            } else {
                if (!msg.reactions) msg.reactions = [];
                msg.reactions.push({ emoji, user_id: req.user.id });
            }

            await msg.save();
            res.json(msg);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }

    static async searchMessages(req, res, next) {
        try {
            const results = await ChatService.searchMessages(req.user.id, req.query.q);
            res.json(results);
        } catch (err) {
            res.status(500).send('Server Error');
        }
    }
}

module.exports = ChatController;
