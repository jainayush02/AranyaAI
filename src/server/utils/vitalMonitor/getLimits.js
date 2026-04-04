/**
 * Lookup function for vital limits
 */
const dogLimits = require('./limits/dog.limits');
const catLimits = require('./limits/cat.limits');
const cowLimits = require('./limits/cow.limits');
const horseLimits = require('./limits/horse.limits');

const vital_limits = {
    dog: dogLimits,
    cat: catLimits,
    cow: cowLimits,
    horse: horseLimits
};

const BREED_ALIASES = {
    "labrador": "labrador retriever",
    "golden": "golden retriever",
    "dane": "great dane",
    "shepherd": "german shepherd",
    "quarter": "quarter horse",
    "shetland": "shetland pony",
    "maine": "maine coon"
};

/**
 * Get vital limits for a specific animal profile
 * @param {string} species - Animal species
 * @param {string} breed - Animal breed
 * @param {number} ageYears - Age in years
 * @param {string} [gender] - Gender ('male' or 'female')
 * @returns {object|null} Matched vital limits row or null
 */
function getLimits(species, breed, ageYears, gender = null) {
    species = species.toLowerCase().trim();
    breed = breed.toLowerCase().trim();
    if (gender) gender = gender.toLowerCase().trim();

    const breedTable = vital_limits[species];
    if (!breedTable) return null;

    // Direct match
    let rules = breedTable[breed];

    // Explicit Alias Lookup (Replaces fragile fuzzy match)
    if (!rules) {
        const aliasKey = BREED_ALIASES[breed];
        if (aliasKey) rules = breedTable[aliasKey];
    }

    if (!rules) return null;

    for (const row of rules) {
        if (ageYears >= row.age_min && ageYears < row.age_max) {
            if (gender === null || row.gender === gender) {
                return row;
            }
        }
    }
    return null;
}

module.exports = {
    getLimits,
    vital_limits // Exported for backward compatibility in index.js re-exports
};
