const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/assistantController');

const router = express.Router();

router.use(protect);

router.get('/suggestions', ctrl.suggestions);
router.post('/query', ctrl.query);

module.exports = router;
