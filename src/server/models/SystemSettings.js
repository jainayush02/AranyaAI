const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const systemSettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { 
        type: mongoose.Schema.Types.Mixed, 
        required: true,
        // Transparent Decryption on retrieval
        get: (v) => {
            if (typeof v === 'string' && v.includes(':')) {
                try {
                    const decrypted = decrypt(v);
                    return JSON.parse(decrypted);
                } catch { return v; }
            }
            return v;
        },
        // Transparent Encryption on save for sensitive keys
        set: (v) => {
            const sensitiveKeys = ['ai_config_v2', 'twillio_config', 'google_config', 'pinecone_config'];
            // If the key is sensitive and the value is an object, encrypt it
            // Note: 'this.key' isn't always available in setters, so we check the context if possible
            // or we encrypt if it's an object being passed to a known sensitive key via findOneAndUpdate
            return v; 
        }
    }
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

// More robust pre-save encryption
systemSettingsSchema.pre('save', function(next) {
    const sensitiveKeys = ['ai_config_v2', 'twillio_config', 'google_config', 'pinecone_config', 'resend_config'];
    if (sensitiveKeys.includes(this.key) && typeof this.value === 'object') {
        this.value = encrypt(JSON.stringify(this.value));
    }
    next();
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
