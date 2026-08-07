const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { dashboard, exportCsv } = require('../controllers/analyticsController');

const router = express.Router();

// Admin-only; the whole router is gated by requireFeature('analytics') in server.js.
router.use(protect, requireRole('admin'));

router.get('/dashboard', dashboard);
router.get('/export', exportCsv);

module.exports = router;
