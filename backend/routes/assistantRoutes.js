const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/assistantController');

const router = express.Router();

// Rate limit the assistant to curb abuse of the action-execution surface.
// Skipped in dev/test so local runs and the suite aren't throttled.
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => ['development', 'test'].includes(process.env.NODE_ENV),
  message: { message: 'Too many requests — please slow down.' },
});

router.use(protect);
router.use(assistantLimiter);

router.get('/suggestions', ctrl.suggestions);
router.get('/history', ctrl.history);
router.post('/query', ctrl.query);
router.post('/execute', ctrl.execute);

module.exports = router;
