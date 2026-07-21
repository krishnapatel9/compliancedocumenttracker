const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getFrameworkControls, linkDocumentToControl } = require('../controllers/frameworkController');

router.get('/', protect, getFrameworkControls);
router.post('/link', protect, linkDocumentToControl);

module.exports = router;
