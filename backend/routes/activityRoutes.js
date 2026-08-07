const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { timeline } = require('../controllers/activityController');

const router = express.Router();

// Gated by requireFeature('activity') in server.js.
router.get('/', protect, timeline);

module.exports = router;
