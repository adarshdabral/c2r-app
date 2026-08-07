const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { upload, list, remove } = require('../controllers/requestImageController');

const router = express.Router();

// Polymorphic over pickup/dropoff: /api/images/pickup/:id, /api/images/dropoff/:id
router.get('/:type/:id', protect, list);
router.post('/:type/:id', protect, upload);
router.delete('/:type/:id/:imageId', protect, remove);

module.exports = router;
