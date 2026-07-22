const express = require('express');

const {
  createBooking,
  getAllBookings,
  getUserBookings,
  updateBookingStatus,
  getRecyclerBookings,
  deleteBooking
} = require('../controllers/bookingController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, createBooking);
router.get('/', protect, requireRole('recycler', 'admin'), getAllBookings);
router.get('/recycler', protect, requireRole('recycler'), getRecyclerBookings);
router.get('/user', protect, getUserBookings);
router.patch('/:id', protect, requireRole('recycler', 'admin'), updateBookingStatus);
router.delete('/:id', protect, deleteBooking);

module.exports = router;
