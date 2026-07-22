const express = require('express');

const { raiseDispute, myDisputes, getDispute } = require('../controllers/disputeController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Users and recyclers raise/view their own disputes; admins triage via /api/admin.
router.post('/', requireRole('user', 'recycler'), raiseDispute);
router.get('/mine', requireRole('user', 'recycler'), myDisputes);
router.get('/:id', getDispute);

module.exports = router;
