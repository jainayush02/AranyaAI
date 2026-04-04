/**
 * Helper functions for vital monitoring
 */

/**
 * Calculate age in years from date of birth
 * @param {string|Date} dob - Date of birth
 * @returns {number} Age in years
 */
function calculateAgeYears(dob) {
    if (!dob) return 0;
    const birthDate = new Date(dob);
    const now = new Date();
    const diffMs = now - birthDate;
    return diffMs / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Map UI activity level (1-5 scale) to internal categories
 * @param {number|string} level - Activity level from UI
 * @returns {string} "low" or "high"
 */
function mapActivityLevel(level) {
    const num = parseFloat(level) || 3;
    return num >= 4 ? 'high' : 'low';
}

module.exports = {
    calculateAgeYears,
    mapActivityLevel
};
