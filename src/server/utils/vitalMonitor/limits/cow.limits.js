/**
 * Vital limits for cows by breed, age, and gender
 */
module.exports = {
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
};
