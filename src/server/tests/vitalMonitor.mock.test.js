const { getMonitor } = require('../utils/vitalMonitor');

describe('🐶 AranyaAI - Activity-Aware Behavioral Mock Test', () => {
    
    const profile = { 
        species: 'dog', 
        breed: 'golden retriever', 
        age_years: 3, 
        gender: 'male' 
    };

    /**
     * SCENARIO A: THE "PLAYTIME" FALSE POSITIVE
     * High Heart Rate (145) but High Activity Level (running).
     */
    test('Behavioral Check: High HR during exercise should NOT trigger CRITICAL', () => {
        const monitor = getMonitor('dog_playtime_mock');
        
        // Raw vitals indicate high exertion (HR 145, RR 35)
        const exerciseVitals = { 
            hr: 145, 
            rr: 35, 
            temp_c: 39.2, 
            spo2: 97 
        };

        // System receives "high" activity signal
        const result = monitor.processTelemetry(profile, exerciseVitals, 'high', 25.0);

        // EXPECTATION: The system adjusts limits for exercise and stays HEALTHY/ALERT
        // because the high vitals are explained by the activity.
        expect(result.status).not.toBe('CRITICAL');
        expect(result.detail).toContain('Stability');
    });

    /**
     * SCENARIO B: THE "QUIET DISTRESS" (REAL EMERGENCY)
     * High Heart Rate (145) but LOW Activity Level (resting).
     */
    test('Behavioral Check: High HR during REST should trigger CRITICAL', () => {
        const monitor = getMonitor('dog_distress_mock');
        
        const distressVitals = { 
            hr: 145, 
            rr: 35, 
            temp_c: 39.2, 
            spo2: 97 
        };

        // System receives "low" activity signal (the dog is supposed to be resting)
        const result = monitor.processTelemetry(profile, distressVitals, 'low', 22.0);

        // EXPECTATION: This is a critical failure. Vitals are too high for a resting state.
        expect(result.status).toBe('CRITICAL');
        expect(result.detail).toContain('Distress');
    });

    /**
     * SCENARIO C: HEAT STRESS ADJUSTMENT
     */
    test('Environmental Check: System should tolerate higher RR in hot weather', () => {
        const monitor = getMonitor('heat_stress_mock');
        
        // High RR 32 is abnormal at 22°C, but normal at 35°C
        const pantingVitals = { 
            hr: 90, 
            rr: 32, 
            temp_c: 38.8, 
            spo2: 98 
        };

        const result = monitor.processTelemetry(profile, pantingVitals, 'low', 35.0);

        // EXPECTATION: System sees high ambient temp (35C) and adjusts RR limits.
        expect(result.status).toBe('HEALTHY');
    });
});
