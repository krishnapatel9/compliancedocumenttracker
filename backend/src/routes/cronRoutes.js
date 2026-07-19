const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { checkExpiries } = require('../services/cronService');

router.post('/trigger', protect, async (req, res) => {
    try {
        console.log('[TRIGGER API] Manual compliance check triggered by administrator...');
        const results = await checkExpiries();
        return res.status(200).json(results);
    } catch (err) {
        return res.status(500).json({ error: 'Manual scan trigger run failed', details: err.message });
    }
});

module.exports = router;
