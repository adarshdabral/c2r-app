const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { generate, get, download, verify } = require('../controllers/certificateController');

const router = express.Router();

// Public certificate verification (QR / verification ID).
router.get('/verify/:verificationId', verify);

// Per-request certificate (pickup/dropoff). All require a session.
router.get('/:type/:id', protect, get);
router.post('/:type/:id', protect, generate);
router.get('/:type/:id/download', protect, download);

module.exports = router;
