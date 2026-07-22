const express = require('express');

const {
  create,
  myRequests,
  recyclerInbox,
  getOne,
  cancel,
  accept,
  collect,
  reject,
  status,
  startVerification,
  verifyUserOtp,
  verifyRecyclerOtp,
  otpHistory
} = require('../controllers/pickupRequestController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Everything here requires authentication.
router.use(protect);

/* ----------------------- USER ----------------------- */
router.post('/', requireRole('user'), create);
router.get('/mine', requireRole('user'), myRequests);

/* ----------------------- RECYCLER ----------------------- */
// Literal `/recycler/inbox` is declared before the `/:id` param route.
router.get('/recycler/inbox', requireRole('recycler'), recyclerInbox);
router.post('/:id/accept', requireRole('recycler'), accept);
router.post('/:id/collect', requireRole('recycler'), collect);
router.post('/:id/reject', requireRole('recycler'), reject);
router.patch('/:id/status', requireRole('recycler'), status);
router.post('/:id/start-verification', requireRole('recycler'), startVerification);
// Mutual OTP: recycler submits the user's code; user submits the recycler's code.
router.post('/:id/verify-user-otp', requireRole('recycler'), verifyUserOtp);
router.post('/:id/verify-recycler-otp', requireRole('user'), verifyRecyclerOtp);

/* ----------------------- SHARED ----------------------- */
// Access control inside the handler (owner / assigned recycler / candidate / admin).
router.get('/:id', getOne);
router.get('/:id/otp-history', otpHistory);
router.post('/:id/cancel', requireRole('user'), cancel);

module.exports = router;
