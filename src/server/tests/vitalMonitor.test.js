const { getLimits } = require('../utils/vitalMonitor/getLimits');
const { MLEngineeredMonitor } = require('../utils/vitalMonitor/MLEngineeredMonitor');
const helpers = require('../utils/vitalMonitor/helpers');

describe('getLimits', () => {
    test('returns correct row for exact breed + age + gender', () => {
        const limits = getLimits('dog', 'labrador retriever', 5, 'male');
        expect(limits).not.toBeNull();
        expect(limits.min_hr).toBe(60);
        expect(limits.max_hr).toBe(100);
    });

    test('resolves alias e.g. "labrador" → "labrador retriever"', () => {
        const limits = getLimits('dog', 'labrador', 5, 'male');
        expect(limits).not.toBeNull();
        expect(limits.min_hr).toBe(60);
    });

    test('returns null for unknown species', () => {
        const limits = getLimits('alien', 'unknown', 1, 'male');
        expect(limits).toBeNull();
    });

    test('returns correct limits for shetland pony female age 25', () => {
        // From Task 3 Fix 1: Female age 20-100 shetland pony
        const limits = getLimits('horse', 'shetland pony', 25, 'female');
        expect(limits).not.toBeNull();
        expect(limits.age_min).toBe(20.0);
        expect(limits.age_max).toBe(100.0);
        expect(limits.min_hr).toBe(35);
        expect(limits.max_hr).toBe(52); // As defined in horse.limits.js
    });
});

describe('MLEngineeredMonitor', () => {
    test('applyEwma() smooths correctly over 3 calls', () => {
        const monitor = new MLEngineeredMonitor(0.4);
        
        // Initial reading (alpha=0.4)
        // first: vitals = raw
        // second: ewma = 0.4*raw2 + 0.6*raw1
        // third: ewma = 0.4*raw3 + 0.6*ewma2
        
        const raw1 = { hr: 100, rr: 20, temp_c: 38.0, spo2: 98 };
        const raw2 = { hr: 110, rr: 22, temp_c: 38.2, spo2: 97 };
        const raw3 = { hr: 120, rr: 24, temp_c: 38.4, spo2: 96 };

        let smoothed = monitor.applyEwma(raw1);
        expect(smoothed.hr).toBe(100);

        smoothed = monitor.applyEwma(raw2);
        // 0.4 * 110 + 0.6 * 100 = 44 + 60 = 104
        expect(smoothed.hr).toBeCloseTo(104);

        smoothed = monitor.applyEwma(raw3);
        // 0.4 * 120 + 0.6 * 104 = 48 + 62.4 = 110.4
        expect(smoothed.hr).toBeCloseTo(110.4);
    });

    test('processTelemetry() returns HEALTHY for normal vitals', () => {
        const monitor = new MLEngineeredMonitor();
        const profile = { species: 'dog', breed: 'labrador retriever', age_years: 5, gender: 'male' };
        const rawVitals = { hr: 80, rr: 15, temp_c: 38.0, spo2: 98 };
        const result = monitor.processTelemetry(profile, rawVitals);
        
        expect(result.status).toBe('HEALTHY');
        expect(result.detail).toContain('General Stability');
    });

    test('processTelemetry() returns CRITICAL when spo2 < 88', () => {
        const monitor = new MLEngineeredMonitor();
        const profile = { species: 'dog', breed: 'labrador retriever', age_years: 5, gender: 'male' };
        const rawVitals = { hr: 80, rr: 15, temp_c: 38.0, spo2: 85 }; // Critical SPo2
        const result = monitor.processTelemetry(profile, rawVitals);
        
        expect(result.status).toBe('CRITICAL');
        expect(result.detail).toContain('Distress');
    });

    test('processTelemetry() returns ALERT for persistent mild anomaly over 5 consecutive readings', () => {
        // persistenceThreshold defaults to 5
        const monitor = new MLEngineeredMonitor(0.6, 5); 
        const profile = { species: 'dog', breed: 'labrador retriever', age_years: 5, gender: 'male' };
        // Normal range for dog/labrador/5y/male: HR 60-100, Temp 37.5-39.0
        // HR 125 delta = 25 (range 40). delta > range*0.2 (8) so severity 0.5.
        // Temp 39.4 delta = 0.4. delta > 0.3 so severity 0.5.
        // Composite = 0.5*0.4 + 0.5*0.3 = 0.35 (> 0.20 threshold for ALERT)
        const mildAnomaly = { hr: 125, rr: 15, temp_c: 39.4, spo2: 98 };

        // Process 4 readings - should be ALERT (avgSeverity >= 0.2)
        for(let i=0; i<4; i++) {
            monitor.processTelemetry(profile, mildAnomaly);
        }
        let result = monitor.processTelemetry(profile, mildAnomaly); 
        expect(result.status).toBe('ALERT'); 
        
        // Let's provide even higher HR to push avgSeverity > 0.5
        // HR 135 delta = 35 (range 40). delta > range*0.8 (32) so severity 1.0. 
        // Temp 40.0 delta = 1.0. severity 0.5.
        // Composite = 0.5*0.4 + 1.0*0.3 = 0.2 + 0.3 = 0.5 (CRITICAL threshold)
        const higherAnomaly = { hr: 135, rr: 15, temp_c: 40.0, spo2: 98 };
        for(let i=0; i<5; i++) {
            result = monitor.processTelemetry(profile, higherAnomaly);
        }
        // with 5+ readings and avgSeverity >= 0.5, it should be CRITICAL
        expect(result.status).toBe('CRITICAL');
    });

    test('processTelemetry() returns status "Baseline not calibrated" for unknown breed', () => {
        const monitor = new MLEngineeredMonitor();
        const profile = { species: 'dog', breed: 'super-dog', age_years: 5, gender: 'male' };
        const rawVitals = { hr: 80, rr: 15, temp_c: 38.0, spo2: 98 };
        const result = monitor.processTelemetry(profile, rawVitals);
        
        expect(result.detail).toContain('Baseline not calibrated');
    });
});
