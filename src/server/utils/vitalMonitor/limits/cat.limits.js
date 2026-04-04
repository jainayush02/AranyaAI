/**
 * Vital limits for cats by breed, age, and gender
 */
module.exports = {
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
};
