const { getLimits } = require('./getLimits');

/**
 * MLEngineeredMonitor: Multi-Species EWMA Rule-Based Health Monitor
 */
class MLEngineeredMonitor {
    /**
     * @param {number} alpha - EWMA smoothing factor (0 to 1)
     * @param {number} persistenceThreshold - Number of consecutive severe readings needed for ALERT/CRITICAL
     * @param {number} windowSize - Rolling window size for severity history
     */
    constructor(alpha = 0.4, persistenceThreshold = 5, windowSize = 20) {
        this.reset(alpha, persistenceThreshold, windowSize);
    }

    /**
     * Resets the monitor's history and EWMA state
     */
    reset(alpha = 0.4, persistenceThreshold = 5, windowSize = 20) {
        this.alpha = alpha;
        this.persistenceThreshold = persistenceThreshold;
        this.windowSize = windowSize;
        this.ewmaVitals = {};
        this.severityHistory = [];
    }

    /**
     * Apply Exponentially Weighted Moving Average (EWMA) smoothing to raw vitals
     * @param {object} rawVitals - Current reading {hr, rr, temp_c, spo2}
     * @returns {object} Smoothed vitals
     */
    applyEwma(rawVitals) {
        if (Object.keys(this.ewmaVitals).length === 0) {
            this.ewmaVitals = { ...rawVitals };
        } else {
            for (const key of ['hr', 'rr', 'temp_c', 'spo2']) {
                this.ewmaVitals[key] = (this.alpha * rawVitals[key]) + ((1 - this.alpha) * this.ewmaVitals[key]);
            }
        }
        return this.ewmaVitals;
    }

    /**
     * Adjust limits based on external factors like activity and environment
     * @param {object} baseLimits - Baseline limits for profile
     * @param {string} activity - 'low' or 'high'
     * @param {number} ambientTemp - Temperature in C
     * @returns {object} Adjusted limits
     */
    adjustLimits(baseLimits, activity, ambientTemp) {
        const adj = { ...baseLimits };
        if (activity === 'high') {
            adj.max_hr = (adj.max_hr || 100) * 1.5;
            adj.max_rr = (adj.max_rr || 24) * 1.5;
        }
        if (ambientTemp > 30.0) {
            adj.max_rr = (adj.max_rr || 24) * 1.25;
            adj.max_temp_c += 0.5;
        }
        return adj;
    }

    /**
     * Calculate severity score (0 to 1) for a vital reading
     * @param {number} val - Vitals reading
     * @param {number} min - Lower limit
     * @param {number} max - Upper limit
     * @param {string} type - Vital type
     * @returns {number} Severity score
     */
    calculateVitalSeverity(val, min, max, type) {
        if (isNaN(val)) return 0;
        if (val >= min && val <= max) return 0;

        const delta = val < min ? (min - val) : (val - max);

        if (type === 'temp_c') {
            if (delta > 2.0) return 1.0;
            if (delta > 0.3) return 0.5;
        }
        if (type === 'spo2') {
            if (val < 88) return 1.0;
            if (val < 94) return 0.5;
        }
        if (type === 'hr') {
            const range = max - min;
            if (delta > range * 0.8) return 1.0;
            if (delta > range * 0.2) return 0.5;
        }
        if (type === 'rr') {
            if (delta > 15) return 1.0;
            if (delta > 5) return 0.5;
        }

        return 0.3;
    }

    /**
     * Principal method for health state determination
     * @param {object} profile - Animal profile {species, breed, age_years, gender}
     * @param {object} rawVitals - Current reading
     * @param {string} activity - Current activity level
     * @param {number} ambientTemp - Environmental temperature
     * @returns {object} Status object
     */
    processTelemetry(profile, rawVitals, activity = 'low', ambientTemp = 22.0) {
        const smoothed = this.applyEwma(rawVitals);
        const baseLimits = getLimits(
            profile.species,
            profile.breed,
            profile.age_years,
            profile.gender || null
        );

        if (!baseLimits) {
            return {
                status: 'HEALTHY',
                detail: 'Baseline not calibrated — monitoring trend only',
                smoothed
            };
        }

        const limits = this.adjustLimits(baseLimits, activity, ambientTemp);

        const severities = {
            temp: this.calculateVitalSeverity(smoothed.temp_c, limits.min_temp_c, limits.max_temp_c, 'temp_c'),
            hr: this.calculateVitalSeverity(smoothed.hr, limits.min_hr, limits.max_hr, 'hr'),
            spo2: this.calculateVitalSeverity(smoothed.spo2, limits.min_spo2, limits.max_spo2, 'spo2'),
            rr: this.calculateVitalSeverity(smoothed.rr, limits.min_rr, limits.max_rr, 'rr')
        };

        let compositeSeverity = 0;
        const maxSingleSeverity = Math.max(...Object.values(severities));

        compositeSeverity = (severities.temp * 0.4) + (severities.hr * 0.3) + (severities.spo2 * 0.2) + (severities.rr * 0.1);

        if (severities.temp >= 0.5 && severities.rr >= 0.5) compositeSeverity *= 1.25;
        if (severities.hr >= 0.5 && severities.spo2 >= 0.5) compositeSeverity *= 1.5;

        this.severityHistory.push(compositeSeverity);
        if (this.severityHistory.length > this.windowSize) this.severityHistory.shift();

        const avgSeverity = this.severityHistory.reduce((a, b) => a + b, 0) / this.severityHistory.length;

        // Implement persistenceThreshold (Task 3 Fix 3)
        // Check for CRITICAL status (either extreme single reading or persistent high severity)
        if (maxSingleSeverity >= 1.0 || (avgSeverity >= 0.5 && this.severityHistory.length >= this.persistenceThreshold)) {
            return { status: 'CRITICAL', detail: 'Critical Physiological Distress', smoothed, aiErrorScore: avgSeverity };
        }

        if (avgSeverity >= 0.20) {
            return { status: 'ALERT', detail: 'Persistent Abnormal Vitals', smoothed, aiErrorScore: avgSeverity };
        }

        return { status: 'HEALTHY', detail: 'General Stability Detected', smoothed, aiErrorScore: avgSeverity };
    }
}

const monitorRegistry = new Map();

/**
 * getMonitor: Factory function for per-animal monitor instances
 * @param {string} animalId - The animal's unique ID
 * @returns {MLEngineeredMonitor} The persistent monitor instance
 */
function getMonitor(animalId) {
    if (!monitorRegistry.has(animalId.toString())) {
        monitorRegistry.set(animalId.toString(), new MLEngineeredMonitor());
    }
    return monitorRegistry.get(animalId.toString());
}

module.exports = {
    MLEngineeredMonitor,
    getMonitor
};
