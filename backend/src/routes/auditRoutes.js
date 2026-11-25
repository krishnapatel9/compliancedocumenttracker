const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getAuditLogs } = require('../controllers/auditController');

// Read-only by design: there is no route (and, at the database level, no permission) to change history.
router.get('/', protect, getAuditLogs);

module.exports = router;
