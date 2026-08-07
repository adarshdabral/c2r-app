const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getCategories } = require('../controllers/ewasteController');

const router = express.Router();

router.get('/categories', protect, getCategories);

module.exports = router;
