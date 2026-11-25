const express = require('express');
const router = express.Router();
const { protect, cronSecret } = require('../middleware/authMiddleware');
const { checkExpiries } = require('../services/cronService');
const { actorFrom, SYSTEM_ACTOR } = require('../services/audit');

// 200 when every warning was sent or already sent, 502 when the mail server or any send failed.
const run = (resolveActor) => async (req, res) => {
    const results = await checkExpiries(resolveActor(req));
    return res.status(results.success ? 200 : 502).json(results);
};

// Manual run by a logged-in admin
router.post('/trigger', protect, run(actorFrom));

// Run by an external scheduler (e.g. cron-job.org) using the x-cron-secret header
router.post('/run', cronSecret, run(() => ({ ...SYSTEM_ACTOR, actorEmail: 'system (external scheduler)' })));

module.exports = router;
