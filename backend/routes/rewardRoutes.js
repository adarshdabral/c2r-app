const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  statusHandler,
  myRewardsHandler,
  myHistoryHandler,
} = require('../controllers/rewardController');

const router = express.Router();

// Any authenticated account can check whether the feature is live.
router.get('/status', protect, statusHandler);

// Only citizens (role='user') hold a rewards balance.
router.get('/me', protect, requireRole('user'), myRewardsHandler);
router.get('/me/history', protect, requireRole('user'), myHistoryHandler);

module.exports = router;
