const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/reportController');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.list);
router.post('/summary', ctrl.generateSummary); // before /:id
router.get('/:id', ctrl.getOne);
router.get('/:id/download', ctrl.download);

module.exports = router;
