const Conversation = require('../models/Conversation');
const ChatMessage = require('../models/ChatMessage');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Animal = require('../models/Animal');
const { OpenAI } = require('openai');
const axios = require('axios');
const { logActivity } = require('../utils/logger');
const { searchKnowledge } = require('../routes/chiron');

class ChatService {
    static async getConversations(userId) {
        return await Conversation.find({ user_id: userId }).sort({ updatedAt: -1 });
    }

    static async createConversation(userId) {
        const newConversation = new Conversation({ user_id: userId, title: 'New Chat' });
        return await newConversation.save();
    }

    static async renameConversation(userId, conversationId, title) {
        let conversation = await Conversation.findById(conversationId);
        if (!conversation) throw new Error('Chat not found');
        if (conversation.user_id.toString() !== userId) throw new Error('Not authorized');
        conversation.title = title || conversation.title;
        conversation.updatedAt = Date.now();
        return await conversation.save();
    }

    static async deleteConversation(userId, conversationId) {
        let conversation = await Conversation.findById(conversationId);
        if (!conversation) throw new Error('Chat not found');
        if (conversation.user_id.toString() !== userId) throw new Error('Not authorized');
        await Conversation.findByIdAndDelete(conversationId);
        await ChatMessage.deleteMany({ conversation_id: conversationId });
    }

    static async getMessages(userId, conversationId) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || conversation.user_id.toString() !== userId) throw new Error('Chat not found');
        return await ChatMessage.find({ conversation_id: conversationId }).sort({ createdAt: 1 });
    }

    static async getDailyCount(userId) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return await ChatMessage.countDocuments({ sender: userId, role: 'user', createdAt: { $gte: today } });
    }

    // Intelligence Selection Logic
    static async selectLLMEngine(aiConfig, contextHasImage) {
        const engines = [];
        console.log(`[DEBUG] selectLLMEngine - contextHasImage: ${contextHasImage}`);
        
        if (aiConfig.primary?.enabled) {
            console.log(`[DEBUG] Primary engine enabled. Checking models...`);
            const primaryModel = contextHasImage
                ? (aiConfig.primary.models?.find(m => m.type === 'vision' || m.type === 'text+vision') || aiConfig.primary.models?.find(m => m.type === 'text'))
                : aiConfig.primary.models?.find(m => m.type === 'text' || m.type === 'text+vision');
            
            if (primaryModel) {
                const finalApiKey = primaryModel.apiKey || aiConfig.primary.apiKey;
                if (finalApiKey) {
                    console.log(`[DEBUG] Selected Primary Model: ${primaryModel.modelId}`);
                    engines.push({ 
                        ...primaryModel, 
                        type: 'primary', 
                        apiKey: finalApiKey, 
                        baseURL: primaryModel.baseURL || aiConfig.primary.baseURL,
                        temperature: aiConfig.primary.temperature,
                        maxTokens: aiConfig.primary.maxTokens,
                        frequencyPenalty: aiConfig.primary.frequencyPenalty,
                        presencePenalty: aiConfig.primary.presencePenalty
                    });
                } else {
                    console.log(`[DEBUG] Primary model found but NO API Key available (gateway or model level)!`);
                }
            } else {
                console.log(`[DEBUG] NO suitable Primary Model found for context!`);
            }
        }
        
        if (aiConfig.fallback?.enabled) {
            console.log(`[DEBUG] Fallback engine enabled. Checking models...`);
            const fallbackModel = contextHasImage
                ? (aiConfig.fallback.models?.find(m => m.type === 'vision' || m.type === 'text+vision') || aiConfig.fallback.models?.find(m => m.type === 'text'))
                : aiConfig.fallback.models?.find(m => m.type === 'text' || m.type === 'text+vision');
            
            if (fallbackModel) {
                const finalApiKey = fallbackModel.apiKey || aiConfig.fallback.apiKey;
                if (finalApiKey) {
                    console.log(`[DEBUG] Selected Fallback Model: ${fallbackModel.modelId}`);
                    engines.push({ 
                        ...fallbackModel, 
                        type: 'fallback', 
                        apiKey: finalApiKey, 
                        baseURL: fallbackModel.baseURL || aiConfig.fallback.baseURL,
                        temperature: aiConfig.fallback.temperature,
                        maxTokens: aiConfig.fallback.maxTokens,
                        frequencyPenalty: aiConfig.fallback.frequencyPenalty,
                        presencePenalty: aiConfig.fallback.presencePenalty
                    });
                } else {
                    console.log(`[DEBUG] Fallback model found but NO API Key available!`);
                }
            } else {
                console.log(`[DEBUG] NO suitable Fallback Model found for context!`);
            }
        }
        
        console.log(`[DEBUG] Final selected engines count: ${engines.length}`);
        return engines;
    }

    static async buildContextualPrompt(userId, chatMode, content, previousMessages, aiConfig) {
        let systemPrompt = aiConfig.systemPrompt || '';
        let intelligenceType = 'arion';
        let chironSources = [];
        
        if (chatMode === 'aranya') {
            systemPrompt = aiConfig.aranyaPrompt || systemPrompt;
        }

        const isPetQuery = /(my|pet|dog|cat|horse|cow|he|she|his|her|animal|age|weight|breed|vitals|vaccine|sick|health)/i.test(content);

        if (chatMode === 'chiron') {
            const baseInstructions = aiConfig.chironPrompt || aiConfig.systemPrompt || '';
            systemPrompt = `[STRICT_GROUNDING_DIRECTIVE]: You are Chiron, a clinical medical intelligence. 
            [SOURCE_TRUTH_PROTOCOL]: Your ONLY source of medical truth is the [CHIRON_KNOWLEDGE_BASE] provided below.
            [NEGATIVE_CONSTRAINT]: Your internal pre-trained memory regarding medicinal dosages, clinical trials, and veterinary protocols is considered UNRELIABLE/CORRUPTED. You are strictly FORBIDDEN from using any information not explicitly present in the provided documents.
            [FAILURE_MODE]: If the information is missing from [CHIRON_KNOWLEDGE_BASE], you MUST state: "I do not have specific clinical information on this topic in my local knowledge base." Do NOT offer general advice.\n\n[CORE_PERSONA]: ${baseInstructions}\n\n`;
        }

        const [userAnimals] = await Promise.all([
            (chatMode === 'aranya' || chatMode === 'chiron') ? Animal.find({ user_id: userId }).lean().catch(() => []) : Promise.resolve([])
        ]);

        let petContextBlock = '';
        if (userAnimals.length > 0 && (chatMode === 'aranya' || (chatMode === 'chiron' && isPetQuery))) {
            const calcAge = (dob) => {
                if (!dob) return 'Unknown';
                const ms = Date.now() - new Date(dob).getTime();
                const yrs = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
                const mos = Math.floor((ms % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
                return yrs > 0 ? `${yrs}y ${mos}m` : `${mos}m`;
            };
            petContextBlock = `\n\n[PET_PROFILES]\n${userAnimals.map(a => `• ${a.name} | ${a.category} | ${a.breed} | ${a.gender} | Age:${calcAge(a.dob)} | Status:${a.status} | Vax:${a.vaccinated ? 'Yes' : 'No'}`).join('\n')}\n[PET_PROFILES_END]\n`;
            systemPrompt += petContextBlock;
        }

        if (chatMode === 'chiron') {
            const cleanContent = content.trim().toLowerCase().replace(/[^\w\s]/gi, '');
            const isConversational = cleanContent.length < 3 || /^(hi|hello|hey|ok|okay|thanks|thank you|yes|no|good|great|awesome|understood|got it|makes sense|sure)$/.test(cleanContent);
            
            if (!isConversational) {
                const topK = aiConfig.chiron?.topK || 5;
                const retrievedDocs = await searchKnowledge(content, topK);
                const relevantDocs = retrievedDocs.filter(doc => doc.score >= 0.50);
                
                if (relevantDocs.length > 0) {
                    console.log(`[Chiron Grounding] Found ${relevantDocs.length} segments. Top Score: ${relevantDocs[0].score.toFixed(2)}`);
                    intelligenceType = 'chiron';
                    chironSources = relevantDocs.map(doc => ({ title: doc.source, snippet: doc.text?.substring(0, 150), source: doc.source, score: doc.score, file_type: doc.file_type || null, source_url: doc.source_url || null }));
                    const knowledgeBlock = relevantDocs.map((doc, i) => `[Doc ID: CH_DOC_${i + 1}] (Source: ${doc.source}) ${doc.text}`).join('\n\n');
                    systemPrompt += `\n\n[CHIRON_KNOWLEDGE_BASE]\n${knowledgeBlock}\n[CHIRON_KNOWLEDGE_BASE_END]`;
                } else {
                    console.log(`[Chiron Grounding] No segments met the 0.50 threshold.`);
                    systemPrompt += `\n\n[STRICT_GROUNDING_NOTICE]: No relevant medical documents found in my local knowledge base. Refuse clinical advice.`;
                }
            }
        }

        const toonHistory = previousMessages.map(m => `${m.role === 'ai' ? 'a: ' : 'u: '}${m.content || "[Photo Sent]"}`).join('\n');
        return { systemPrompt, toonHistory, intelligenceType, chironSources };
    }

    static async saveConversation(userId, conversationId, content, aiResponse, sources, intelligenceType) {
        const conversation = await Conversation.findById(conversationId);
        if (conversation.title === 'New Chat') {
            conversation.title = content.split(' ').slice(0, 5).join(' ') + (content.split(' ').length > 5 ? '...' : '');
        }
        conversation.updatedAt = Date.now();
        await conversation.save();

        const finalAiMsg = new ChatMessage({
            conversation_id: conversationId,
            user_id: userId,
            role: 'ai',
            content: aiResponse.replace(/\[SEARCH_NEEDED:\s*.+?\]/gi, '').replace(/\[PRODUCT_SEARCH:\s*.+?\]/gi, '').trim(),
            sources: sources || [],
            intelligenceType: intelligenceType
        });
        return await finalAiMsg.save();
    }

    static async searchMessages(userId, query) {
        if (!query || query.trim().length < 2) return [];
        const escapedQ = query.trim().substring(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const conversations = await Conversation.find({ user_id: userId }).select('_id');
        const convIds = conversations.map(c => c._id);
        
        const messages = await ChatMessage.find({
            conversation_id: { $in: convIds },
            content: { $regex: escapedQ, $options: 'i' }
        })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();
            
        // Attach conversation title
        const convMap = {};
        const convData = await Conversation.find({ _id: { $in: convIds } }).select('title').lean();
        convData.forEach(c => { convMap[c._id.toString()] = c.title; });
        
        return messages.map(m => ({
            ...m,
            conversationTitle: convMap[m.conversation_id.toString()] || 'Chat'
        }));
    }
}

module.exports = ChatService;
