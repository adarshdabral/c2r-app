const express = require('express');

const {
  create,
  myRequests,
  incoming,
  getOne,
  cancel,
  approve,
  reject,
  checkIn,
  collect,
  startVerification,
  verifyUserOtp,
  verifyRecyclerOtp,
  otpHistory
} = require('../controllers/dropOffRequestController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Everything here requires authentication.
router.use(protect);

/* ----------------------- USER ----------------------- */
router.post('/', requireRole('user'), create);
router.get('/mine', requireRole('user'), myRequests);

/* ----------------------- RECYCLER ----------------------- */
// Literal `/store/incoming` is declared before the `/:id` param route.
router.get('/store/incoming', requireRole('recycler'), incoming);
router.post('/:id/approve', requireRole('recycler'), approve);
router.post('/:id/reject', requireRole('recycler'), reject);
router.post('/:id/check-in', requireRole('recycler'), checkIn);
router.post('/:id/collect', requireRole('recycler'), collect);
router.post('/:id/start-verification', requireRole('recycler'), startVerification);
// Mutual OTP: recycler submits the user's code; user submits the recycler's code.
router.post('/:id/verify-user-otp', requireRole('recycler'), verifyUserOtp);
router.post('/:id/verify-recycler-otp', requireRole('user'), verifyRecyclerOtp);

/* ----------------------- SHARED ----------------------- */
// Access control inside the handler (owner / store recycler / admin).
router.get('/:id', getOne);
router.get('/:id/otp-history', otpHistory);
router.post('/:id/cancel', requireRole('user'), cancel);

module.exports = router;
