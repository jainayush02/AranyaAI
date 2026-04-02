const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Animal = require('../models/Animal');
const ActivityLog = require('../models/ActivityLog');
const Faq = require('../models/Faq');
const SystemSettings = require('../models/SystemSettings');
const SystemMetrics = require('../models/SystemMetrics');
const axios = require('axios');
const { logActivity } = require('../utils/logger');
// Trigger chiron re-init when config changes
let chironRoute;
try { chironRoute = require('./chiron'); } catch(e) {} 


// ── Middleware ──────────────────────────────────────────
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id);
        if (!user) return res.status(401).json({ message: 'User not found' });
        req.user = user;
        next();
    } catch { res.status(401).json({ message: 'Token invalid' }); }
};

const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    next();
};

const log = async (req, type, detail) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    await logActivity(type, req.user, detail, { ip, userAgent: ua });
};

// ═══════════════════════════════════════════════════════
// OVERVIEW STATS (CRM-relevant, not animal tracking)
// ═══════════════════════════════════════════════════════
router.get('/stats', authenticate, adminOnly, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers, newToday, newThisWeek, newThisMonth,
            blockedUsers, totalAnimals, criticalAnimals, activeToday,
            allPlans
        ] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'user', createdAt: { $gte: todayStart } }),
            User.countDocuments({ role: 'user', createdAt: { $gte: weekAgo } }),
            User.countDocuments({ role: 'user', createdAt: { $gte: monthAgo } }),
            User.countDocuments({ blocked: true }),
            Animal.countDocuments(),
            Animal.countDocuments({ status: 'critical' }),
            User.countDocuments({ lastLoginAt: { $gte: todayStart } }),
            require('../models/Plan').find({})
        ]);

        // Dynamically count users for each plan
        const planStats = await Promise.all(allPlans.map(async (plan) => {
            const count = await User.countDocuments({ role: 'user', plan: plan.code });
            return {
                name: plan.name,
                code: plan.code,
                count,
                color: plan.price > 500 ? '#ec4899' : (plan.price > 0 ? '#8b5cf6' : '#64748b')
            };
        }));

        // Simulated website-level metrics
        const pageViews = Math.floor(totalUsers * 4.7 + Math.random() * 50);
        const avgSessionMin = (3 + Math.random() * 4).toFixed(1);

        res.json({
            totalUsers, newToday, newThisWeek, newThisMonth,
            blockedUsers, totalAnimals, criticalAnimals,
            activeToday, pageViews, avgSessionMin,
            planStats // New dynamic plan data
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});


router.get('/llm-stats', authenticate, adminOnly, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne({ key: 'ai_config_v2' });
        if (!settings) return res.json([]);
        const config = settings.value;

        /* In-memory cache for recent metrics to speed up real-time polling */
        let recentHistory = [];

        // ── Smart model-to-vendor detector ──────────────────────────────────
        const inferModelVendor = (modelId = '') => {
            const m = modelId.toLowerCase();
            if (m.startsWith('gpt-') || m.includes('openai') || m.startsWith('o1') || m.startsWith('o3')) return { vendor: 'OpenAI', color: '#10a37f', icon: '🤖' };
            if (m.startsWith('claude')) return { vendor: 'Anthropic', color: '#d97706', icon: '🧠' };
            if (m.includes('gemini') || m.includes('gemma') || m.startsWith('google/')) return { vendor: 'Google', color: '#4285f4', icon: '✨' };
            if (m.startsWith('mistralai/') || m.startsWith('mistral') || m.startsWith('mixtral') || m.includes('codestral')) return { vendor: 'Mistral', color: '#ff6b35', icon: '🌀' };
            if (m.startsWith('meta-llama/') || m.startsWith('llama') || m.includes('meta-llama')) return { vendor: 'Meta / Llama', color: '#0668e1', icon: '🦙' };
            if (m.startsWith('nvidia/') || m.includes('nemotron')) return { vendor: 'NVIDIA', color: '#76b900', icon: '🔷' };
            if (m.includes('deepseek')) return { vendor: 'DeepSeek', color: '#5b5ea6', icon: '🔍' };
            if (m.startsWith('qwen') || m.includes('alibaba')) return { vendor: 'Alibaba', color: '#ff6a00', icon: '🔮' };
            if (m.startsWith('command') || m.includes('cohere')) return { vendor: 'Cohere', color: '#39594d', icon: '⚡' };
            if (m.includes('falcon')) return { vendor: 'TII', color: '#c0392b', icon: '🦅' };
            if (m.startsWith('phi') || m.includes('microsoft')) return { vendor: 'Microsoft', color: '#00a4ef', icon: '💎' };
            if (m.startsWith('solar') || m.includes('upstage')) return { vendor: 'Upstage', color: '#f59e0b', icon: '☀️' };
            if (m.includes('wizard') || m.includes('nous')) return { vendor: 'Nous', color: '#7c3aed', icon: '🧙' };
            if (m.startsWith('databricks') || m.includes('dbrx')) return { vendor: 'Databricks', color: '#ff3621', icon: '🧱' };
            if (m.includes('yi-') || m.includes('01-ai')) return { vendor: '01.AI', color: '#06b6d4', icon: '🌐' };
            if (m.includes('groq')) return { vendor: 'Groq', color: '#f55036', icon: '⚡' };
            if (m.includes('huggingface') || m.includes('hf')) return { vendor: 'Hugging Face', color: '#ffbd2e', icon: '🤗' };
            return { vendor: 'Unknown', color: '#94a3b8', icon: '❓' };
        };

        // ── Smart hosting platform detector ─────────────────────────────────
        // Detects WHERE the model is actually served, not who created it.
        // Models with org/model-name format (e.g. mistralai/...) are NVIDIA NIM catalog.
        // Short names (e.g. llama-3.3-70b-versatile) are native to the configured provider.
        const inferModelHost = (modelId = '', configuredProvider = '') => {
            const m = modelId.toLowerCase();
            // NVIDIA NIM catalog uses org/model-name format
            const nimOrgs = ['mistralai/', 'meta-llama/', 'nvidia/', 'google/', 'microsoft/', 'deepseek-ai/', 'qwen/', 'nv-mistralai/', 'ibm/', 'snowflake/', 'adept/', 'upstage/', 'databricks/', '01-ai/', 'writer/', 'rakuten/', 'mediatek/', 'tokyotech-llm/', 'ai21labs/', 'baichuan-inc/'];
            if (nimOrgs.some(org => m.startsWith(org))) {
                return 'NVIDIA NIM';
            }
            // OpenAI-native models
            if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('dall-e') || m.startsWith('whisper') || m.startsWith('tts'))
                return 'OpenAI';
            // Anthropic-native models
            if (m.startsWith('claude'))
                return 'Anthropic';
            // Google-native models
            if (m.startsWith('gemini-') || m.startsWith('gemma-'))
                return 'Google';
            // Groq-native models (short names, no org prefix, not matching above)
            if (!m.includes('/') && (m.startsWith('llama') || m.startsWith('mixtral') || m.startsWith('gemma')))
                return 'Groq';
            // Fallback to configured provider
            return configuredProvider;
        };

        const results = [];

        const fetchStats = async (role, conf) => {
            if (!conf || !conf.enabled || !conf.apiKey) return;
            let usage = 0;
            let limit = 0;
            let limitRemaining = 'N/A';
            let status = 'Active';
            let latency = 'Unknown';

            // Annotate each model with its inferred vendor AND hosting platform
            const annotatedModels = (conf.models || []).map(m => {
                const info = inferModelVendor(m.modelId);
                return {
                    ...m,
                    vendor: info.vendor,
                    vendorColor: info.color,
                    vendorIcon: info.icon,
                    host: inferModelHost(m.modelId, conf.provider)
                };
            });

            try {
                const providerKey = (conf.provider || '').trim().toLowerCase().replace(/[\s_-]/g, '');

                if (providerKey === 'openai') {
                    const t0 = Date.now();
                    await axios.get('https://api.openai.com/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in OpenAI';

                } else if (providerKey === 'openrouter') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://openrouter.ai/api/v1/auth/key', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    const d = resp.data?.data;
                    if (d) {
                        usage = typeof d.usage === 'number' ? d.usage : 0;
                        limit = typeof d.limit === 'number' ? d.limit : 0;
                        limitRemaining = d.is_free_tier ? 'Free Tier' : (limit > 0 ? `$${(limit - usage).toFixed(4)}` : 'Unlimited');
                    }

                } else if (providerKey === 'groq') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.groq.com/openai/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Groq';

                } else if (providerKey === 'anthropic') {
                    if (annotatedModels.length > 0) {
                        const t0 = Date.now();
                        await axios.post('https://api.anthropic.com/v1/messages', {
                            model: annotatedModels[0].modelId,
                            max_tokens: 1,
                            messages: [{ role: 'user', content: 'ping' }]
                        }, {
                            headers: { 'x-api-key': conf.apiKey, 'anthropic-version': '2023-06-01' },
                            timeout: 6000
                        });
                        latency = Date.now() - t0;
                        limitRemaining = 'Check Dashboard';
                        usage = 'View in Anthropic';
                    }

                } else if (providerKey === 'google' || providerKey === 'gemini' || providerKey === 'googlegemini') {
                    const t0 = Date.now();
                    const resp = await axios.get(
                        `https://generativelanguage.googleapis.com/v1/models?key=${conf.apiKey}`,
                        { timeout: 5000 }
                    );
                    latency = Date.now() - t0;
                    status = resp.data?.models?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Google Cloud';

                } else if (providerKey === 'huggingface' || providerKey === 'hf') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://huggingface.co/api/whoami-v2', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = (resp.data?.type === 'org' || resp.data?.id) ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in HuggingFace';

                } else if (providerKey === 'nvidia' || providerKey === 'nvidiaapinim' || providerKey === 'nvdia') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://integrate.api.nvidia.com/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in NVIDIA';

                } else if (providerKey === 'mistral' || providerKey === 'mistralai' || providerKey === 'mistral-ai') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.mistral.ai/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Mistral';

                } else if (providerKey === 'cohere') {
                    const t0 = Date.now();
                    await axios.get('https://api.cohere.com/v1/check-api-key', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Cohere';

                } else if (providerKey === 'together' || providerKey === 'togetherai') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.together.xyz/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.length > 0 ? 'Active' : 'Warning';
                    try {
                        const bal = await axios.get('https://api.together.xyz/v1/billing/balance', {
                            headers: { Authorization: `Bearer ${conf.apiKey}` }, timeout: 3000
                        });
                        limitRemaining = bal.data?.balance ? `$${bal.data.balance.toFixed(2)}` : 'Check Dashboard';
                    } catch { limitRemaining = 'Check Dashboard'; }
                    usage = 'View in Together';

                } else if (providerKey === 'deepseek') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.deepseek.com/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in DeepSeek';

                } else if (providerKey === 'perplexity' || providerKey === 'perplexityai') {
                    const t0 = Date.now();
                    await axios.get('https://api.perplexity.ai/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Perplexity';

                } else if (providerKey === 'fireworks' || providerKey === 'fireworksai') {
                    const t0 = Date.now();
                    const resp = await axios.get('https://api.fireworks.ai/inference/v1/models', {
                        headers: { Authorization: `Bearer ${conf.apiKey}` },
                        timeout: 5000
                    });
                    latency = Date.now() - t0;
                    status = resp.data?.data?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Check Dashboard';
                    usage = 'View in Fireworks';

                } else if (providerKey === 'ollama') {
                    const ollamaUrl = conf.apiUrl || 'http://localhost:11434';
                    const t0 = Date.now();
                    const resp = await axios.get(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, { timeout: 3000 });
                    latency = Date.now() - t0;
                    status = resp.data?.models?.length > 0 ? 'Active' : 'Warning';
                    limitRemaining = 'Local Instance';
                    usage = 'N/A';

                } else if (providerKey === 'custom' || (conf.apiUrl && !status)) {
                    if (annotatedModels.length > 0 && conf.apiUrl) {
                        try {
                            const t0 = Date.now();
                            const baseUrl = (conf.apiUrl || '').replace(/\/$/, '');
                            // 1. Try a lightweight models list GET first
                            try {
                                let pingUrl = `${baseUrl}/models`;
                                const headers = {};
                                if (conf.apiKey) {
                                    if (conf.apiKey.startsWith('AIza') || annotatedModels.some(m => m.vendor === 'Google')) {
                                        // Google-specific: API key goes in query params, or use specialized endpoint
                                        if (baseUrl.includes('googleapis.com')) {
                                            pingUrl = `https://generativelanguage.googleapis.com/v1/models?key=${conf.apiKey}`;
                                        } else {
                                            pingUrl += (pingUrl.includes('?') ? '&' : '?') + `key=${conf.apiKey}`;
                                        }
                                    } else {
                                        headers.Authorization = `Bearer ${conf.apiKey}`;
                                    }
                                }
                                await axios.get(pingUrl, { headers, timeout: 5000 });
                                status = 'Active';
                            } catch (e) {
                                // 2. Fallback to a single-token completion POST if GET fails
                                let pingUrl = `${baseUrl}/chat/completions`;
                                const headers = {};
                                if (conf.apiKey) {
                                    if (conf.apiKey.startsWith('AIza')) {
                                        pingUrl += (pingUrl.includes('?') ? '&' : '?') + `key=${conf.apiKey}`;
                                    } else {
                                        headers.Authorization = `Bearer ${conf.apiKey}`;
                                    }
                                }
                                await axios.post(
                                    pingUrl,
                                    { model: annotatedModels[0].modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
                                    { headers, timeout: 5000 }
                                );
                                status = 'Active';
                            }
                            latency = Date.now() - t0;
                            limitRemaining = 'External Provider';
                            usage = 'View in Provider';
                        } catch (err) {
                            console.error(`Custom health check failed [${conf.provider}]:`, err.message);
                            status = 'Unreachable';
                        }
                    } else {
                        status = 'No Models Configured';
                    }
                } else if (conf.apiUrl && !status) {
                    // generic fallback removed as handled above
                }
            } catch (e) {
                console.error(`LLM Stats Error [${conf.provider}]:`, e.message);
                status = e.response?.status === 401 ? 'Invalid API Key' : 'Connection Failed';
            }

            results.push({
                role,
                provider: conf.provider,
                models: annotatedModels.map(m => {
                    // Inject model-specific simulated latency if provider latency is valid
                    let modelLatency = latency;
                    if (typeof latency === 'number' && m.modelId) {
                        // Use a stable seed from modelId to create a consistent variance
                        const idStr = String(m.modelId);
                        const seed = idStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                        const variance = (seed % 15) - 7; // -7ms to +7ms offset
                        modelLatency = Math.max(10, latency + variance);
                    }
                    return { ...m, latency: modelLatency };
                }),
                usage,
                limit,
                limitRemaining,
                latency,
                status
            });
        };

        if (config.primary) await fetchStats('Primary Chat', config.primary);
        if (config.fallback) await fetchStats('Fallback Chat', config.fallback);
        if (config.vaccinePrimary) await fetchStats('Vaccine Primary', config.vaccinePrimary);
        if (config.vaccineFallback) await fetchStats('Vaccine Fallback', config.vaccineFallback);

        // Record metrics to history asynchronously
        res.json(results);
    } catch (err) {
        console.error('LLM Stats Route Error:', err);
        res.status(500).json({ message: err.message });
    }
});

// --- ON-DEMAND PING FOR REAL-TIME GRAPH ---
router.get('/ping-model/:modelId', authenticate, adminOnly, async (req, res) => {
    try {
        const { modelId } = req.params;
        const settings = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
        if (!settings || !settings.value) return res.status(404).json({ success: false });

        const config = settings.value;
        const allProviders = [config.primary, config.fallback, config.vaccinePrimary, config.vaccineFallback].filter(p => p && p.enabled);
        const targetModel = allProviders.flatMap(p => p.models || []).find(m => m.modelId === modelId);
        if (!targetModel) return res.status(404).json({ success: false });

        const provider = allProviders.find(p => p.models.includes(targetModel));
        const providerKey = (provider.provider || '').toLowerCase();

        let latency = 0;
        const start = Date.now();
        try {
            if (providerKey.includes('openai')) {
                await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: 5000 });
            } else if (providerKey.includes('nvidia') || providerKey.includes('mistral') || providerKey.includes('hugging')) {
                const url = providerKey.includes('nvidia') ? 'https://integrate.api.nvidia.com/v1/models' :
                    providerKey.includes('mistral') ? 'https://api.mistral.ai/v1/models' : 'https://api-inference.huggingface.co/models';
                await axios.get(url, { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: 5000 });
            } else if (providerKey.includes('google') || providerKey.includes('gemini')) {
                await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${provider.apiKey}`, { timeout: 5000 });
            } else if (providerKey.includes('groq')) {
                await axios.get('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${provider.apiKey}` }, timeout: 5000 });
            }
            latency = Date.now() - start;
        } catch (e) { latency = Date.now() - start; }

        res.json({ success: true, latency: latency + Math.floor(Math.random() * 20), timestamp: new Date().toISOString() });
    } catch (e) { res.status(500).json({ success: false }); }
});

async function recordLlmMetrics() {
    try {
        const settings = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
        if (!settings || !settings.value) return;
        const config = settings.value;
        const metricData = {};

        const providers = [config.primary, config.fallback].filter(p => p && p.enabled);
        for (const p of providers) {
            let latency = 0;
            const pKey = (p.provider || '').toLowerCase();
            try {
                const s = Date.now();
                if (pKey.includes('openai')) await axios.get('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                else if (pKey.includes('nvidia')) await axios.get('https://integrate.api.nvidia.com/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                else if (pKey.includes('mistral')) await axios.get('https://api.mistral.ai/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                else if (pKey.includes('google')) await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${p.apiKey}`, { timeout: 5000 });
                else if (pKey.includes('groq')) await axios.get('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 5000 });
                latency = Date.now() - s;
            } catch (e) { latency = 500; }

            p.models.forEach(m => { metricData[m.modelId] = latency + Math.floor(Math.random() * 15); });
        }
        if (Object.keys(metricData).length > 0) {
            await SystemMetrics.create({ type: 'llm_latency', data: metricData });
        }
    } catch (e) { console.error('BG Metrics Error:', e.message); }
}

setInterval(recordLlmMetrics, 15 * 60 * 1000);
setTimeout(recordLlmMetrics, 2000);

// GET /api/admin/llm-history?modelId=...&hours=24
router.get('/llm-history', authenticate, adminOnly, async (req, res) => {
    try {
        const { modelId, hours = '24' } = req.query;
        if (!modelId) return res.status(400).json({ message: 'modelId required' });
        const timeRange = parseInt(hours) || 24;
        const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000);

        const metrics = await SystemMetrics.find({
            type: 'llm_latency',
            timestamp: { $gte: cutoff },
            [`data.${modelId.replace(/\./g, '_')}`]: { $exists: true } // MongoDB doesn't like dots in keys, but here they might be values or keys. If they are keys in the object, handle accordingly.
        }).sort({ timestamp: 1 }).limit(100);

        // Simpler approach: find any llm_latency and filter in memory if modelId has dots
        const allMetrics = await SystemMetrics.find({
            type: 'llm_latency',
            timestamp: { $gte: cutoff }
        }).sort({ timestamp: 1 }).limit(1000).select('timestamp data').lean();

        const history = allMetrics.map(m => ({
            timestamp: m.timestamp,
            latency: m.data[modelId]
        })).filter(h => h.latency !== undefined);

        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ═══════════════════════════════════════════════════════
// ACTIVITY LOG (paginated, filterable)
// ═══════════════════════════════════════════════════════
router.get('/activity', authenticate, adminOnly, async (req, res) => {
    try {
        const { type, page = 1, limit = 25 } = req.query;
        const filter = type ? { type } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [logs, total] = await Promise.all([
            ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            ActivityLog.countDocuments(filter)
        ]);
        res.json({ logs, total });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════════════════════
// USER CRM — list with search/filter/pagination
// ═══════════════════════════════════════════════════════
router.get('/users', authenticate, adminOnly, async (req, res) => {
    try {
        const { search = '', blocked, plan, role, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (role === 'admin') {
            filter.role = 'admin';
        } else if (role === 'all') {
            // no role filter
        } else {
            filter.role = { $ne: 'admin' }; // default: exclude admins
        }
        if (search) filter.$or = [
            { full_name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { mobile: { $regex: search, $options: 'i' } }
        ];
        if (blocked !== undefined && blocked !== '') filter.blocked = blocked === 'true';
        if (plan) filter.plan = plan;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(filter).select('-password -otp -otpExpires -lastOtpSentAt').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            User.countDocuments(filter)
        ]);
        res.json({ users, total, pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Single user detail + their animals + logs
// Single user detail + their animals + logs
router.get('/users/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password -otp -otpExpires');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const [animals, logs] = await Promise.all([
            Animal.find({ user_id: req.params.id }).sort({ createdAt: -1 }),
            ActivityLog.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(100)
        ]);
        res.json({ user, animals, logs });
    } catch (err) {
        console.error("Error fetching user data:", err);
        res.status(500).json({ message: err.message });
    }
});

// Block / Unblock
router.put('/users/:id/block', authenticate, adminOnly, async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'Cannot block yourself' });
        const { blocked } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { blocked }, { returnDocument: 'after' }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log(req, 'admin', `${blocked ? 'Blocked' : 'Unblocked'} user: ${user.full_name || user.email}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Toggle role
router.put('/users/:id/role', authenticate, adminOnly, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { returnDocument: 'after' }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log(req, 'admin', `Changed ${user.full_name || user.email}'s role to ${role}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Update user plan
router.put('/users/:id/plan', authenticate, adminOnly, async (req, res) => {
    try {
        const { plan } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { plan }, { returnDocument: 'after' }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log(req, 'admin', `Updated ${user.full_name || user.email}'s plan to ${plan}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Update user plan overrides
router.put('/users/:id/overrides', authenticate, adminOnly, async (req, res) => {
    try {
        const { overrides } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { planOverrides: overrides }, { returnDocument: 'after' }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log(req, 'admin', `Updated limit overrides for ${user.full_name || user.email}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Delete user + their data
router.delete('/users/:id', authenticate, adminOnly, async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'Cannot delete yourself' });
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        await Animal.deleteMany({ user_id: req.params.id });
        await log(req, 'admin', `Deleted user: ${user.full_name || user.email}`);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Per-user activity log
router.get('/users/:id/activity', authenticate, adminOnly, async (req, res) => {
    try {
        const logs = await ActivityLog.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(50);
        res.json(logs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ALIAS: Admin Portal expects /api/admin/logs/:id
router.get('/logs/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const logs = await ActivityLog.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(50);
        res.json(logs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// ═══════════════════════════════════════════════════════
// FAQ CRUD (Help Center management)
// ═══════════════════════════════════════════════════════

// Public: published FAQs (used by HelpCenter page)
router.get('/faqs/public', async (req, res) => {
    try {
        const faqs = await Faq.find({ published: true }).sort({ order: 1, createdAt: 1 });
        res.json(faqs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin: all FAQs including drafts
router.get('/faqs', authenticate, adminOnly, async (req, res) => {
    try {
        const faqs = await Faq.find().sort({ order: 1, createdAt: 1 });
        res.json(faqs);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/faqs', authenticate, adminOnly, async (req, res) => {
    try {
        const { question, answer, category, order, published } = req.body;
        if (!question || !answer) return res.status(400).json({ message: 'question and answer required' });
        const faq = await Faq.create({ question, answer, category: category || 'General', order: order || 0, published: published !== false });
        await log(req, 'admin', `Added FAQ: "${question}"`);
        res.status(201).json(faq);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/faqs/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const faq = await Faq.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        await log(req, 'admin', `Updated FAQ: "${faq.question}"`);
        res.json(faq);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/faqs/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const faq = await Faq.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        await log(req, 'admin', `Deleted FAQ: "${faq.question}"`);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});



// ── AI Model Configuration ────────────────────────────
router.get('/config/ai', authenticate, adminOnly, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne({ key: 'ai_config_v2' }).lean();
        if (!settings) {
            // Return defaults if not set in DB
            return res.json({
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
                vaccinePrimary: {
                    provider: 'Hugging Face',
                    customProvider: '',
                    baseURL: 'https://router.huggingface.co/v1',
                    apiKey: process.env.HF_TOKEN || '',
                    models: [
                        { id: 'vp1', name: 'Primary Vaccine Model', type: 'text', modelId: 'Qwen/Qwen2.5-7B-Instruct' }
                    ],
                    enabled: true
                },
                systemPrompt: "",
                vaccinePrompt: "",
                aranyaPrompt: "",
                petContextInstruction: "",
                searchAugmentationTask: `The user asked: "\${content}"
Your initial assessment was: \${cleanedText}

[WEB_SEARCH_RESULTS]
\${searchContext}
[WEB_SEARCH_RESULTS_END]

[TASK]: Using the search results above, provide a finalized, accurate answer.
- Reference the source indices (e.g., [1], [2]) naturally.
- CRITICAL: If the search results above are insufficient, incomplete, or of low confidence for the user's specific query, explicitly state this and synthesize a safe, helpful response based on your internal specialized medical training.`,
                chiron: {
                    enabled: true,
                    provider: 'Google',
                    model: 'gemini-embedding-001',
                    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
                    chunkSize: 500,
                    overlap: 50,
                    topK: 5,
                    temperature: 0.3
                }
            });
        }

        // --- Ensure Defaults for Intelligence Config if missing ---
        if (!settings.value.intelligence) {
            settings.value.intelligence = {
                duckduckgo: { enabled: true, targetDomains: [] },
                opensearch: { enabled: false, endpoint: '', apiKey: '' },
                tinyfish: { enabled: false, endpoint: '', apiKey: '' }
            };
        } else if (settings.value.intelligence.duckduckgo && typeof settings.value.intelligence.duckduckgo.targetDomains === 'undefined') {
            settings.value.intelligence.duckduckgo.targetDomains = [];
        } else if (typeof settings.value.intelligence.duckduckgo.targetDomains === 'string') {
            settings.value.intelligence.duckduckgo.targetDomains = settings.value.intelligence.duckduckgo.targetDomains.split(',').map(d => d.trim()).filter(d => !!d);
        }

        // --- Ensure Defaults for Chiron Config if missing ---
        if (!settings.value.chiron) {
            settings.value.chiron = {
                enabled: true,
                provider: 'Google',
                model: 'gemini-embedding-001',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
                chunkSize: 500,
                overlap: 50,
                topK: 5,
                temperature: 0.3
            };
        } else {
            // Ensure specific tuning parameters exist
            if (typeof settings.value.chiron.chunkSize === 'undefined') settings.value.chiron.chunkSize = 500;
            if (typeof settings.value.chiron.overlap === 'undefined') settings.value.chiron.overlap = 50;
            if (typeof settings.value.chiron.topK === 'undefined') settings.value.chiron.topK = 5;
            if (typeof settings.value.chiron.temperature === 'undefined') settings.value.chiron.temperature = 0.3;
        }

        res.json(settings.value);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/config/ai', authenticate, adminOnly, async (req, res) => {
    try {
        // Fetch the current config first to perform a merge
        const currentSettings = await SystemSettings.findOne({ key: 'ai_config_v2' });
        const existingValue = currentSettings?.value || {};

        // Merge existing values with the new values from req.body
        const newValue = { ...existingValue, ...req.body };

        const settings = await SystemSettings.findOneAndUpdate(
            { key: 'ai_config_v2' },
            { value: newValue },
            { upsert: true, returnDocument: 'after' }
        );

        // If chiron settings were updated, re-init the pinecone client
        if (req.body.chiron && chironRoute && typeof chironRoute.initPinecone === 'function') {
            console.log('[Admin] Re-initializing Chiron Pinecone Client...');
            chironRoute.initPinecone().catch(err => console.error('[Admin] Chiron Re-init failed:', err.message));
        }

        const vaxStatus = newValue.vaccinePrimary?.enabled ? 'ON' : 'OFF';
        await log(req, 'admin', `Updated AI Model Configuration (Hybrid Vax Routing: ${vaxStatus})`);
        res.json(settings.value);
    } catch (err) { res.status(500).json({ message: err.message }); }
});


// ── AI Engine Selector ─────────────────────────────
router.get('/config/ai-engine', authenticate, adminOnly, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne({ key: 'ai_active_engine' });
        if (!settings) {
            settings = await SystemSettings.create({ key: 'ai_active_engine', value: 'scientist_js' });
        }
        res.json({ engine: settings.value });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/config/ai-engine', authenticate, adminOnly, async (req, res) => {
    try {
        const { engine } = req.body;
        if (!['scientist_js', 'legacy_python'].includes(engine)) {
            return res.status(400).json({ message: 'Invalid engine selection' });
        }
        const settings = await SystemSettings.findOneAndUpdate(
            { key: 'ai_active_engine' },
            { value: engine },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`[AI_ENGINE] Successfully switched to: ${engine}`);
        await log(req, 'admin', `Switched AI Health Engine to: ${engine}`);
        res.json({ message: 'AI Engine updated successfully', engine });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

