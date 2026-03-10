const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Animal = require('../models/Animal');
const ActivityLog = require('../models/ActivityLog');
const Faq = require('../models/Faq');
const { logActivity } = require('../utils/logger');

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

const log = async (type, adminUser, detail) => {
    await logActivity(type, adminUser, detail);
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
            blockedUsers, proUsers, totalAnimals, criticalAnimals, activeToday
        ] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'user', createdAt: { $gte: todayStart } }),
            User.countDocuments({ role: 'user', createdAt: { $gte: weekAgo } }),
            User.countDocuments({ role: 'user', createdAt: { $gte: monthAgo } }),
            User.countDocuments({ blocked: true }),
            User.countDocuments({ plan: 'pro' }),
            Animal.countDocuments(),
            Animal.countDocuments({ status: 'critical' }),
            User.countDocuments({ lastLoginAt: { $gte: todayStart } }),
        ]);

        // Simulated website-level metrics (replace with real analytics later)
        const pageViews = Math.floor(totalUsers * 4.7 + Math.random() * 50);
        const avgSessionMin = (3 + Math.random() * 4).toFixed(1);

        res.json({
            totalUsers, newToday, newThisWeek, newThisMonth,
            blockedUsers, proUsers, totalAnimals, criticalAnimals,
            activeToday, pageViews, avgSessionMin
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
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
        const user = await User.findByIdAndUpdate(req.params.id, { blocked }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log('admin', req.user, `${blocked ? 'Blocked' : 'Unblocked'} user: ${user.full_name || user.email}`);
        res.json(user);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// Toggle role
router.put('/users/:id/role', authenticate, adminOnly, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        await log('admin', req.user, `Changed ${user.full_name || user.email}'s role to ${role}`);
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
        await log('admin', req.user, `Deleted user: ${user.full_name || user.email}`);
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
        await log('admin', req.user, `Added FAQ: "${question}"`);
        res.status(201).json(faq);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/faqs/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const faq = await Faq.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        await log('admin', req.user, `Updated FAQ: "${faq.question}"`);
        res.json(faq);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/faqs/:id', authenticate, adminOnly, async (req, res) => {
    try {
        const faq = await Faq.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ message: 'FAQ not found' });
        await log('admin', req.user, `Deleted FAQ: "${faq.question}"`);
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

const SystemSettings = require('../models/SystemSettings');

// ── AI Model Configuration ────────────────────────────
router.get('/config/ai', authenticate, adminOnly, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne({ key: 'ai_config_v2' });
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
"I only help with animal health, care, and veterinary topics."`
            });
        }
        res.json(settings.value);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/config/ai', authenticate, adminOnly, async (req, res) => {
    try {
        const { primary, fallback, systemPrompt } = req.body;
        const newValue = { primary, fallback, systemPrompt };

        const settings = await SystemSettings.findOneAndUpdate(
            { key: 'ai_config_v2' },
            { value: newValue },
            { upsert: true, new: true }
        );

        await log('admin', req.user, `Updated AI Model Configuration`);
        res.json(settings.value);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

