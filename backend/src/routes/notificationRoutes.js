const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getNotificationsLog } = require('../controllers/notificationController');

router.get('/', protect, getNotificationsLog);

module.exports = router;
