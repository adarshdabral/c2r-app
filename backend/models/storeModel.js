const db = require('../config/db');
const ApiError = require('../utils/ApiError');

/* ============================== ENUMS ============================== */
// Kept in sync with the SET/ENUM column definitions in server.js createTables().

const WASTE_TYPES = [
  'Waste Batteries',
  'PCB Scrap',
  'Mobile Phone Scrap',
  'Laptop Scrap',
  'Computer Scrap',
  'Hard Drive Scrap',
  'IT Equipment Scrap',
  'Telecom Equipment Scrap',
  'Display Panel Scrap'
];

const STORE_STATUSES = ['Active', 'Inactive'];
const VERIFICATION_STATUSES = ['Pending', 'Verified', 'Rejected'];

/* ============================== DEFAULTS ============================== */
// Applied on create when a field is omitted. Mirrors the column DEFAULTs so the
// object returned to callers matches what the database actually stores.

const STORE_DEFAULTS = {
  description: null,
  contactNumber: null,
  email: null,
  city: null,
  state: null,
  pincode: null,
  operatingHours: null,
  pickupAvailability: true,
  acceptedWasteTypes: [],
  dailyCapacityKg: 0,
  currentCapacityKg: 0,
  status: 'Active',
  verificationStatus: 'Pending',
  rating: 0,
  totalReviews: 0,
  // Admin-controlled daily intake limit (kg). NULL = no limit (always eligible).
  dailyThresholdKg: null
};

/* ============================== ROW MAPPING ============================== */
// snake_case DB row -> camelCase store object. The accepted_waste_types SET is
// returned by mysql2 as a comma-joined string ('' when empty); normalise it to
// an array. Numeric/boolean columns come back as strings/0|1, so cast them.

const mapStoreRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    recyclerId: row.recycler_id,
    storeName: row.store_name,
    description: row.description,
    contactNumber: row.contact_number,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    operatingHours: row.operating_hours,
    pickupAvailability: Boolean(row.pickup_availability),
    acceptedWasteTypes: row.accepted_waste_types
      ? row.accepted_waste_types.split(',')
      : [],
    dailyCapacityKg: Number(row.daily_capacity_kg),
    currentCapacityKg: Number(row.current_capacity_kg),
    status: row.status,
    verificationStatus: row.verification_status,
    rating: Number(row.rating),
    totalReviews: row.total_reviews,
    // Admin daily threshold (kg); NULL means unlimited.
    dailyThresholdKg:
      row.daily_threshold_kg === null || row.daily_threshold_kg === undefined
        ? null
        : Number(row.daily_threshold_kg),
    // distance is only present on geo queries (Haversine alias)
    ...(row.distance !== undefined ? { distance: Number(row.distance) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/* ============================== VALIDATION ============================== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PINCODE_RE = /^\d{4,10}$/;

const isFiniteNum = (v) => Number.isFinite(Number(v));

// Validates a store payload. `partial: true` (used for updates) only checks the
// fields that are present; create validation enforces the required ones too.
const validateStorePayload = (input = {}, { partial = false } = {}) => {
  const has = (key) => input[key] !== undefined && input[key] !== null;

  // --- required on create ---
  if (!partial) {
    if (!isFiniteNum(input.recyclerId) || Number(input.recyclerId) <= 0) {
      throw ApiError.badRequest('recyclerId is required and must be a positive number');
    }
    if (!input.storeName || String(input.storeName).trim().length < 2) {
      throw ApiError.badRequest('storeName is required and must be at least 2 characters');
    }
    if (!input.address || String(input.address).trim().length < 3) {
      throw ApiError.badRequest('address is required and must be at least 3 characters');
    }
    if (!isFiniteNum(input.latitude) || !isFiniteNum(input.longitude)) {
      throw ApiError.badRequest('latitude and longitude are required and must be valid numbers');
    }
  }

  // --- coordinate ranges ---
  if (has('latitude')) {
    const lat = Number(input.latitude);
    if (!isFiniteNum(lat) || lat < -90 || lat > 90) {
      throw ApiError.badRequest('latitude must be between -90 and 90');
    }
  }
  if (has('longitude')) {
    const lng = Number(input.longitude);
    if (!isFiniteNum(lng) || lng < -180 || lng > 180) {
      throw ApiError.badRequest('longitude must be between -180 and 180');
    }
  }

  // --- string field bounds ---
  if (has('storeName') && String(input.storeName).trim().length > 150) {
    throw ApiError.badRequest('storeName must be at most 150 characters');
  }
  if (has('email') && !EMAIL_RE.test(String(input.email).trim())) {
    throw ApiError.badRequest('email must be a valid email address');
  }
  if (has('contactNumber') && !/^[+\d][\d\s-]{5,19}$/.test(String(input.contactNumber).trim())) {
    throw ApiError.badRequest('contactNumber must be a valid phone number');
  }
  if (has('pincode') && !PINCODE_RE.test(String(input.pincode).trim())) {
    throw ApiError.badRequest('pincode must be 4 to 10 digits');
  }

  // --- enums ---
  if (has('acceptedWasteTypes')) {
    if (!Array.isArray(input.acceptedWasteTypes)) {
      throw ApiError.badRequest('acceptedWasteTypes must be an array');
    }
    const invalid = input.acceptedWasteTypes.filter((t) => !WASTE_TYPES.includes(t));
    if (invalid.length) {
      throw ApiError.badRequest(`Invalid acceptedWasteTypes: ${invalid.join(', ')}`);
    }
  }
  if (has('status') && !STORE_STATUSES.includes(input.status)) {
    throw ApiError.badRequest(`status must be one of: ${STORE_STATUSES.join(', ')}`);
  }
  if (has('verificationStatus') && !VERIFICATION_STATUSES.includes(input.verificationStatus)) {
    throw ApiError.badRequest(`verificationStatus must be one of: ${VERIFICATION_STATUSES.join(', ')}`);
  }

  // --- capacity ---
  if (has('dailyCapacityKg') && (!isFiniteNum(input.dailyCapacityKg) || Number(input.dailyCapacityKg) < 0)) {
    throw ApiError.badRequest('dailyCapacityKg must be a non-negative number');
  }
  if (has('currentCapacityKg') && (!isFiniteNum(input.currentCapacityKg) || Number(input.currentCapacityKg) < 0)) {
    throw ApiError.badRequest('currentCapacityKg must be a non-negative number');
  }

  // --- rating ---
  if (has('rating') && (!isFiniteNum(input.rating) || Number(input.rating) < 0 || Number(input.rating) > 5)) {
    throw ApiError.badRequest('rating must be between 0 and 5');
  }
  if (has('totalReviews') && (!Number.isInteger(Number(input.totalReviews)) || Number(input.totalReviews) < 0)) {
    throw ApiError.badRequest('totalReviews must be a non-negative integer');
  }
};

/* ============================== HELPER METHODS ============================== */
// Pure helpers that operate on a mapped store object (camelCase). Exported so
// controllers/services can reason about capacity without re-querying.

// How much more waste (kg) the store can still take in today.
const remainingCapacity = (store) => {
  const daily = Number(store.dailyCapacityKg) || 0;
  const current = Number(store.currentCapacityKg) || 0;
  return Math.max(0, daily - current);
};

// Whether the store is Active and can absorb `amountKg` more (defaults to "any").
const hasCapacity = (store, amountKg = 0) => {
  if (store.status !== 'Active') return false;
  const required = Number(amountKg) || 0;
  return remainingCapacity(store) >= required;
};

// Single source of truth for "can this store take a booking (of requestedKg)?".
// Returns a structured verdict so callers can surface a specific, user-friendly
// error. Order matters: existence -> active -> verified -> pickup -> capacity.
// Reuse this everywhere a booking is gated (discovery, details, create).
const canAcceptBooking = (store, requestedKg = 0) => {
  if (!store) {
    return { ok: false, status: 404, code: 'STORE_NOT_FOUND', message: 'Store not found' };
  }
  if (store.status !== 'Active') {
    return { ok: false, status: 409, code: 'STORE_INACTIVE', message: 'This store is currently inactive' };
  }
  if (store.verificationStatus !== 'Verified') {
    return { ok: false, status: 409, code: 'STORE_UNVERIFIED', message: 'This store is pending verification' };
  }
  if (!store.pickupAvailability) {
    return { ok: false, status: 409, code: 'PICKUP_UNAVAILABLE', message: 'This store is not accepting pickups right now' };
  }
  const remaining = remainingCapacity(store);
  const required = Number(requestedKg) || 0;
  if (required > remaining) {
    return {
      ok: false,
      status: 409,
      code: 'CAPACITY_FULL',
      message: `Store capacity full — only ${remaining} kg remaining today`
    };
  }
  return { ok: true, status: 200, code: 'OK', message: 'OK', remaining };
};

/* ============================== DATA ACCESS ============================== */

const SELECT_COLUMNS = `
  id, recycler_id, store_name, description, contact_number, email, address,
  city, state, pincode, latitude, longitude, operating_hours, pickup_availability,
  accepted_waste_types, daily_capacity_kg, current_capacity_kg, status,
  verification_status, rating, total_reviews, daily_threshold_kg, created_at, updated_at
`;

const createStore = async (input) => {
  validateStorePayload(input, { partial: false });
  const s = { ...STORE_DEFAULTS, ...input };

  const [result] = await db.execute(
    `INSERT INTO stores
      (recycler_id, store_name, description, contact_number, email, address,
       city, state, pincode, latitude, longitude, operating_hours,
       pickup_availability, accepted_waste_types, daily_capacity_kg,
       current_capacity_kg, status, verification_status, rating, total_reviews)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(s.recyclerId),
      String(s.storeName).trim(),
      s.description,
      s.contactNumber,
      s.email,
      String(s.address).trim(),
      s.city,
      s.state,
      s.pincode,
      Number(s.latitude),
      Number(s.longitude),
      s.operatingHours,
      s.pickupAvailability ? 1 : 0,
      s.acceptedWasteTypes.join(','),
      Number(s.dailyCapacityKg),
      Number(s.currentCapacityKg),
      s.status,
      s.verificationStatus,
      Number(s.rating),
      Number(s.totalReviews)
    ]
  );
  return result.insertId;
};

const findStoreById = async (id) => {
  const [rows] = await db.execute(
    `SELECT ${SELECT_COLUMNS} FROM stores WHERE id = ? LIMIT 1`,
    [id]
  );
  return mapStoreRow(rows[0]);
};

// Link Recycler -> Stores: every store a recycler owns.
const listStoresByRecycler = async (recyclerId) => {
  const [rows] = await db.execute(
    `SELECT ${SELECT_COLUMNS} FROM stores WHERE recycler_id = ? ORDER BY created_at DESC`,
    [recyclerId]
  );
  return rows.map(mapStoreRow);
};

// Earth radius (km) for the Haversine great-circle distance.
const EARTH_RADIUS_KM = 6371;
// Approx. km per degree of latitude — used to size the bounding-box prefilter.
const KM_PER_DEG_LAT = 111.045;

// Great-circle distance expression. LEAST(1, …) clamps the cosine sum so float
// rounding can't push ACOS out of its [-1, 1] domain (which yields NaN). Binds
// lat, lng, lat in that order — preserve it (see CLAUDE.md).
const DISTANCE_EXPR = `(${EARTH_RADIUS_KM} * ACOS(LEAST(1,
  COS(RADIANS(?)) * COS(RADIANS(latitude)) *
  COS(RADIANS(longitude) - RADIANS(?)) +
  SIN(RADIANS(?)) * SIN(RADIANS(latitude))
)))`;

/**
 * Nearby store discovery (replaces userModel.getNearestRecyclers). Returns only
 * Active + Verified stores, nearest first, with optional filtering + pagination.
 *
 * @param {number} lat, lng  search origin
 * @param {object} opts
 *   - limit, offset        pagination (offset derived from page upstream)
 *   - wasteType            require this type in accepted_waste_types (SET)
 *   - radiusKm             only stores within this many km (exact, circular)
 *   - pickupAvailable      only stores currently offering pickup
 * @returns {{ rows: Store[], total: number }}
 *
 * Single round-trip per page — accepted_waste_types travels in the row (a SET
 * column), so there is no N+1. When radiusKm is set, a lat/lng bounding box is
 * added to WHERE so MySQL can range-scan idx_stores_active_geo / idx_stores_geo
 * instead of distance-scanning every row.
 */
const getNearestStores = async (lat, lng, opts = {}) => {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    throw ApiError.badRequest('Invalid coordinates');
  }

  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 20;
  const offset = Number.isInteger(opts.offset) && opts.offset > 0 ? opts.offset : 0;
  const wasteType = opts.wasteType || null;
  // Multi-category matching: the store must accept EVERY listed type.
  const wasteTypes = Array.isArray(opts.wasteTypes) ? opts.wasteTypes.filter(Boolean) : [];
  const pickupAvailable = Boolean(opts.pickupAvailable);
  const search = opts.search ? String(opts.search).trim() : null;
  const radiusKm = Number(opts.radiusKm);
  const hasRadius = Number.isFinite(radiusKm) && radiusKm > 0;

  // Exclude inactive AND unverified stores from discovery.
  const where = ["status = 'Active'", "verification_status = 'Verified'"];
  const whereValues = [];

  if (pickupAvailable) where.push('pickup_availability = 1');
  if (wasteType) {
    where.push('FIND_IN_SET(?, accepted_waste_types) > 0');
    whereValues.push(wasteType);
  }
  // Require the store to accept ALL requested categories (one condition each).
  for (const t of wasteTypes) {
    where.push('FIND_IN_SET(?, accepted_waste_types) > 0');
    whereValues.push(t);
  }
  // Free-text search across name + location columns (by name / by location text).
  if (search) {
    where.push('(store_name LIKE ? OR city LIKE ? OR state LIKE ? OR address LIKE ? OR pincode LIKE ?)');
    const like = `%${search}%`;
    whereValues.push(like, like, like, like, like);
  }
  if (hasRadius) {
    const latDelta = radiusKm / KM_PER_DEG_LAT;
    const cosLat = Math.cos((parsedLat * Math.PI) / 180);
    const lngDelta = radiusKm / (KM_PER_DEG_LAT * (Math.abs(cosLat) < 1e-6 ? 1e-6 : Math.abs(cosLat)));
    where.push('latitude BETWEEN ? AND ?');
    whereValues.push(parsedLat - latDelta, parsedLat + latDelta);
    where.push('longitude BETWEEN ? AND ?');
    whereValues.push(parsedLng - lngDelta, parsedLng + lngDelta);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const havingSql = hasRadius ? 'HAVING distance <= ?' : '';
  const geoBinds = [parsedLat, parsedLng, parsedLat];

  // Page of rows: geo binds (SELECT) -> where binds -> radius (HAVING) -> page.
  const rowValues = [
    ...geoBinds,
    ...whereValues,
    ...(hasRadius ? [radiusKm] : []),
    limit,
    offset
  ];
  const [rows] = await db.query(
    `SELECT ${SELECT_COLUMNS}, ${DISTANCE_EXPR} AS distance
     FROM stores
     ${whereSql}
     ${havingSql}
     ORDER BY distance ASC
     LIMIT ? OFFSET ?`,
    rowValues
  );

  // Total. Without a radius the count needs no distance, so it stays a cheap
  // indexed COUNT. With a radius the HAVING references distance, so wrap it.
  let total;
  if (hasRadius) {
    const [[{ total: t }]] = await db.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT id, ${DISTANCE_EXPR} AS distance
         FROM stores
         ${whereSql}
         HAVING distance <= ?
       ) t`,
      [...geoBinds, ...whereValues, radiusKm]
    );
    total = t;
  } else {
    const [[{ total: t }]] = await db.query(
      `SELECT COUNT(*) AS total FROM stores ${whereSql}`,
      whereValues
    );
    total = t;
  }

  return { rows: rows.map(mapStoreRow), total };
};

// Set a store's current intake (kg). Validated and clamped to >= 0 by the
// caller; returns affectedRows. updated_at bumps automatically via the column.
const updateStoreCapacity = async (id, currentCapacityKg) => {
  const value = Number(currentCapacityKg);
  if (!Number.isFinite(value) || value < 0) {
    throw ApiError.badRequest('currentCapacityKg must be a non-negative number');
  }
  const [result] = await db.execute(
    'UPDATE stores SET current_capacity_kg = ? WHERE id = ?',
    [value, id]
  );
  return result.affectedRows;
};

// Free up reserved capacity (e.g. when a pending booking is cancelled). Clamped
// at 0 so concurrent releases can never drive current capacity negative.
const releaseCapacity = async (id, amountKg) => {
  const value = Number(amountKg) || 0;
  if (value <= 0) return 0;
  const [result] = await db.execute(
    'UPDATE stores SET current_capacity_kg = GREATEST(0, current_capacity_kg - ?) WHERE id = ?',
    [value, id]
  );
  return result.affectedRows;
};

// Maps camelCase update fields to their columns. Only listed keys are writable.
const UPDATABLE_COLUMNS = {
  storeName: 'store_name',
  description: 'description',
  contactNumber: 'contact_number',
  email: 'email',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  latitude: 'latitude',
  longitude: 'longitude',
  operatingHours: 'operating_hours',
  pickupAvailability: 'pickup_availability',
  acceptedWasteTypes: 'accepted_waste_types',
  dailyCapacityKg: 'daily_capacity_kg',
  currentCapacityKg: 'current_capacity_kg',
  status: 'status',
  verificationStatus: 'verification_status',
  rating: 'rating',
  totalReviews: 'total_reviews'
};

const updateStore = async (id, input = {}) => {
  validateStorePayload(input, { partial: true });

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (input[key] === undefined) continue;
    let value = input[key];
    if (key === 'acceptedWasteTypes') value = (value || []).join(',');
    else if (key === 'pickupAvailability') value = value ? 1 : 0;
    else if (typeof value === 'string') value = value.trim();
    sets.push(`${column} = ?`);
    values.push(value);
  }

  if (!sets.length) throw ApiError.badRequest('No updatable fields provided');

  values.push(id);
  const [result] = await db.execute(
    `UPDATE stores SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows;
};

const deleteStoreById = async (id) => {
  const [result] = await db.execute('DELETE FROM stores WHERE id = ?', [id]);
  return result.affectedRows;
};

/* ============================== ADMIN ============================== */

const STORE_ADMIN_SORT = {
  created_at: 'created_at',
  store_name: 'store_name',
  rating: 'rating',
  total_reviews: 'total_reviews'
};

// Admin: every store, with optional status / verification / text filters. Unlike
// getNearestStores this is not geo-scoped and includes inactive + unverified
// stores (the whole point of moderation). Returns { rows, total }.
const listAllStores = async ({
  status,
  verificationStatus,
  search,
  sortColumn = 'created_at',
  sortOrder = 'DESC',
  limit = 20,
  offset = 0
} = {}) => {
  const where = [];
  const values = [];
  if (status && STORE_STATUSES.includes(status)) {
    where.push('s.status = ?');
    values.push(status);
  }
  if (verificationStatus && VERIFICATION_STATUSES.includes(verificationStatus)) {
    where.push('s.verification_status = ?');
    values.push(verificationStatus);
  }
  if (search) {
    where.push('(s.store_name LIKE ? OR s.city LIKE ? OR s.address LIKE ? OR u.name LIKE ?)');
    const like = `%${search}%`;
    values.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = STORE_ADMIN_SORT[sortColumn] || STORE_ADMIN_SORT.created_at;
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM stores s JOIN users u ON u.id = s.recycler_id ${whereSql}`,
    values
  );
  const [rows] = await db.query(
    `SELECT s.*, u.name AS recycler_name, u.email AS recycler_email
     FROM stores s JOIN users u ON u.id = s.recycler_id
     ${whereSql}
     ORDER BY s.${orderBy} ${order}
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return {
    rows: rows.map((r) => ({ ...mapStoreRow(r), recyclerName: r.recycler_name, recyclerEmail: r.recycler_email })),
    total
  };
};

// Admin: set a store's verification status (Verify / Reject / reset to Pending).
const setStoreVerification = async (id, verificationStatus) => {
  if (!VERIFICATION_STATUSES.includes(verificationStatus)) {
    throw ApiError.badRequest(`verificationStatus must be one of: ${VERIFICATION_STATUSES.join(', ')}`);
  }
  const [result] = await db.execute(
    'UPDATE stores SET verification_status = ? WHERE id = ?',
    [verificationStatus, id]
  );
  return result.affectedRows;
};

// Admin: suspend (Inactive) / reinstate (Active) a store.
const setStoreStatus = async (id, status) => {
  if (!STORE_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${STORE_STATUSES.join(', ')}`);
  }
  const [result] = await db.execute('UPDATE stores SET status = ? WHERE id = ?', [status, id]);
  return result.affectedRows;
};

/* ============================== DAILY LOAD + THRESHOLD ============================== */

const normalizeThreshold = (v) => {
  if (v === null || v === undefined || v === '') return null; // null = no limit
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest('threshold must be a non-negative number (or null for no limit)');
  }
  return n;
};

/**
 * Today's assigned waste quantity (kg) per store, summed across BOTH pipelines:
 *   - pickups routed to the store today (an active candidate — NOTIFIED/ACCEPTED)
 *   - drop-offs targeting the store today (not cancelled)
 * Counting active pickup candidates (not just accepted) means a store's load
 * rises the moment a request is routed to it, so the weighted assigner spreads
 * subsequent requests instead of repeatedly piling onto the same store.
 *
 * @param {number[]} storeIds
 * @returns {Promise<Record<number, number>>} storeId -> kg (0 for any with none)
 */
const getStoreDailyLoads = async (storeIds = []) => {
  const ids = [...new Set(storeIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const loads = {};
  ids.forEach((id) => { loads[id] = 0; });
  if (!ids.length) return loads;

  const ph = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT store_id, SUM(qty) AS load_kg FROM (
       SELECT c.store_id AS store_id, pr.waste_quantity AS qty
         FROM pickup_request_candidates c
         JOIN pickup_requests pr ON pr.id = c.request_id
        WHERE c.store_id IN (${ph})
          AND c.status IN ('NOTIFIED', 'ACCEPTED')
          AND pr.status NOT IN ('CANCELLED', 'EXPIRED')
          AND DATE(pr.created_at) = CURDATE()
       UNION ALL
       SELECT store_id AS store_id, waste_quantity AS qty
         FROM dropoff_requests
        WHERE store_id IN (${ph})
          AND status <> 'CANCELLED'
          AND DATE(created_at) = CURDATE()
     ) t
     GROUP BY store_id`,
    [...ids, ...ids]
  );
  for (const r of rows) loads[r.store_id] = Number(r.load_kg) || 0;
  return loads;
};

const getStoreDailyLoad = async (storeId) => {
  const loads = await getStoreDailyLoads([storeId]);
  return loads[Number(storeId)] || 0;
};

// A store is eligible if it has no threshold, or today's load is still below it.
const isWithinThreshold = (store, dailyLoad) => {
  const threshold = store.dailyThresholdKg;
  if (threshold === null || threshold === undefined) return true;
  return Number(dailyLoad) < Number(threshold);
};

// Admin bulk action: apply one threshold to every store.
const setDailyThresholdForAll = async (thresholdKg) => {
  const value = normalizeThreshold(thresholdKg);
  const [result] = await db.execute('UPDATE stores SET daily_threshold_kg = ?', [value]);
  return result.affectedRows;
};

// Admin manual override: per-store threshold.
const setDailyThreshold = async (id, thresholdKg) => {
  const value = normalizeThreshold(thresholdKg);
  const [result] = await db.execute('UPDATE stores SET daily_threshold_kg = ? WHERE id = ?', [value, id]);
  return result.affectedRows;
};

/**
 * Admin alert feed: stores at or above `ratio` (default 80%) of their daily
 * threshold today. Only stores WITH a threshold can alert.
 */
const getThresholdAlerts = async (ratio = 0.8) => {
  const [stores] = await db.query(
    `SELECT id, store_name, daily_threshold_kg FROM stores WHERE daily_threshold_kg IS NOT NULL`
  );
  if (!stores.length) return [];
  const loads = await getStoreDailyLoads(stores.map((s) => s.id));
  return stores
    .map((s) => {
      const threshold = Number(s.daily_threshold_kg);
      const load = loads[s.id] || 0;
      return {
        storeId: s.id,
        storeName: s.store_name,
        thresholdKg: threshold,
        todayLoadKg: load,
        usagePct: threshold > 0 ? Math.round((load / threshold) * 100) : 0,
        breached: load >= threshold
      };
    })
    .filter((a) => a.thresholdKg > 0 && a.todayLoadKg >= a.thresholdKg * ratio)
    .sort((a, b) => b.usagePct - a.usagePct);
};

module.exports = {
  // enums
  WASTE_TYPES,
  STORE_STATUSES,
  VERIFICATION_STATUSES,
  STORE_DEFAULTS,
  // helpers
  remainingCapacity,
  hasCapacity,
  canAcceptBooking,
  // validation + mapping (exported for reuse/testing)
  validateStorePayload,
  mapStoreRow,
  STORE_SELECT_COLUMNS: SELECT_COLUMNS,
  // data access
  createStore,
  findStoreById,
  listStoresByRecycler,
  getNearestStores,
  updateStore,
  updateStoreCapacity,
  releaseCapacity,
  deleteStoreById,
  // admin
  listAllStores,
  setStoreVerification,
  setStoreStatus,
  // daily load + threshold (Waste Collection Service Flow)
  getStoreDailyLoads,
  getStoreDailyLoad,
  isWithinThreshold,
  setDailyThresholdForAll,
  setDailyThreshold,
  getThresholdAlerts
};
