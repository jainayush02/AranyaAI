const SystemSettings = require('../models/SystemSettings');

let cache = {};
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedSettings(key) {
    const now = Date.now();
    if (cache[key] && (now - lastFetch < CACHE_TTL)) {
        return cache[key];
    }

    try {
        const settings = await SystemSettings.findOne({ key });
        if (settings) {
            cache[key] = settings.value;
            lastFetch = now;
            return settings.value;
        }
        return null;
    } catch (err) {
        console.error(`[SettingsCache] Error fetching ${key}:`, err.message);
        return cache[key] || null; // Fallback to stale cache if DB fails
    }
}

function clearCache() {
    cache = {};
    lastFetch = 0;
}

module.exports = { getCachedSettings, clearCache };
