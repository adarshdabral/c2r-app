const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/rewardController');

const router = express.Router();

// The whole router is already behind requireFeature('rewards') (server.js).

// Any authenticated account can check whether the programme is live.
router.get('/status', protect, ctrl.statusHandler);

// Leaderboard is visible to any authenticated account.
router.get('/leaderboard', protect, ctrl.leaderboardHandler);

/* ------- Admin (declared before the role='user' balance routes) ------- */
router.get('/admin/rules', protect, requireRole('admin'), ctrl.adminListRules);
router.patch('/admin/rules/:eventType', protect, requireRole('admin'), ctrl.adminUpdateRule);
router.post('/admin/grant', protect, requireRole('admin'), ctrl.adminGrant);
router.post('/admin/deduct', protect, requireRole('admin'), ctrl.adminDeduct);
router.get('/admin/analytics', protect, requireRole('admin'), ctrl.adminAnalytics);
router.get('/admin/export', protect, requireRole('admin'), ctrl.adminExport);

/* ------- Citizen (role='user') balance / earning surface ------- */
router.get('/me', protect, requireRole('user'), ctrl.myRewardsHandler);
router.get('/me/history', protect, requireRole('user'), ctrl.myHistoryHandler);
router.get('/me/badges', protect, requireRole('user'), ctrl.myBadgesHandler);
router.get('/me/redemptions', protect, requireRole('user'), ctrl.myRedemptionsHandler);
router.get('/catalog', protect, requireRole('user'), ctrl.catalogHandler);
router.post('/redeem', protect, requireRole('user'), ctrl.redeemHandler);

module.exports = router;
