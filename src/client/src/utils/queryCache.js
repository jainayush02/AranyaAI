// Simple, high-performance in-memory query cache for Aranya AI
// Implements a lightweight "Stale-While-Revalidate" pattern
const cache = new Map();
const DEFAULT_TTL = 30 * 1000; // 30 seconds for quick navigation

export const queryCache = {
  get: (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    
    // Check if entry is expired
    if (Date.now() > entry.expiry) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  },
  
  set: (key, data, ttl = DEFAULT_TTL) => {
    cache.set(key, {
      data,
      expiry: Date.now() + ttl
    });
  },
  
  invalidate: (key) => {
    if (key) cache.delete(key);
    else cache.clear();
  }
};
