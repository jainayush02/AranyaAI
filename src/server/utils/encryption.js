const crypto = require('crypto');

// ── Master Key Infrastructure ──
// Use a 32-byte key from .env (e.g., openssl rand -base64 32)
// For safety, providing a local fallback if not defined, but prod MUST have it.
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'aranya_ai_default_secret_key_32_chars_long'; // 32 chars
const IV_LENGTH = 16; 

/**
 * Encrypts a plain-text string for secure DB storage
 * @param {string} text - The key or sensitive value to encrypt
 * @returns {string} - Encrypted string with IV prepended
 */
function encrypt(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf-8').slice(0, 32), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (err) {
        console.error('[ENCRYPTION_FAILURE]', err);
        return text; // Return as-is if encryption fails (fallback)
    }
}

/**
 * Decrypts a stored encrypted string
 * @param {string} text - Hex string format "iv:encrypted"
 * @returns {string} - Decrypted plain text
 */
function decrypt(text) {
    if (!text || !text.includes(':')) return text; // If not encrypted, return as-is
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf-8').slice(0, 32), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (err) {
        // console.error('[DECRYPTION_FAIL] Likely plain-text or corrupt key');
        return text; // Return as-is if it's already plain text (migration fallback)
    }
}

module.exports = { encrypt, decrypt };
