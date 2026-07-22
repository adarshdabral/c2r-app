const {
  createStoreBooking,
  getBookingById,
  getBookingsByUser,
  getAllBookings,
  updateBookingStatus,
  assignRecycler,
  getBookingsForRecycler,
  deleteBookingById
} = require('../models/bookingModel');
const { releaseCapacity } = require('../models/storeModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination, parseSort, parseSearch, buildMeta, setPaginationHeaders } = require('../utils/query');

const nextStatusMap = {
  pending: 'accepted',
  accepted: 'completed'
};

const BOOKING_STATUSES = ['pending', 'accepted', 'completed'];
const SORT_KEYS = { created_at: 'created_at', pickup_date: 'pickup_date', status: 'status', id: 'id' };

// Validate an optional ?status= filter against the enum.
const parseStatusFilter = (value) => {
  if (value === undefined || value === '') return undefined;
  if (!BOOKING_STATUSES.includes(value)) {
    throw ApiError.badRequest(`status must be one of: ${BOOKING_STATUSES.join(', ')}`);
  }
  return value;
};

const parseId = (raw, label = 'id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`Valid ${label} is required`);
  }
  return id;
};

/* ================= CREATE BOOKING ================= */
const createBookingHandler = asyncHandler(async (req, res) => {
  const { store_id, latitude, longitude, address, estimated_weight_kg, waste_type, pickup_date } = req.body;

  if (!store_id || latitude === undefined || longitude === undefined || !address) {
    throw ApiError.badRequest('store_id, latitude, longitude and address are required');
  }

  const storeId = parseId(store_id, 'store_id');

  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw ApiError.badRequest('latitude and longitude must be valid numbers');
  }
  if (String(address).trim().length < 3) {
    throw ApiError.badRequest('address must be at least 3 characters');
  }

  const weight = Number(estimated_weight_kg);
  if (!Number.isFinite(weight) || weight <= 0) {
    throw ApiError.badRequest('estimated_weight_kg must be a positive number');
  }

  // Optional pickup date/time; defaults to now.
  let pickupDate = new Date();
  if (pickup_date) {
    const parsed = new Date(pickup_date);
    if (Number.isNaN(parsed.getTime())) {
      throw ApiError.badRequest('pickup_date is not a valid date');
    }
    pickupDate = parsed;
  }

  // All store eligibility + capacity checks run atomically inside the model
  // transaction; a failing check throws a friendly ApiError (404/409).
  const id = await createStoreBooking({
    userId: req.user.id,
    storeId,
    estimatedWeightKg: weight,
    wasteType: waste_type || null,
    pickupDate,
    latitude: Number(latitude),
    longitude: Number(longitude),
    address: String(address).trim()
  });

  return res.status(201).json({ id, message: 'Booking created successfully' });
});

/* ================= USER BOOKINGS ================= */
const getUserBookingsHandler = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 10 });
  const { column, order } = parseSort(req.query, SORT_KEYS, 'created_at');
  const status = parseStatusFilter(req.query.status);

  const { rows, total } = await getBookingsByUser(req.user.id, {
    status,
    sortColumn: column,
    sortOrder: order,
    limit,
    offset
  });

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= ALL BOOKINGS (recycler/admin) ================= */
const getAllBookingsHandler = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { column, order } = parseSort(req.query, SORT_KEYS, 'created_at');
  const status = parseStatusFilter(req.query.status);
  const search = parseSearch(req.query);

  const { rows, total } = await getAllBookings({
    role: req.user.role,
    userId: req.user.id,
    status,
    search,
    sortColumn: column,
    sortOrder: order,
    limit,
    offset
  });

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= RECYCLER BOOKINGS ================= */
const getRecyclerBookingsHandler = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { column, order } = parseSort(req.query, SORT_KEYS, 'created_at');
  const status = parseStatusFilter(req.query.status);

  const { rows, total } = await getBookingsForRecycler(req.user.id, {
    status,
    sortColumn: column,
    sortOrder: order,
    limit,
    offset
  });

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= UPDATE STATUS ================= */
const updateBookingStatusHandler = asyncHandler(async (req, res) => {
  const bookingId = parseId(req.params.id, 'booking id');
  const { status } = req.body;

  if (!status) throw ApiError.badRequest('status is required');
  if (!BOOKING_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${BOOKING_STATUSES.join(', ')}`);
  }

  const booking = await getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');

  // A recycler must own (or atomically claim) the booking before transitioning it.
  if (req.user.role === 'recycler') {
    const assigned = await assignRecycler(bookingId, req.user.id);
    if (!assigned) {
      throw ApiError.forbidden('Booking already assigned to another recycler');
    }
  } else if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Forbidden');
  }

  const expectedNextStatus = nextStatusMap[booking.status];
  if (!expectedNextStatus || status !== expectedNextStatus) {
    throw ApiError.badRequest(`Invalid transition: ${booking.status} → ${expectedNextStatus || 'none'}`);
  }

  await updateBookingStatus(bookingId, status);
  return res.status(200).json({ message: 'Booking status updated successfully' });
});

/* ================= DELETE / CANCEL BOOKING ================= */
// Owner may cancel only while pending; admin may delete any booking.
const deleteBookingHandler = asyncHandler(async (req, res) => {
  const bookingId = parseId(req.params.id, 'booking id');

  const booking = await getBookingById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');

  const isOwner = booking.user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You cannot delete this booking');
  }
  if (isOwner && !isAdmin && booking.status !== 'pending') {
    throw ApiError.badRequest('Only pending bookings can be cancelled');
  }

  await deleteBookingById(bookingId);

  // Cancelling a booking frees the capacity it had reserved on the store.
  if (booking.store_id && Number(booking.estimated_weight_kg) > 0) {
    await releaseCapacity(booking.store_id, Number(booking.estimated_weight_kg));
  }

  return res.status(200).json({ message: 'Booking deleted successfully' });
});

module.exports = {
  createBooking: createBookingHandler,
  getUserBookings: getUserBookingsHandler,
  getAllBookings: getAllBookingsHandler,
  getRecyclerBookings: getRecyclerBookingsHandler,
  updateBookingStatus: updateBookingStatusHandler,
  deleteBooking: deleteBookingHandler
};
