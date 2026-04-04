/**
 * Vital limits for horses by breed, age, and gender
 */
module.exports = {
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
        {"age_min": 2.0, "age_max": 20.0, "gender": "female", "min_spo2": 96, "max_spo2": 100, "min_rr": 12, "max_rr": 25, "min_temp_c": 37.2, "max_temp_c": 38.5, "min_hr": 38, "max_hr": 58},
        {"age_min": 20.0, "age_max": 100.0, "gender": "male", "min_spo2": 94, "max_spo2": 99, "min_rr": 14, "max_rr": 28, "min_temp_c": 37.0, "max_temp_c": 38.3, "min_hr": 32, "max_hr": 50},
        {"age_min": 20.0, "age_max": 100.0, "gender": "female", "min_spo2": 94, "max_spo2": 99, "min_rr": 14, "max_rr": 28, "min_temp_c": 37.0, "max_temp_c": 38.3, "min_hr": 35, "max_hr": 52},
    ],
};
