const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// @route   GET /api/climate/pulse
// @desc    Get current weather pulse and AI tips for the herd
router.get('/pulse', auth, (req, res) => {
    // Current climate pulse logic (mocked but with realistic dynamicism)
    const cities = ['Kolkata', 'Ahmedabad', 'New Delhi', 'Mumbai', 'Bangalore'];
    const randomCity = cities[Math.floor(Math.random() * cities.length)];
    
    // Simulate real-time weather sensing
    const temp = 28 + Math.floor(Math.random() * 12); // 28-40C
    const humidity = 40 + Math.floor(Math.random() * 50); // 40-90%
    const conditions = temp > 35 ? 'heatwave' : (humidity > 80 ? 'rainy' : 'clear');

    const climateTips = {
        heatwave: [
            "Heatwave detected: Increase water supply for the Cow herd by 20% to prevent dehydration.",
            "Schedule indoor cooling sessions for high-risk animals.",
            "Reduce feed intake slightly to lower metabolic heat production."
        ],
        rainy: [
            "Heavy rain expected: Ensure all shelters are leak-proof.",
            "Watch for hoof rot in high-humidity areas.",
            "Move sensitive feed to elevated, dry storage."
        ],
        clear: [
            "Ideal conditions: Current climate is optimal for herd output.",
            "Excellent day for outdoor pasture grazing.",
            "Maintain standard vitals monitoring intervals."
        ]
    };

    res.json({
        city: randomCity,
        temperature: temp,
        humidity: humidity,
        condition: conditions,
        tip: climateTips[conditions][Math.floor(Math.random() * climateTips[conditions].length)],
        lastUpdated: new Date().toISOString()
    });
});

module.exports = router;
