const express = require('express');

const {
  getNearest,
  getMyStores,
  getStore,
  createStore,
  updateStore,
  updateCapacity,
  deleteStore
} = require('../controllers/storeController');
const {
  getStoreReviews,
  getMyReview,
  addReview,
  editReview,
  deleteReview
} = require('../controllers/reviewController');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Public geo search (map / nearest stores)
router.get('/nearest', getNearest);

// Recycler-owned store management. `/mine` and `/` POST are declared before
// `/:id` so the literal paths are matched ahead of the param route.
router.get('/mine', protect, requireRole('recycler', 'admin'), getMyStores);
router.post('/', protect, requireRole('recycler'), createStore);

router.get('/:id', getStore);
router.put('/:id', protect, requireRole('recycler', 'admin'), updateStore);
router.patch('/:id/capacity', protect, requireRole('recycler', 'admin'), updateCapacity);
router.delete('/:id', protect, requireRole('recycler', 'admin'), deleteStore);

/* ----------------------- STORE REVIEWS ----------------------- */
// Reviews are nested under their store. Only the 'user' role can write; reading
// is public. `/mine` is declared before the `:reviewId` param routes — they use
// different verbs so there is no collision, but keeping it first reads clearly.
router.get('/:id/reviews', getStoreReviews);
router.get('/:id/reviews/mine', protect, requireRole('user'), getMyReview);
router.post('/:id/reviews', protect, requireRole('user'), addReview);
router.put('/:id/reviews/:reviewId', protect, requireRole('user'), editReview);
router.delete('/:id/reviews/:reviewId', protect, requireRole('user'), deleteReview);

module.exports = router;
