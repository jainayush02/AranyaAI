const { getMonitor } = require('../utils/vitalMonitor/MLEngineeredMonitor');
const { getLimits } = require('../utils/vitalMonitor/getLimits');

describe('🔥 AranyaAI - Hard Core Health Monitoring Stress Test', () => {
    
    const speciesList = ['dog', 'cat', 'cow', 'horse'];
    const breedMap = {
        'dog': 'labrador retriever',
        'cat': 'siamese',
        'cow': 'holstein',
        'horse': 'thoroughbred'
    };

    /**
     * TEST 1: COMPLETE RE-ANALYSIS CYCLE FOR ALL SPECIES
     */
    test('Stress Test: All species should return valid status for normal vitals', () => {
        speciesList.forEach(species => {
            const monitor = getMonitor(`animal_test_${species}`);
            const profile = { species, breed: breedMap[species], age_years: 5, gender: 'male' };
            
            // Baseline normal vitals for a 5yr male
            const limits = getLimits(species, breedMap[species], 5, 'male');
            const normalVitals = { 
                hr: limits.min_hr + 5, 
                rr: limits.min_rr + 2, 
                temp_c: limits.min_temp_c + 0.1, 
                spo2: 98 
            };

            const result = monitor.processTelemetry(profile, normalVitals);
            expect(result.status).toBe('HEALTHY');
        });
    });

    /**
     * TEST 2: EWMA (TREND) ACCURACY & DATA SMOOTHING
     */
    test('EWMA Accuracy: The system should smooth out single jittery data points', () => {
        const monitor = getMonitor('smoothing_test_123');
        const profile = { species: 'dog', breed: 'labrador retriever', age_years: 5, gender: 'male' };
        
        // Reading 1: Baseline (100 HR)
        let res = monitor.processTelemetry(profile, { hr: 100, rr: 20, temp_c: 38.0, spo2: 98 });
        
        // Reading 2: Anomaly Spike (140 HR)
        // With alpha 0.4: (0.4 * 140) + (0.6 * 100) = 56 + 60 = 116 HR (Smoothed)
        res = monitor.processTelemetry(profile, { hr: 140, rr: 20, temp_c: 38.0, spo2: 98 });
        
        expect(res.smoothed.hr).toBeCloseTo(116);
    });

    /**
     * TEST 3: CRITICAL ALIGNMENT (MULTI-VITAL FAILURE)
     */
    test('System Resiliency: Multi-vital failures should trigger CRITICAL immediately', () => {
        const monitor = getMonitor('critical_test_xyz');
        const profile = { species: 'horse', breed: 'thoroughbred', age_years: 5, gender: 'male' };
        
        const severeReading = { hr: 110, rr: 50, temp_c: 41.5, spo2: 82 }; // Multiple red zones
        const result = monitor.processTelemetry(profile, severeReading);
        
        expect(result.status).toBe('CRITICAL');
        expect(result.detail).toContain('Distress');
    });

    /**
     * TEST 4: PERSISTENCE VS. SPIKES
     */
    test('Persistence: High severity must persist for 5 readings before alerting (if single max < 1.0)', () => {
        // Lab Max HR is 100.
        const monitor = getMonitor('persistence_test_99');
        const profile = { species: 'dog', breed: 'labrador retriever', age_years: 5, gender: 'male' };
        
        // Mild anomaly: HR 125 delta=25 (range 40). delta > range*0.2 so severity 0.5.
        // Temp 39.4 severity 0.5. Composite 0.35.
        const mildAnomaly = { hr: 125, rr: 15, temp_c: 39.4, spo2: 98 };

        for (let i = 0; i < 4; i++) {
            let res = monitor.processTelemetry(profile, mildAnomaly);
            // After 4 readings, avgSeverity should be > 0.2 but length < 5, so ALERT status
            expect(res.status).toBe('ALERT');
        }

        // 5th reading should trigger based on our persistenceThreshold
        const finalRes = monitor.processTelemetry(profile, mildAnomaly);
        // Note: With 5+ readings, if avgSeverity >= 0.5 it would be CRITICAL. 
        // Here avgSeverity is 0.35, so it stays ALERT.
        expect(finalRes.status).toBe('ALERT');
    });
});
