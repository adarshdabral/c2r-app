const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/notificationController');

const router = express.Router();

// Whole router is gated by requireFeature('notifications') in server.js.
router.use(protect);

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.post('/read-all', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);

// Admin broadcast.
router.post('/admin/broadcast', requireRole('admin'), ctrl.broadcast);

module.exports = router;
