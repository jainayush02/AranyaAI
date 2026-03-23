/**
 * Multi-Species EWMA Rule-Based Health Monitor
 * ==============================================
 * Replaces the old cattle-only LSTM AI model with a species-aware,
 * breed-specific, age/gender-aware vital-sign monitor using:
 *   1. A comprehensive vital_limits dictionary
 *   2. A get_limits() lookup function
 *   3. An MLEngineeredMonitor class (EWMA smoothing + persistence thresholds)
 */

// ─── 1. VITAL LIMITS DICTIONARY ──────────────────────────────────────────────
const vital_limits = {
    "dog": {
        "labrador retriever": [
            {"age_min": 0.0, "age_max": 1.5, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 35, "min_temp_c": 37.8, "max_temp_c": 39.4, "min_hr": 80, "max_hr": 130},
            {"age_min": 0.0, "age_max": 1.5, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 22, "max_rr": 38, "min_temp_c": 37.8, "max_temp_c": 39.5, "min_hr": 85, "max_hr": 140},
            {"age_min": 1.5, "age_max": 8.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 10, "max_rr": 24, "min_temp_c": 37.5, "max_temp_c": 39.0, "min_hr": 60, "max_hr": 100},
            {"age_min": 1.5, "age_max": 8.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 12, "max_rr": 26, "min_temp_c": 37.5, "max_temp_c": 39.2, "min_hr": 70, "max_hr": 110},
            {"age_min": 8.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 60, "max_hr": 90},
            {"age_min": 8.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 65, "max_hr": 95},
        ],
        "golden retriever": [
            {"age_min": 0.0, "age_max": 1.5, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 35, "min_temp_c": 37.8, "max_temp_c": 39.4, "min_hr": 80, "max_hr": 130},
            {"age_min": 0.0, "age_max": 1.5, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 22, "max_rr": 38, "min_temp_c": 37.8, "max_temp_c": 39.5, "min_hr": 85, "max_hr": 140},
            {"age_min": 1.5, "age_max": 8.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 10, "max_rr": 24, "min_temp_c": 37.5, "max_temp_c": 39.2, "min_hr": 60, "max_hr": 100},
            {"age_min": 1.5, "age_max": 8.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 12, "max_rr": 26, "min_temp_c": 37.5, "max_temp_c": 39.2, "min_hr": 70, "max_hr": 110},
            {"age_min": 8.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 60, "max_hr": 90},
            {"age_min": 8.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 65, "max_hr": 95},
        ],
        "great dane": [
            {"age_min": 0.0, "age_max": 1.5, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 15, "max_rr": 35, "min_temp_c": 37.8, "max_temp_c": 39.4, "min_hr": 70, "max_hr": 120},
            {"age_min": 0.0, "age_max": 1.5, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 15, "max_rr": 35, "min_temp_c": 37.8, "max_temp_c": 39.4, "min_hr": 75, "max_hr": 125},
            {"age_min": 1.5, "age_max": 6.0, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 10, "max_rr": 20, "min_temp_c": 37.5, "max_temp_c": 38.8, "min_hr": 50, "max_hr": 80},
            {"age_min": 1.5, "age_max": 6.0, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 10, "max_rr": 22, "min_temp_c": 37.5, "max_temp_c": 38.8, "min_hr": 55, "max_hr": 85},
            {"age_min": 6.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 10, "max_rr": 24, "min_temp_c": 37.2, "max_temp_c": 38.6, "min_hr": 45, "max_hr": 75},
            {"age_min": 6.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 12, "max_rr": 24, "min_temp_c": 37.2, "max_temp_c": 38.6, "min_hr": 50, "max_hr": 80},
        ],
        "german shepherd": [
            {"age_min": 0.0, "age_max": 1.5, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 35, "min_temp_c": 37.8, "max_temp_c": 39.4, "min_hr": 80, "max_hr": 130},
            {"age_min": 0.0, "age_max": 1.5, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 35, "min_temp_c": 37.8, "max_temp_c": 39.4, "min_hr": 85, "max_hr": 135},
            {"age_min": 1.5, "age_max": 8.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 10, "max_rr": 24, "min_temp_c": 37.5, "max_temp_c": 39.0, "min_hr": 60, "max_hr": 95},
            {"age_min": 1.5, "age_max": 8.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 12, "max_rr": 24, "min_temp_c": 37.5, "max_temp_c": 39.0, "min_hr": 65, "max_hr": 95},
            {"age_min": 8.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 12, "max_rr": 28, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 55, "max_hr": 90},
            {"age_min": 8.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 12, "max_rr": 28, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 60, "max_hr": 90},
        ],
        "beagle": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 37.8, "max_temp_c": 39.5, "min_hr": 90, "max_hr": 140},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 22, "max_rr": 40, "min_temp_c": 37.8, "max_temp_c": 39.5, "min_hr": 95, "max_hr": 145},
            {"age_min": 1.0, "age_max": 9.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.5, "max_temp_c": 39.1, "min_hr": 70, "max_hr": 115},
            {"age_min": 1.0, "age_max": 9.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.5, "max_temp_c": 39.1, "min_hr": 75, "max_hr": 120},
            {"age_min": 9.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 32, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 65, "max_hr": 105},
            {"age_min": 9.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 32, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 65, "max_hr": 110},
        ],
    },
    "cat": {
        "siamese": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 25, "max_rr": 45, "min_temp_c": 38.2, "max_temp_c": 39.8, "min_hr": 130, "max_hr": 210},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 25, "max_rr": 45, "min_temp_c": 38.2, "max_temp_c": 39.8, "min_hr": 135, "max_hr": 215},
            {"age_min": 1.0, "age_max": 12.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 20, "max_rr": 35, "min_temp_c": 38.0, "max_temp_c": 39.4, "min_hr": 130, "max_hr": 190},
            {"age_min": 1.0, "age_max": 12.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 20, "max_rr": 35, "min_temp_c": 38.0, "max_temp_c": 39.4, "min_hr": 140, "max_hr": 200},
            {"age_min": 12.0, "age_max": 100.0, "gender": "male", "min_spo2": 95, "max_spo2": 99, "min_rr": 22, "max_rr": 38, "min_temp_c": 37.6, "max_temp_c": 39.1, "min_hr": 110, "max_hr": 170},
            {"age_min": 12.0, "age_max": 100.0, "gender": "female", "min_spo2": 95, "max_spo2": 99, "min_rr": 22, "max_rr": 38, "min_temp_c": 37.6, "max_temp_c": 39.1, "min_hr": 115, "max_hr": 175},
        ],
        "maine coon": [
            {"age_min": 0.0, "age_max": 2.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 38.1, "max_temp_c": 39.6, "min_hr": 110, "max_hr": 180},
            {"age_min": 0.0, "age_max": 2.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 38.1, "max_temp_c": 39.6, "min_hr": 120, "max_hr": 190},
            {"age_min": 2.0, "age_max": 10.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 16, "max_rr": 30, "min_temp_c": 37.8, "max_temp_c": 39.2, "min_hr": 100, "max_hr": 160},
            {"age_min": 2.0, "age_max": 10.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 16, "max_rr": 30, "min_temp_c": 37.8, "max_temp_c": 39.2, "min_hr": 105, "max_hr": 165},
            {"age_min": 10.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 18, "max_rr": 32, "min_temp_c": 37.5, "max_temp_c": 39.0, "min_hr": 90, "max_hr": 150},
            {"age_min": 10.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 18, "max_rr": 32, "min_temp_c": 37.5, "max_temp_c": 39.0, "min_hr": 95, "max_hr": 155},
        ],
        "persian": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 25, "max_rr": 45, "min_temp_c": 38.1, "max_temp_c": 39.6, "min_hr": 120, "max_hr": 190},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 25, "max_rr": 45, "min_temp_c": 38.1, "max_temp_c": 39.6, "min_hr": 125, "max_hr": 195},
            {"age_min": 1.0, "age_max": 10.0, "gender": "male", "min_spo2": 94, "max_spo2": 98, "min_rr": 25, "max_rr": 40, "min_temp_c": 38.0, "max_temp_c": 39.2, "min_hr": 120, "max_hr": 180},
            {"age_min": 1.0, "age_max": 10.0, "gender": "female", "min_spo2": 94, "max_spo2": 98, "min_rr": 25, "max_rr": 40, "min_temp_c": 38.0, "max_temp_c": 39.2, "min_hr": 130, "max_hr": 190},
            {"age_min": 10.0, "age_max": 100.0, "gender": "male", "min_spo2": 93, "max_spo2": 97, "min_rr": 25, "max_rr": 42, "min_temp_c": 37.6, "max_temp_c": 38.9, "min_hr": 110, "max_hr": 170},
            {"age_min": 10.0, "age_max": 100.0, "gender": "female", "min_spo2": 93, "max_spo2": 97, "min_rr": 25, "max_rr": 42, "min_temp_c": 37.6, "max_temp_c": 38.9, "min_hr": 115, "max_hr": 175},
        ],
        "ragdoll": [
            {"age_min": 0.0, "age_max": 2.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 38.0, "max_temp_c": 39.5, "min_hr": 120, "max_hr": 180},
            {"age_min": 0.0, "age_max": 2.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 38.0, "max_temp_c": 39.5, "min_hr": 125, "max_hr": 185},
            {"age_min": 2.0, "age_max": 11.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.8, "max_temp_c": 39.1, "min_hr": 110, "max_hr": 170},
            {"age_min": 2.0, "age_max": 11.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 15, "max_rr": 30, "min_temp_c": 37.8, "max_temp_c": 39.1, "min_hr": 115, "max_hr": 175},
            {"age_min": 11.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 18, "max_rr": 35, "min_temp_c": 37.5, "max_temp_c": 38.8, "min_hr": 100, "max_hr": 150},
            {"age_min": 11.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 18, "max_rr": 35, "min_temp_c": 37.5, "max_temp_c": 38.8, "min_hr": 105, "max_hr": 155},
        ],
        "bengal": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 22, "max_rr": 42, "min_temp_c": 38.2, "max_temp_c": 39.8, "min_hr": 130, "max_hr": 210},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 22, "max_rr": 42, "min_temp_c": 38.2, "max_temp_c": 39.8, "min_hr": 135, "max_hr": 215},
            {"age_min": 1.0, "age_max": 10.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 18, "max_rr": 35, "min_temp_c": 38.0, "max_temp_c": 39.4, "min_hr": 115, "max_hr": 190},
            {"age_min": 1.0, "age_max": 10.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 18, "max_rr": 35, "min_temp_c": 38.0, "max_temp_c": 39.4, "min_hr": 120, "max_hr": 200},
            {"age_min": 10.0, "age_max": 100.0, "gender": "male", "min_spo2": 95, "max_spo2": 99, "min_rr": 20, "max_rr": 38, "min_temp_c": 37.6, "max_temp_c": 39.0, "min_hr": 105, "max_hr": 170},
            {"age_min": 10.0, "age_max": 100.0, "gender": "female", "min_spo2": 95, "max_spo2": 99, "min_rr": 20, "max_rr": 38, "min_temp_c": 37.6, "max_temp_c": 39.0, "min_hr": 110, "max_hr": 175},
        ],
    },
    "cow": {
        "holstein": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 92, "max_spo2": 98, "min_rr": 30, "max_rr": 60, "min_temp_c": 38.5, "max_temp_c": 40.5, "min_hr": 95, "max_hr": 135},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 92, "max_spo2": 98, "min_rr": 30, "max_rr": 60, "min_temp_c": 38.5, "max_temp_c": 40.5, "min_hr": 100, "max_hr": 140},
            {"age_min": 1.0, "age_max": 8.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 30, "min_temp_c": 38.0, "max_temp_c": 39.3, "min_hr": 45, "max_hr": 80},
            {"age_min": 1.0, "age_max": 8.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 18, "max_rr": 30, "min_temp_c": 38.0, "max_temp_c": 39.3, "min_hr": 48, "max_hr": 84},
            {"age_min": 8.0, "age_max": 100.0, "gender": "male", "min_spo2": 93, "max_spo2": 97, "min_rr": 12, "max_rr": 28, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 40, "max_hr": 65},
            {"age_min": 8.0, "age_max": 100.0, "gender": "female", "min_spo2": 93, "max_spo2": 97, "min_rr": 15, "max_rr": 28, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 42, "max_hr": 70},
        ],
        "angus": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 92, "max_spo2": 98, "min_rr": 25, "max_rr": 55, "min_temp_c": 38.5, "max_temp_c": 40.0, "min_hr": 90, "max_hr": 130},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 92, "max_spo2": 98, "min_rr": 25, "max_rr": 55, "min_temp_c": 38.5, "max_temp_c": 40.0, "min_hr": 95, "max_hr": 135},
            {"age_min": 1.0, "age_max": 8.0, "gender": "male", "min_spo2": 94, "max_spo2": 98, "min_rr": 10, "max_rr": 25, "min_temp_c": 38.0, "max_temp_c": 39.0, "min_hr": 40, "max_hr": 70},
            {"age_min": 1.0, "age_max": 8.0, "gender": "female", "min_spo2": 94, "max_spo2": 98, "min_rr": 12, "max_rr": 28, "min_temp_c": 38.0, "max_temp_c": 39.0, "min_hr": 45, "max_hr": 75},
            {"age_min": 8.0, "age_max": 100.0, "gender": "male", "min_spo2": 93, "max_spo2": 97, "min_rr": 10, "max_rr": 24, "min_temp_c": 37.8, "max_temp_c": 38.8, "min_hr": 38, "max_hr": 60},
            {"age_min": 8.0, "age_max": 100.0, "gender": "female", "min_spo2": 93, "max_spo2": 97, "min_rr": 10, "max_rr": 24, "min_temp_c": 37.8, "max_temp_c": 38.8, "min_hr": 40, "max_hr": 65},
        ],
        "jersey": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 92, "max_spo2": 98, "min_rr": 28, "max_rr": 58, "min_temp_c": 38.5, "max_temp_c": 40.2, "min_hr": 95, "max_hr": 135},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 92, "max_spo2": 98, "min_rr": 28, "max_rr": 58, "min_temp_c": 38.5, "max_temp_c": 40.2, "min_hr": 100, "max_hr": 140},
            {"age_min": 1.0, "age_max": 7.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 12, "max_rr": 30, "min_temp_c": 38.2, "max_temp_c": 39.5, "min_hr": 55, "max_hr": 85},
            {"age_min": 1.0, "age_max": 7.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 35, "min_temp_c": 38.2, "max_temp_c": 39.5, "min_hr": 60, "max_hr": 90},
            {"age_min": 7.0, "age_max": 100.0, "gender": "male", "min_spo2": 93, "max_spo2": 97, "min_rr": 10, "max_rr": 28, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 45, "max_hr": 70},
            {"age_min": 7.0, "age_max": 100.0, "gender": "female", "min_spo2": 93, "max_spo2": 97, "min_rr": 12, "max_rr": 28, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 50, "max_hr": 75},
        ],
        "hereford": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 92, "max_spo2": 98, "min_rr": 25, "max_rr": 50, "min_temp_c": 38.5, "max_temp_c": 40.0, "min_hr": 90, "max_hr": 125},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 92, "max_spo2": 98, "min_rr": 25, "max_rr": 50, "min_temp_c": 38.5, "max_temp_c": 40.0, "min_hr": 95, "max_hr": 130},
            {"age_min": 1.0, "age_max": 8.0, "gender": "male", "min_spo2": 94, "max_spo2": 98, "min_rr": 12, "max_rr": 28, "min_temp_c": 38.0, "max_temp_c": 39.1, "min_hr": 42, "max_hr": 72},
            {"age_min": 1.0, "age_max": 8.0, "gender": "female", "min_spo2": 94, "max_spo2": 98, "min_rr": 14, "max_rr": 30, "min_temp_c": 38.0, "max_temp_c": 39.1, "min_hr": 45, "max_hr": 75},
            {"age_min": 8.0, "age_max": 100.0, "gender": "male", "min_spo2": 93, "max_spo2": 97, "min_rr": 12, "max_rr": 28, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 40, "max_hr": 65},
            {"age_min": 8.0, "age_max": 100.0, "gender": "female", "min_spo2": 93, "max_spo2": 97, "min_rr": 12, "max_rr": 28, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 42, "max_hr": 68},
        ],
        "brahman": [
            {"age_min": 0.0, "age_max": 1.0, "gender": "male", "min_spo2": 92, "max_spo2": 98, "min_rr": 20, "max_rr": 45, "min_temp_c": 38.5, "max_temp_c": 40.2, "min_hr": 85, "max_hr": 120},
            {"age_min": 0.0, "age_max": 1.0, "gender": "female", "min_spo2": 92, "max_spo2": 98, "min_rr": 20, "max_rr": 45, "min_temp_c": 38.5, "max_temp_c": 40.2, "min_hr": 90, "max_hr": 125},
            {"age_min": 1.0, "age_max": 10.0, "gender": "male", "min_spo2": 95, "max_spo2": 99, "min_rr": 10, "max_rr": 28, "min_temp_c": 38.0, "max_temp_c": 39.3, "min_hr": 45, "max_hr": 75},
            {"age_min": 1.0, "age_max": 10.0, "gender": "female", "min_spo2": 95, "max_spo2": 99, "min_rr": 12, "max_rr": 30, "min_temp_c": 38.0, "max_temp_c": 39.3, "min_hr": 50, "max_hr": 80},
            {"age_min": 10.0, "age_max": 100.0, "gender": "male", "min_spo2": 93, "max_spo2": 98, "min_rr": 10, "max_rr": 25, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 40, "max_hr": 65},
            {"age_min": 10.0, "age_max": 100.0, "gender": "female", "min_spo2": 93, "max_spo2": 98, "min_rr": 10, "max_rr": 25, "min_temp_c": 37.8, "max_temp_c": 38.9, "min_hr": 42, "max_hr": 70},
        ],
    },
    "horse": {
        "thoroughbred": [
            {"age_min": 0.0, "age_max": 2.0, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 37.5, "max_temp_c": 38.9, "min_hr": 60, "max_hr": 100},
            {"age_min": 0.0, "age_max": 2.0, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 37.5, "max_temp_c": 38.9, "min_hr": 65, "max_hr": 105},
            {"age_min": 2.0, "age_max": 15.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 8, "max_rr": 16, "min_temp_c": 37.2, "max_temp_c": 38.3, "min_hr": 30, "max_hr": 45},
            {"age_min": 2.0, "age_max": 15.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 8, "max_rr": 16, "min_temp_c": 37.2, "max_temp_c": 38.3, "min_hr": 32, "max_hr": 48},
            {"age_min": 15.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 10, "max_rr": 18, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 30, "max_hr": 45},
            {"age_min": 15.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 10, "max_rr": 18, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 32, "max_hr": 45},
        ],
        "arabian": [
            {"age_min": 0.0, "age_max": 2.0, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 37.5, "max_temp_c": 38.9, "min_hr": 60, "max_hr": 100},
            {"age_min": 0.0, "age_max": 2.0, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 20, "max_rr": 40, "min_temp_c": 37.5, "max_temp_c": 38.9, "min_hr": 65, "max_hr": 105},
            {"age_min": 2.0, "age_max": 15.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 8, "max_rr": 15, "min_temp_c": 37.2, "max_temp_c": 38.3, "min_hr": 28, "max_hr": 42},
            {"age_min": 2.0, "age_max": 15.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 8, "max_rr": 15, "min_temp_c": 37.2, "max_temp_c": 38.3, "min_hr": 30, "max_hr": 45},
            {"age_min": 15.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 10, "max_rr": 18, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 28, "max_hr": 40},
            {"age_min": 15.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 10, "max_rr": 18, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 30, "max_hr": 42},
        ],
        "quarter horse": [
            {"age_min": 0.0, "age_max": 2.0, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 18, "max_rr": 38, "min_temp_c": 37.5, "max_temp_c": 38.9, "min_hr": 55, "max_hr": 95},
            {"age_min": 0.0, "age_max": 2.0, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 18, "max_rr": 38, "min_temp_c": 37.5, "max_temp_c": 38.9, "min_hr": 60, "max_hr": 100},
            {"age_min": 2.0, "age_max": 16.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 10, "max_rr": 18, "min_temp_c": 37.2, "max_temp_c": 38.3, "min_hr": 28, "max_hr": 42},
            {"age_min": 2.0, "age_max": 16.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 10, "max_rr": 18, "min_temp_c": 37.2, "max_temp_c": 38.3, "min_hr": 30, "max_hr": 45},
            {"age_min": 16.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 12, "max_rr": 20, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 26, "max_hr": 40},
            {"age_min": 16.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 12, "max_rr": 20, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 28, "max_hr": 42},
        ],
        "clydesdale": [
            {"age_min": 0.0, "age_max": 2.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 35, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 50, "max_hr": 85},
            {"age_min": 0.0, "age_max": 2.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 15, "max_rr": 35, "min_temp_c": 37.2, "max_temp_c": 38.8, "min_hr": 55, "max_hr": 90},
            {"age_min": 2.0, "age_max": 14.0, "gender": "male", "min_spo2": 94, "max_spo2": 98, "min_rr": 8, "max_rr": 18, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 25, "max_hr": 38},
            {"age_min": 2.0, "age_max": 14.0, "gender": "female", "min_spo2": 94, "max_spo2": 98, "min_rr": 10, "max_rr": 20, "min_temp_c": 37.0, "max_temp_c": 38.1, "min_hr": 25, "max_hr": 40},
            {"age_min": 14.0, "age_max": 100.0, "gender": "male", "min_spo2": 93, "max_spo2": 97, "min_rr": 10, "max_rr": 22, "min_temp_c": 36.8, "max_temp_c": 37.9, "min_hr": 24, "max_hr": 36},
            {"age_min": 14.0, "age_max": 100.0, "gender": "female", "min_spo2": 93, "max_spo2": 97, "min_rr": 10, "max_rr": 22, "min_temp_c": 36.8, "max_temp_c": 37.9, "min_hr": 24, "max_hr": 38},
        ],
        "shetland pony": [
            {"age_min": 0.0, "age_max": 2.0, "gender": "male", "min_spo2": 95, "max_spo2": 100, "min_rr": 22, "max_rr": 45, "min_temp_c": 37.5, "max_temp_c": 39.0, "min_hr": 65, "max_hr": 110},
            {"age_min": 0.0, "age_max": 2.0, "gender": "female", "min_spo2": 95, "max_spo2": 100, "min_rr": 22, "max_rr": 45, "min_temp_c": 37.5, "max_temp_c": 39.0, "min_hr": 70, "max_hr": 115},
            {"age_min": 2.0, "age_max": 20.0, "gender": "male", "min_spo2": 96, "max_spo2": 100, "min_rr": 12, "max_rr": 25, "min_temp_c": 37.2, "max_temp_c": 38.5, "min_hr": 35, "max_hr": 55},
            {"age_min": 20.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 14, "max_rr": 28, "min_temp_c": 37.0, "max_temp_c": 38.3, "min_hr": 35, "max_hr": 52},
            {"age_min": 2.0, "age_max": 20.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 12, "max_rr": 25, "min_temp_c": 37.2, "max_temp_c": 38.5, "min_hr": 38, "max_hr": 58},
            {"age_min": 20.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 14, "max_rr": 28, "min_temp_c": 37.0, "max_temp_c": 38.3, "min_hr": 32, "max_hr": 50},
        ],
    }
};

// ─── 2. LOOKUP FUNCTION ──────────────────────────────────────────────────────
function getLimits(species, breed, ageYears, gender = null) {
    species = species.toLowerCase().trim();
    breed = breed.toLowerCase().trim();
    if (gender) gender = gender.toLowerCase().trim();

    const breedTable = vital_limits[species];
    if (!breedTable) return null;

    // Direct match
    let rules = breedTable[breed];

    // Fuzzy match fallback (e.g. "labrador" -> "labrador retriever")
    if (!rules) {
        const fuzzyKey = Object.keys(breedTable).find(k => k.includes(breed) || breed.includes(k));
        if (fuzzyKey) rules = breedTable[fuzzyKey];
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

// ─── 3. ML ENGINEERED MONITOR ────────────────────────────────────────────────
// ─── 3. ML ENGINEERED MONITOR ────────────────────────────────────────────────
class MLEngineeredMonitor {
    constructor(alpha = 0.4, persistenceThreshold = 5, windowSize = 20) {
        this.alpha = alpha;                           // EWMA smoothing factor
        this.windowSize = windowSize;                 // The "Strategic" window size
        this.persistenceThreshold = persistenceThreshold;
        this.ewmaVitals = {};
        this.severityHistory = [];                    // Rolling window of composite severities
    }

    applyEwma(rawVitals) {
        if (Object.keys(this.ewmaVitals).length === 0) {
            this.ewmaVitals = { ...rawVitals };
        } else {
            for (const key of ['hr', 'rr', 'temp_c', 'spo2']) {
                // EWMA: current_estimate = (alpha * current_value) + ((1 - alpha) * previous_estimate)
                this.ewmaVitals[key] = (this.alpha * rawVitals[key]) + ((1 - this.alpha) * this.ewmaVitals[key]);
            }
        }
        return this.ewmaVitals;
    }

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
     * MLE Intelligence: Calculate severity score (0 to 1) for a vital
     * 0: Normal, 0.5: Alert, 1.0: Critical Anomaly
     */
    calculateVitalSeverity(val, min, max, type) {
        if (isNaN(val)) return 0;
        if (val >= min && val <= max) return 0;

        // Calculate relative deviation
        const delta = val < min ? (min - val) : (val - max);
        
        // Severity Logic (Rule-based anomaly weights)
        if (type === 'temp_c') {
            if (delta > 2.0) return 1.0; // Rapid hypothermia/fever is CRITICAL
            if (delta > 0.3) return 0.5;
        }
        if (type === 'spo2') {
            if (val < 88) return 1.0;    // Danger zone
            if (val < 94) return 0.5;
        }
        if (type === 'hr') {
            const range = max - min;
            if (delta > range * 0.8) return 1.0; // 80% over/under range deviation
            if (delta > range * 0.2) return 0.5;
        }
        if (type === 'rr') {
            if (delta > 15) return 1.0;
            if (delta > 5) return 0.5;
        }

        return 0.3; // Slight outlier
    }

    processTelemetry(profile, rawVitals, activity = 'low', ambientTemp = 22.0) {
        const smoothed = this.applyEwma(rawVitals);
        const baseLimits = getLimits(
            profile.species,
            profile.breed,
            profile.age_years,
            profile.gender || null
        );

        if (!baseLimits) {
            return { status: 'HEALTHY', detail: 'Baseline not calibrated — monitoring trend only', smoothed };
        }

        const limits = this.adjustLimits(baseLimits, activity, ambientTemp);

        // Calculate severity for each vital
        const severities = {
            temp: this.calculateVitalSeverity(smoothed.temp_c, limits.min_temp_c, limits.max_temp_c, 'temp_c'),
            hr: this.calculateVitalSeverity(smoothed.hr, limits.min_hr, limits.max_hr, 'hr'),
            spo2: this.calculateVitalSeverity(smoothed.spo2, limits.min_spo2, limits.max_spo2, 'spo2'),
            rr: this.calculateVitalSeverity(smoothed.rr, limits.min_rr, limits.max_rr, 'rr')
        };

        // 🧬 MULTIVARIATE CORRELATION (Strategic scoring)
        let compositeSeverity = 0;
        const maxSingleSeverity = Math.max(...Object.values(severities));
        
        // Weighted composite score (ML Research approach)
        compositeSeverity = (severities.temp * 0.4) + (severities.hr * 0.3) + (severities.spo2 * 0.2) + (severities.rr * 0.1);
        
        // Pattern Recognition: Correlated jumps
        if (severities.temp >= 0.5 && severities.rr >= 0.5) compositeSeverity *= 1.25; 
        if (severities.hr >= 0.5 && severities.spo2 >= 0.5) compositeSeverity *= 1.5;

        // Update 20-log history window
        this.severityHistory.push(compositeSeverity);
        if (this.severityHistory.length > this.windowSize) this.severityHistory.shift();

        const avgSeverity = this.severityHistory.reduce((a, b) => a + b, 0) / this.severityHistory.length;
        
        // 🚨 TIER 2: STRATEGIC DETERMINATION (Header Status)
        if (maxSingleSeverity >= 1.0 || (avgSeverity >= 0.5 && this.severityHistory.length >= 3)) {
            return { status: 'CRITICAL', detail: 'Critical Physiological Distress', smoothed, aiErrorScore: avgSeverity };
        }

        if (avgSeverity >= 0.20) {
            return { status: 'ALERT', detail: 'Persistent Abnormal Vitals', smoothed, aiErrorScore: avgSeverity };
        }

        return { status: 'HEALTHY', detail: 'General Stability Detected', smoothed, aiErrorScore: avgSeverity };
    }
}


// ─── HELPER: calculate age in years from DOB ─────────────────────────────────
function calculateAgeYears(dob) {
    if (!dob) return 0;
    const birthDate = new Date(dob);
    const now = new Date();
    const diffMs = now - birthDate;
    return diffMs / (365.25 * 24 * 60 * 60 * 1000);
}

// ─── HELPER: Map UI activity level (1-5 scale) to "low"/"high" ──────────────
function mapActivityLevel(level) {
    const num = parseFloat(level) || 3;
    return num >= 4 ? 'high' : 'low';
}

module.exports = {
    vital_limits,
    getLimits,
    MLEngineeredMonitor,
    calculateAgeYears,
    mapActivityLevel
};
