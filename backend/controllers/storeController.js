const {
  createStore,
  findStoreById,
  listStoresByRecycler,
  getNearestStores,
  updateStore,
  updateStoreCapacity,
  deleteStoreById,
  remainingCapacity,
  hasCapacity,
  getStoreDailyLoads,
  isWithinThreshold,
  WASTE_TYPES
} = require('../models/storeModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parsePagination, parseSearch, buildMeta, setPaginationHeaders } = require('../utils/query');

// Projects a store row to the discovery "card" contract.
const toStoreCard = (s) => ({
  id: s.id,
  recyclerId: s.recyclerId,
  storeName: s.storeName,
  name: s.storeName, // alias kept for generic list/map consumers
  distanceKm: Number(Number(s.distance).toFixed(2)),
  distance: Number(Number(s.distance).toFixed(2)), // back-compat alias for existing UI
  address: s.address,
  latitude: s.latitude,
  longitude: s.longitude,
  acceptedWasteTypes: s.acceptedWasteTypes,
  pickupAvailability: s.pickupAvailability,
  operatingHours: s.operatingHours,
  rating: s.rating,
  remainingCapacityKg: remainingCapacity(s),
  hasCapacity: hasCapacity(s)
});

const parseId = (raw, label = 'id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`Valid ${label} is required`);
  }
  return id;
};

// Great-circle distance (km) for a single store. Mirrors the SQL Haversine used
// by discovery; clamps the sqrt arg to guard asin's domain.
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

// Loads a store and asserts the authenticated recycler owns it (admins bypass).
const loadOwnedStore = async (storeId, user) => {
  const store = await findStoreById(storeId);
  if (!store) throw ApiError.notFound('Store not found');
  if (user.role !== 'admin' && store.recyclerId !== user.id) {
    throw ApiError.forbidden('You do not own this store');
  }
  return store;
};

/* ================= NEAREST STORES (map / search) ================= */
// Public store discovery. Returns Active + Verified stores only, nearest first,
// as an array of store cards. Filters: ?wasteType= ?radiusKm= ?pickupAvailable=.
// Paginated via ?page= / ?limit=; meta is exposed in X-* response headers so the
// body stays a plain array (back-compat with map/list consumers).
const getNearestHandler = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw ApiError.badRequest('Valid lat and lng query params are required');
  }

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20 });

  // Filter: waste type (must be a known enum value).
  let wasteType = null;
  if (req.query.wasteType) {
    if (!WASTE_TYPES.includes(req.query.wasteType)) {
      throw ApiError.badRequest(`wasteType must be one of: ${WASTE_TYPES.join(', ')}`);
    }
    wasteType = req.query.wasteType;
  }

  // Filter: distance radius (km).
  let radiusKm = null;
  if (req.query.radiusKm !== undefined && req.query.radiusKm !== '') {
    const r = Number(req.query.radiusKm);
    if (!Number.isFinite(r) || r <= 0) {
      throw ApiError.badRequest('radiusKm must be a positive number');
    }
    radiusKm = r;
  }

  // Filter: pickup availability (?pickupAvailable=true).
  const pickupAvailable = ['true', '1', 'yes'].includes(
    String(req.query.pickupAvailable).toLowerCase()
  );

  // Filter: free-text search (?search= store name / city / state / address).
  const search = parseSearch(req.query);

  const { rows, total } = await getNearestStores(lat, lng, {
    limit,
    offset,
    wasteType,
    radiusKm,
    pickupAvailable,
    search
  });

  // Annotate each card with today's load + threshold eligibility (used by the
  // drop-off flow, which only lists eligible stores). ?eligibleOnly=true drops
  // stores that have reached their daily threshold.
  const eligibleOnly = ['true', '1', 'yes'].includes(String(req.query.eligibleOnly).toLowerCase());
  const loads = await getStoreDailyLoads(rows.map((s) => s.id));
  let cards = rows.map((s) => {
    const todayLoadKg = loads[s.id] || 0;
    return { ...toStoreCard(s), todayLoadKg, dailyThresholdKg: s.dailyThresholdKg, eligible: isWithinThreshold(s, todayLoadKg) };
  });
  if (eligibleOnly) cards = cards.filter((c) => c.eligible);

  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(cards);
});

/* ================= MY STORES (recycler) ================= */
const getMyStoresHandler = asyncHandler(async (req, res) => {
  const stores = await listStoresByRecycler(req.user.id);
  return res.status(200).json(stores);
});

/* ================= GET ONE (store details) ================= */
// Public. Returns the full store record plus computed remaining capacity, and an
// optional distanceKm when ?lat=&lng= are supplied. Inactive/unverified stores
// are still returned (with their flags) so the client can render the matching
// "inactive"/"unverified" state — only a missing store is a 404.
const getStoreHandler = asyncHandler(async (req, res) => {
  const store = await findStoreById(parseId(req.params.id, 'store id'));
  if (!store) throw ApiError.notFound('Store not found');

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const distanceKm =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? Number(haversineKm(lat, lng, store.latitude, store.longitude).toFixed(2))
      : null;

  return res.status(200).json({
    ...store,
    distanceKm,
    remainingCapacityKg: remainingCapacity(store),
    hasCapacity: hasCapacity(store)
  });
});

/* ================= CREATE (recycler) ================= */
const createStoreHandler = asyncHandler(async (req, res) => {
  // recyclerId always comes from the auth context — never trust the body.
  const id = await createStore({ ...req.body, recyclerId: req.user.id });
  return res.status(201).json({ id, message: 'Store created successfully' });
});

/* ================= UPDATE (owner) ================= */
const updateStoreHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  await loadOwnedStore(storeId, req.user);

  // Ownership/verification/rating are not self-editable through this route.
  const { recyclerId, verificationStatus, rating, totalReviews, ...editable } = req.body;
  const affected = await updateStore(storeId, editable);
  if (!affected) throw ApiError.badRequest('No changes applied');
  return res.status(200).json({ message: 'Store updated successfully' });
});

/* ================= UPDATE CAPACITY (owner) ================= */
const updateCapacityHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  await loadOwnedStore(storeId, req.user);

  const { currentCapacityKg } = req.body;
  if (currentCapacityKg === undefined) {
    throw ApiError.badRequest('currentCapacityKg is required');
  }

  await updateStoreCapacity(storeId, currentCapacityKg);
  const store = await findStoreById(storeId);
  return res.status(200).json({
    message: 'Capacity updated successfully',
    currentCapacityKg: store.currentCapacityKg,
    remainingCapacityKg: remainingCapacity(store),
    hasCapacity: hasCapacity(store)
  });
});

/* ================= DELETE (owner) ================= */
const deleteStoreHandler = asyncHandler(async (req, res) => {
  const storeId = parseId(req.params.id, 'store id');
  await loadOwnedStore(storeId, req.user);
  await deleteStoreById(storeId);
  return res.status(200).json({ message: 'Store deleted successfully' });
});

module.exports = {
  getNearest: getNearestHandler,
  getMyStores: getMyStoresHandler,
  getStore: getStoreHandler,
  createStore: createStoreHandler,
  updateStore: updateStoreHandler,
  updateCapacity: updateCapacityHandler,
  deleteStore: deleteStoreHandler
};
