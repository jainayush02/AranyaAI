/**
 * AranyaAI Vital Signs Monitoring Module
 * =====================================
 * Species-aware, breed-specific, age/gender-aware health monitoring engine.
 * Refactored into a modular structure for better maintainability and testability.
 */

const { vital_limits, getLimits } = require('./getLimits');
const { MLEngineeredMonitor } = require('./MLEngineeredMonitor');
const { calculateAgeYears, mapActivityLevel } = require('./helpers');

module.exports = {
    vital_limits,
    getLimits,
    MLEngineeredMonitor,
    calculateAgeYears,
    mapActivityLevel
};
