const {
  createReview,
  updateReview,
  deleteReview,
  findReviewById,
  findReviewByUserAndStore,
  listReviewsByStore
} = require('../models/reviewModel');
const { findStoreById } = require('../models/storeModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta, setPaginationHeaders } = require('../utils/query');

const parseId = (raw, label = 'id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`Valid ${label} is required`);
  }
  return id;
};

// Loads a review and asserts the authenticated user owns it, and that it belongs
// to the store named in the URL. 404 (not 403) when not owned so we never leak
// the existence of other users' reviews.
const loadOwnReview = async (reviewId, storeId, userId) => {
  const review = await findReviewById(reviewId);
  if (!review || review.storeId !== storeId || review.userId !== userId) {
    throw ApiError.notFound('Review not found');
  }
  return review;
};

/* ================= LIST REVIEWS (public) ================= */
// Returns a store's reviews with the aggregate summary. The body carries the
// average rating + total review count (kept in sync with the stores row) plus a
// page of recent reviews; full pagination meta is exposed in X-* headers.
const getStoreReviewsHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  const store = await findStoreById(storeId);
  if (!store) throw ApiError.notFound('Store not found');

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 10 });
  const { rows, total } = await listReviewsByStore(storeId, { limit, offset });

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json({
    averageRating: store.rating,
    totalReviews: store.totalReviews,
    reviews: rows
  });
});

/* ================= MY REVIEW (user) ================= */
// The authenticated user's own review for this store, or null. Drives the
// add-vs-edit decision on the client without exposing other users' reviews.
const getMyReviewHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  const review = await findReviewByUserAndStore(storeId, req.user.id);
  return res.status(200).json({ review: review || null });
});

/* ================= ADD REVIEW (user) ================= */
const addReviewHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  const store = await findStoreById(storeId);
  if (!store) throw ApiError.notFound('Store not found');

  const { rating, comment } = req.body;
  const id = await createReview({
    storeId,
    userId: req.user.id,
    rating,
    comment: comment === undefined ? null : comment
  });

  return res.status(201).json({ id, message: 'Review added successfully' });
});

/* ================= EDIT OWN REVIEW (user) ================= */
const editReviewHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  const reviewId = parseId(req.params.reviewId, 'review id');
  await loadOwnReview(reviewId, storeId, req.user.id);

  // Only the rating/comment are editable; ownership and target store are fixed.
  const { rating, comment } = req.body;
  const patch = {};
  if (rating !== undefined) patch.rating = rating;
  if (comment !== undefined) patch.comment = comment;

  await updateReview(reviewId, storeId, patch);
  return res.status(200).json({ message: 'Review updated successfully' });
});

/* ================= DELETE OWN REVIEW (user) ================= */
const deleteReviewHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  const reviewId = parseId(req.params.reviewId, 'review id');
  await loadOwnReview(reviewId, storeId, req.user.id);

  await deleteReview(reviewId, storeId);
  return res.status(200).json({ message: 'Review deleted successfully' });
});

module.exports = {
  getStoreReviews: getStoreReviewsHandler,
  getMyReview: getMyReviewHandler,
  addReview: addReviewHandler,
  editReview: editReviewHandler,
  deleteReview: deleteReviewHandler
};
