const mongoose = require('mongoose');

const SystemMetricsSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    type: { type: String, default: 'llm_latency', index: true },
    data: { type: Object, required: true } // { [modelId]: latency }
});

// Index to automatically clear old metrics (keep 7 days)
SystemMetricsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('SystemMetrics', SystemMetricsSchema);
