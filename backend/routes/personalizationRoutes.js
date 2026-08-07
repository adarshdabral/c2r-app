const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getHome } = require('../controllers/personalizationController');

const router = express.Router();

// Mounted behind requireFeature('personalization') in server.js.
router.get('/home', protect, getHome);

module.exports = router;
