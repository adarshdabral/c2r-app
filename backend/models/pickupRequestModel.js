const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { normalizeWasteCategories } = require('../utils/wasteCategories');
const {
  WASTE_TYPES,
  getNearestStores,
  remainingCapacity,
  hasCapacity,
  getStoreDailyLoads,
  isWithinThreshold
} = require('./storeModel');
const { armVerification, logAttempt, MAX_OTP_ATTEMPTS } = require('./otpVerificationModel');

/* ============================== CONFIG ============================== */
// All tunable via env (see CLAUDE.md — no separate config service). The pickup
// flow auto-assigns the single most suitable store (ASSIGN_COUNT=1); if no one
// accepts in time, the sweeper retries the next-best store, up to MAX_ROUNDS.

const BATCH_SIZE = Number(process.env.PICKUP_BATCH_SIZE) || 5; // candidate pool to score
const ASSIGN_COUNT = Number(process.env.PICKUP_ASSIGN_COUNT) || 1; // stores assigned per round
const ACCEPTANCE_TIMEOUT_SECONDS = Number(process.env.PICKUP_TIMEOUT_SECONDS) || 120;
const MAX_ROUNDS = Number(process.env.PICKUP_MAX_ROUNDS) || 3;

// Weighted-assignment weights (must sum to 1). Proximity dominates, then current
// daily load (for fair distribution), then store rating.
// TODO: expose these as admin-tunable settings if business needs change.
const W_PROXIMITY = 0.5;
const W_LOAD = 0.3;
const W_RATING = 0.2;

/* ============================== STATUS MACHINE ============================== */

const PICKUP_STATUSES = [
  'REQUESTED', 'BROADCASTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED',
  'OTP_PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED'
];

// Statuses where a request is still awaiting (or retrying) acceptance — the only
// ones the expiry sweeper acts on.
const OPEN_STATUSES = ['REQUESTED', 'BROADCASTED'];

// Recycler-driven transitions after acceptance. Used by transitionStatus().
const RECYCLER_TRANSITIONS = {
  ACCEPTED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED'
};

/* ============================== ROW MAPPING ============================== */

const mapPickupRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    assignedRecyclerId: row.assigned_recycler_id,
    assignedStoreId: row.assigned_store_id,
    // `wasteCategory` stays the raw comma-joined string (backward compatible for
    // display); `wasteCategories` is the parsed multi-select array.
    wasteCategory: row.waste_category,
    wasteCategories: row.waste_category ? String(row.waste_category).split(',') : [],
    wasteQuantity: Number(row.waste_quantity),
    pickupAddress: row.pickup_address,
    pickupLatitude: row.pickup_latitude === null ? null : Number(row.pickup_latitude),
    pickupLongitude: row.pickup_longitude === null ? null : Number(row.pickup_longitude),
    preferredTimeSlot: row.preferred_time_slot,
    status: row.status,
    acceptanceDeadline: row.acceptance_deadline,
    // OTPs are secrets — never mapped into API-facing objects here. The per-side
    // verified flags ARE surfaced so the UI can show two-sided progress.
    ...(row.user_otp_verified !== undefined ? { userOtpVerified: Boolean(row.user_otp_verified) } : {}),
    ...(row.recycler_otp_verified !== undefined ? { recyclerOtpVerified: Boolean(row.recycler_otp_verified) } : {}),
    ...(row.actual_quantity_kg !== undefined
      ? { actualQuantityKg: row.actual_quantity_kg === null ? null : Number(row.actual_quantity_kg) }
      : {}),
    completionTimestamp: row.completion_timestamp,
    broadcastRound: row.broadcast_round,
    // Joined display fields (present only on list/detail queries).
    ...(row.user_name !== undefined ? { userName: row.user_name } : {}),
    ...(row.user_email !== undefined ? { userEmail: row.user_email } : {}),
    ...(row.recycler_name !== undefined ? { recyclerName: row.recycler_name } : {}),
    ...(row.store_name !== undefined ? { storeName: row.store_name } : {}),
    ...(row.store_address !== undefined ? { storeAddress: row.store_address } : {}),
    ...(row.store_contact !== undefined ? { storeContact: row.store_contact } : {}),
    ...(row.candidate_status !== undefined ? { candidateStatus: row.candidate_status } : {}),
    ...(row.distance_km != null ? { distanceKm: Number(row.distance_km) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/* ============================== VALIDATION ============================== */

const isFiniteNum = (v) => Number.isFinite(Number(v));

const validatePickupPayload = (input = {}) => {
  normalizeWasteCategories(input, WASTE_TYPES); // throws on empty / invalid
  if (!isFiniteNum(input.wasteQuantity) || Number(input.wasteQuantity) <= 0) {
    throw ApiError.badRequest('wasteQuantity must be a positive number');
  }
  if (!input.pickupAddress || String(input.pickupAddress).trim().length < 3) {
    throw ApiError.badRequest('pickupAddress is required and must be at least 3 characters');
  }
  const lat = Number(input.pickupLatitude);
  const lng = Number(input.pickupLongitude);
  if (!isFiniteNum(lat) || lat < -90 || lat > 90) {
    throw ApiError.badRequest('pickupLatitude must be between -90 and 90');
  }
  if (!isFiniteNum(lng) || lng < -180 || lng > 180) {
    throw ApiError.badRequest('pickupLongitude must be between -180 and 180');
  }
  if (input.preferredTimeSlot !== undefined && input.preferredTimeSlot !== null) {
    if (String(input.preferredTimeSlot).length > 64) {
      throw ApiError.badRequest('preferredTimeSlot must be at most 64 characters');
    }
  }
};

/* ============================== OPERATING HOURS ============================== */
// stores.operating_hours is a freeform VARCHAR. This parser is deliberately
// tolerant: anything it cannot confidently parse is treated as "open" so a store
// is never silently excluded from discovery on a formatting quirk. Recognises
// 24/7, "9 AM - 6 PM", "09:00-18:00", "9-18", etc. Handles overnight ranges
// (close <= open wraps past midnight).
const MINUTES_IN_DAY = 24 * 60;

const parseClockToken = (token) => {
  const m = String(token).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3] ? m[3].toLowerCase() : null;
  if (hour > 23 || min > 59) return null;
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  return hour * 60 + min;
};

const isWithinOperatingHours = (operatingHours, date = new Date()) => {
  if (!operatingHours) return true;
  const text = String(operatingHours).trim();
  if (!text) return true;
  if (/24\s*\/\s*7|24\s*hours|always|all\s*day/i.test(text)) return true;

  // Find the first two clock tokens (open, close).
  const tokens = text.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi);
  if (!tokens || tokens.length < 2) return true; // unparseable -> assume open

  const open = parseClockToken(tokens[0]);
  const close = parseClockToken(tokens[1]);
  if (open == null || close == null) return true;

  const nowMin = date.getHours() * 60 + date.getMinutes();
  if (open === close) return true; // degenerate -> treat as open all day
  if (open < close) return nowMin >= open && nowMin < close;
  // Overnight window (e.g. 22:00 - 06:00).
  return nowMin >= open || nowMin < (close % MINUTES_IN_DAY);
};

/* ============================== SMART ASSIGNMENT ============================== */
/**
 * Returns up to BATCH_SIZE nearest stores eligible to fulfil a pickup, applying
 * every Phase-3 filter in order: Active + Verified (enforced by getNearestStores),
 * accepts the waste category, currently within operating hours, and has enough
 * remaining capacity for the requested quantity. Stores already tried in a prior
 * round are excluded so retries always reach fresh recyclers.
 *
 * @returns {Array<{ storeId, recyclerId, storeName, recyclerName, recyclerEmail, distanceKm }>}
 */
const findEligibleStores = async (
  lat,
  lng,
  { wasteCategories = [], quantity = 0, excludeStoreIds = [], limit = BATCH_SIZE, now = new Date() } = {}
) => {
  // Pull a generous nearest-first page (filtered to Active+Verified + waste types
  // + pickup-available at the SQL layer), then apply the JS-side filters that
  // SQL can't cheaply express (operating hours, per-quantity capacity, excludes).
  // The store must accept EVERY selected category (getNearestStores ANDs them).
  const { rows } = await getNearestStores(lat, lng, {
    wasteTypes: wasteCategories,
    pickupAvailable: true,
    limit: 50,
    offset: 0
  });

  const excluded = new Set(excludeStoreIds.map(Number));
  let eligible = rows.filter(
    (s) =>
      !excluded.has(s.id) &&
      hasCapacity(s, quantity) &&
      isWithinOperatingHours(s.operatingHours, now)
  );

  // Threshold eligibility: drop stores whose assigned load for today has already
  // reached their admin-set daily threshold.
  const loads = await getStoreDailyLoads(eligible.map((s) => s.id));
  eligible = eligible.filter((s) => isWithinThreshold(s, loads[s.id] || 0));
  if (!eligible.length) return [];

  // Weighted score: proximity + (inverse) current daily load + rating. Higher is
  // better. Load uses the store's threshold (or daily capacity) as the basis so
  // a busier store scores lower — this is what spreads work across stores.
  const maxDist = Math.max(...eligible.map((s) => Number(s.distance) || 0), 0.0001);
  const scored = eligible.map((s) => {
    const dist = Number(s.distance) || 0;
    const load = loads[s.id] || 0;
    const basis = s.dailyThresholdKg || s.dailyCapacityKg || 0;
    const proximityScore = 1 - dist / maxDist; // nearer -> higher
    const loadScore = basis > 0 ? Math.max(0, 1 - load / basis) : 1 / (1 + load); // emptier -> higher
    const ratingScore = (Number(s.rating) || 0) / 5;
    const score = W_PROXIMITY * proximityScore + W_LOAD * loadScore + W_RATING * ratingScore;
    return { store: s, score, distanceKm: Number(dist.toFixed(2)) };
  });
  // Best score first; tie-break by nearest.
  scored.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);

  const top = scored.slice(0, limit);

  // Resolve recycler contact details for notification in a single round-trip.
  const recyclerIds = [...new Set(top.map((x) => x.store.recyclerId))];
  const [owners] = await db.query(
    `SELECT id, name, email FROM users WHERE id IN (${recyclerIds.map(() => '?').join(',')})`,
    recyclerIds
  );
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  return top.map((x) => ({
    storeId: x.store.id,
    recyclerId: x.store.recyclerId,
    storeName: x.store.storeName,
    recyclerName: ownerById.get(x.store.recyclerId)?.name || null,
    recyclerEmail: ownerById.get(x.store.recyclerId)?.email || null,
    distanceKm: x.distanceKm,
    score: Number(x.score.toFixed(4))
  }));
};

/* ============================== CREATE + BROADCAST ============================== */

const createPickupRequest = async (input) => {
  validatePickupPayload(input);
  const categories = normalizeWasteCategories(input, WASTE_TYPES);
  const [result] = await db.execute(
    `INSERT INTO pickup_requests
      (user_id, waste_category, waste_quantity, pickup_address,
       pickup_latitude, pickup_longitude, preferred_time_slot, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'REQUESTED')`,
    [
      Number(input.userId),
      categories.join(','),
      Number(input.wasteQuantity),
      String(input.pickupAddress).trim(),
      Number(input.pickupLatitude),
      Number(input.pickupLongitude),
      input.preferredTimeSlot ?? null
    ]
  );
  return result.insertId;
};

// Returns every store id a request has already been offered to (any round), so
// retries skip them.
const getTriedStoreIds = async (requestId, conn = db) => {
  const [rows] = await conn.query(
    'SELECT store_id FROM pickup_request_candidates WHERE request_id = ?',
    [requestId]
  );
  return rows.map((r) => r.store_id);
};

/**
 * Auto-assigns a request to the most suitable store(s). Scores the eligible pool
 * by the weighted formula in findEligibleStores and routes to the top
 * ASSIGN_COUNT (default 1 — the single best store). Inserts NOTIFIED candidate
 * rows, advances broadcast_round, sets status=BROADCASTED, and stamps a fresh
 * acceptance_deadline. If that store doesn't accept in time, the sweeper calls
 * this again with the store excluded, so the next-best store is tried.
 *
 * @returns {{ broadcasted, round, deadline, candidates }} broadcasted === 0 means
 *   no fresh eligible store was found (caller decides whether to expire).
 */
const broadcastRequest = async (request) => {
  const tried = await getTriedStoreIds(request.id);
  const round = (request.broadcastRound || 0) + 1;

  // Categories may arrive as a parsed array (mapped object) or the raw joined
  // string (e.g. the sweeper's re-broadcast) — normalise either way.
  const wasteCategories =
    Array.isArray(request.wasteCategories) && request.wasteCategories.length
      ? request.wasteCategories
      : request.wasteCategory
        ? String(request.wasteCategory).split(',')
        : [];

  // Score a small pool, then route to the single best (ASSIGN_COUNT) store.
  const ranked = await findEligibleStores(request.pickupLatitude, request.pickupLongitude, {
    wasteCategories,
    quantity: request.wasteQuantity,
    excludeStoreIds: tried,
    limit: BATCH_SIZE
  });
  const candidates = ranked.slice(0, ASSIGN_COUNT);

  const deadline = new Date(Date.now() + ACCEPTANCE_TIMEOUT_SECONDS * 1000);

  if (!candidates.length) {
    // No fresh eligible stores this round. Still stamp a deadline so the sweeper
    // re-attempts (or expires) the request rather than leaving it orphaned in
    // REQUESTED forever. The round is not advanced (nothing was broadcast).
    await db.execute(
      'UPDATE pickup_requests SET acceptance_deadline = ? WHERE id = ?',
      [deadline, request.id]
    );
    return { broadcasted: 0, round, deadline, candidates: [] };
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const c of candidates) {
      await conn.execute(
        `INSERT INTO pickup_request_candidates
          (request_id, store_id, recycler_id, round, distance_km, status)
         VALUES (?, ?, ?, ?, ?, 'NOTIFIED')`,
        [request.id, c.storeId, c.recyclerId, round, c.distanceKm]
      );
    }
    // Single-assignment model: surface the chosen store immediately (before the
    // recycler accepts) so the user sees their assigned store. On a retry round
    // this updates to the next-best store. assigned_recycler_id stays null until
    // the recycler actually accepts. For multi-assign (ASSIGN_COUNT>1) we leave
    // it null and let acceptRequest set the winner.
    const assignedStoreId = candidates.length === 1 ? candidates[0].storeId : null;
    await conn.execute(
      `UPDATE pickup_requests
         SET status = 'BROADCASTED', broadcast_round = ?, acceptance_deadline = ?,
             assigned_store_id = ?
       WHERE id = ?`,
      [round, deadline, assignedStoreId, request.id]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { broadcasted: candidates.length, round, deadline, candidates };
};

/* ============================== ACCEPT (first wins) ============================== */
/**
 * Atomically claims a broadcast for a recycler. The request row is locked
 * FOR UPDATE so concurrent accepts serialise — only the first sees status
 * BROADCASTED; the rest get a 409. Also re-checks the deadline and the store's
 * live capacity (reserving it on success) inside the same transaction.
 */
const acceptRequest = async (requestId, recyclerId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [reqRows] = await conn.query(
      'SELECT * FROM pickup_requests WHERE id = ? FOR UPDATE',
      [requestId]
    );
    const request = reqRows[0];
    if (!request) throw ApiError.notFound('Pickup request not found');

    if (request.status !== 'BROADCASTED') {
      throw ApiError.conflict('This request is no longer available to accept');
    }
    if (request.acceptance_deadline && new Date(request.acceptance_deadline) < new Date()) {
      // Lapsed — let the sweeper handle retry/expiry; reject this late accept.
      throw ApiError.conflict('The acceptance window for this request has expired');
    }

    // The recycler must hold a live (NOTIFIED) invitation for this request.
    const [candRows] = await conn.query(
      `SELECT * FROM pickup_request_candidates
       WHERE request_id = ? AND recycler_id = ? AND status = 'NOTIFIED'
       ORDER BY distance_km ASC LIMIT 1`,
      [requestId, recyclerId]
    );
    const candidate = candRows[0];
    if (!candidate) throw ApiError.forbidden('You were not invited to this request, or already responded');

    // Re-check the chosen store's capacity under lock, then reserve it.
    const [storeRows] = await conn.query(
      'SELECT id, status, daily_capacity_kg, current_capacity_kg FROM stores WHERE id = ? FOR UPDATE',
      [candidate.store_id]
    );
    const store = storeRows[0];
    const remaining = store
      ? Math.max(0, Number(store.daily_capacity_kg) - Number(store.current_capacity_kg))
      : 0;
    if (!store || store.status !== 'Active' || remaining < Number(request.waste_quantity)) {
      throw ApiError.conflict('The store can no longer fulfil this request');
    }
    await conn.execute(
      'UPDATE stores SET current_capacity_kg = current_capacity_kg + ? WHERE id = ?',
      [Number(request.waste_quantity), store.id]
    );

    // Assign the winner; everyone else for this request "misses".
    await conn.execute(
      `UPDATE pickup_requests
         SET status = 'ACCEPTED', assigned_recycler_id = ?, assigned_store_id = ?
       WHERE id = ?`,
      [recyclerId, candidate.store_id, requestId]
    );
    await conn.execute(
      `UPDATE pickup_request_candidates
         SET status = 'ACCEPTED', responded_at = NOW()
       WHERE id = ?`,
      [candidate.id]
    );
    await conn.execute(
      `UPDATE pickup_request_candidates
         SET status = 'MISSED', responded_at = NOW()
       WHERE request_id = ? AND id <> ? AND status = 'NOTIFIED'`,
      [requestId, candidate.id]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getRequestById(requestId);
};

/* ============================== REJECT ============================== */
// A recycler declines an offer. Marks their candidate row REJECTED. If that was
// the last live invitation for the round, the deadline is pulled to now so the
// sweeper immediately retries the next-nearest batch (or expires the request).
const rejectRequest = async (requestId, recyclerId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [candRows] = await conn.query(
      `SELECT * FROM pickup_request_candidates
       WHERE request_id = ? AND recycler_id = ? AND status = 'NOTIFIED' LIMIT 1`,
      [requestId, recyclerId]
    );
    const candidate = candRows[0];
    if (!candidate) throw ApiError.notFound('No pending invitation for this request');

    await conn.execute(
      `UPDATE pickup_request_candidates SET status = 'REJECTED', responded_at = NOW() WHERE id = ?`,
      [candidate.id]
    );

    const [[{ remaining }]] = await conn.query(
      `SELECT COUNT(*) AS remaining FROM pickup_request_candidates
       WHERE request_id = ? AND status = 'NOTIFIED'`,
      [requestId]
    );
    if (remaining === 0) {
      // Nobody left to answer this round — expire the window now so the sweeper
      // retries the next batch on its next pass.
      await conn.execute(
        `UPDATE pickup_requests SET acceptance_deadline = NOW()
         WHERE id = ? AND status = 'BROADCASTED'`,
        [requestId]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ============================== STATUS TRANSITIONS ============================== */
// ACCEPTED -> EN_ROUTE -> ARRIVED, by the assigned recycler only.
const transitionStatus = async (requestId, recyclerId, toStatus) => {
  const request = await getRawRequest(requestId);
  if (!request) throw ApiError.notFound('Pickup request not found');
  if (request.assigned_recycler_id !== recyclerId) {
    throw ApiError.forbidden('You are not assigned to this request');
  }
  const expected = RECYCLER_TRANSITIONS[request.status];
  if (!expected || expected !== toStatus) {
    throw ApiError.badRequest(`Invalid transition: ${request.status} → ${toStatus}`);
  }
  await db.execute('UPDATE pickup_requests SET status = ? WHERE id = ?', [toStatus, requestId]);
  return getRequestById(requestId);
};

/* ============================== OTP HANDSHAKE ============================== */
/**
 * ARRIVED -> OTP_PENDING. Generates the user-held OTP (handed to the recycler at
 * the door to confirm pickup) plus a recycler-held OTP (shown to the user to
 * confirm the recycler's identity). Returns the OTPs + the user's contact so the
 * caller can deliver otp_user by email.
 */
// ARRIVED -> OTP_PENDING. Arms a fresh OTP pair (with expiry + reset attempts /
// verified flags) via the shared OTP layer. Returns both codes + the user's
// contact so the caller can email otp_user; otp_recycler is shown to the
// recycler. Completion is two-sided (see otpVerificationModel.verifyOtp).
const startVerification = async (requestId, recyclerId) => {
  const request = await getRawRequest(requestId);
  if (!request) throw ApiError.notFound('Pickup request not found');
  if (request.assigned_recycler_id !== recyclerId) {
    throw ApiError.forbidden('You are not assigned to this request');
  }
  if (!['ARRIVED', 'OTP_PENDING'].includes(request.status)) {
    // ARRIVED -> first arm; OTP_PENDING -> resend (re-arm after expiry/lockout).
    throw ApiError.badRequest(`Invalid transition: ${request.status} → OTP_PENDING`);
  }

  await db.execute(`UPDATE pickup_requests SET status = 'OTP_PENDING' WHERE id = ?`, [requestId]);
  const { otpUser, otpRecycler } = await armVerification(db, 'pickup', requestId);

  const [[user]] = await db.query(
    'SELECT name, email FROM users WHERE id = ? LIMIT 1',
    [request.user_id]
  );
  return { otpUser, otpRecycler, userName: user?.name || 'User', userEmail: user?.email || null };
};

/* ============================== COLLECTION (Waste Collection Service Flow) ============================== */
// Arms the user OTP the moment the recycler accepts, and moves the request to
// OTP_PENDING so the code shows on the user's dashboard immediately. This
// collapses the EN_ROUTE/ARRIVED steps for the streamlined collection flow.
// TODO: the older en-route/arrived/mutual-verify endpoints remain available but
// are not used by this flow.
const armForCollection = async (requestId) => {
  await db.execute(`UPDATE pickup_requests SET status = 'OTP_PENDING' WHERE id = ?`, [requestId]);
  await armVerification(db, 'pickup', requestId);
};

/**
 * Recycler enters the user's OTP and logs the ACTUAL collected quantity. On a
 * matching OTP the pickup is marked COMPLETED with the actual quantity recorded
 * (which may differ from the user's declared quantity — a verifiable audit trail
 * for flagging chronic misreporting). Every attempt is audited.
 */
const collect = async (requestId, recyclerId, { otp, actualQuantityKg }) => {
  const qty = Number(actualQuantityKg);
  if (!Number.isFinite(qty) || qty < 0) {
    throw ApiError.badRequest('actualQuantityKg must be a non-negative number');
  }

  const conn = await db.getConnection();
  let committed = false;
  let deferredError = null;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT *, (otp_expiry IS NOT NULL AND otp_expiry < NOW()) AS expired
       FROM pickup_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );
    const r = rows[0];
    if (!r) throw ApiError.notFound('Pickup request not found');
    if (r.assigned_recycler_id !== recyclerId) throw ApiError.forbidden('You are not assigned to this request');
    if (r.status !== 'OTP_PENDING') throw ApiError.badRequest('This request is not awaiting OTP collection');

    const audit = (result, attemptNo) =>
      logAttempt(conn, { requestType: 'pickup', requestId, actor: 'recycler', actorUserId: recyclerId, target: 'user_otp', result, attemptNo });

    if (r.expired) {
      await audit('EXPIRED', r.otp_attempts);
      deferredError = ApiError.badRequest('OTP has expired. Ask the customer for a fresh code (resend verification).');
    } else if (r.otp_attempts >= MAX_OTP_ATTEMPTS) {
      await audit('LOCKED', r.otp_attempts);
      deferredError = new ApiError(429, 'Too many incorrect attempts. Resend verification to reset.');
    } else if (String(otp || '').trim() !== r.otp_user) {
      const attemptNo = r.otp_attempts + 1;
      await conn.execute('UPDATE pickup_requests SET otp_attempts = ? WHERE id = ?', [attemptNo, requestId]);
      await audit(attemptNo >= MAX_OTP_ATTEMPTS ? 'LOCKED' : 'FAIL', attemptNo);
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - attemptNo);
      deferredError = ApiError.badRequest(`Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    } else {
      await conn.execute(
        `UPDATE pickup_requests
           SET status = 'COMPLETED', user_otp_verified = 1, actual_quantity_kg = ?,
               completion_timestamp = NOW(), otp_user = NULL, otp_recycler = NULL
         WHERE id = ?`,
        [qty, requestId]
      );
      await audit('SUCCESS', r.otp_attempts);
      await conn.commit();
      committed = true;
      return getRequestById(requestId);
    }

    await conn.commit();
    committed = true;
    throw deferredError;
  } catch (err) {
    if (!committed) await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ============================== CANCEL ============================== */
// User cancels their own request before it completes. If a store had already
// reserved capacity (status was ACCEPTED+), that capacity is released.
const cancelRequest = async (requestId, userId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM pickup_requests WHERE id = ? FOR UPDATE', [requestId]);
    const request = rows[0];
    if (!request) throw ApiError.notFound('Pickup request not found');
    if (request.user_id !== userId) throw ApiError.forbidden('You cannot cancel this request');
    if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(request.status)) {
      throw ApiError.badRequest(`A ${request.status.toLowerCase()} request cannot be cancelled`);
    }

    if (request.assigned_store_id && Number(request.waste_quantity) > 0) {
      await conn.execute(
        'UPDATE stores SET current_capacity_kg = GREATEST(0, current_capacity_kg - ?) WHERE id = ?',
        [Number(request.waste_quantity), request.assigned_store_id]
      );
    }
    await conn.execute(`UPDATE pickup_requests SET status = 'CANCELLED' WHERE id = ?`, [requestId]);
    await conn.execute(
      `UPDATE pickup_request_candidates SET status = 'MISSED', responded_at = NOW()
       WHERE request_id = ? AND status = 'NOTIFIED'`,
      [requestId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ============================== EXPIRY + RETRY SWEEP ============================== */
/**
 * The auto-expire / retry engine. For each open request past its deadline:
 *   - if under MAX_ROUNDS, broadcast the next-nearest batch (excluding tried
 *     stores) and stamp a fresh deadline — the request keeps living;
 *   - otherwise (or when no fresh stores remain) mark it EXPIRED.
 * Stale NOTIFIED candidates from the previous round are marked MISSED.
 *
 * Returns { expired: number, rebroadcast: [{ requestId, candidates }] } so the
 * caller (the interval sweeper) can send the new round's notification emails.
 */
const processExpirations = async () => {
  const [due] = await db.query(
    `SELECT * FROM pickup_requests
     WHERE status IN ('REQUESTED', 'BROADCASTED')
       AND acceptance_deadline IS NOT NULL
       AND acceptance_deadline <= NOW()`
  );

  let expired = 0;
  const rebroadcast = [];

  for (const row of due) {
    const request = mapPickupRow(row);

    // Retire any unanswered invitations from the lapsed round.
    await db.execute(
      `UPDATE pickup_request_candidates SET status = 'MISSED', responded_at = NOW()
       WHERE request_id = ? AND status = 'NOTIFIED'`,
      [request.id]
    );

    if ((request.broadcastRound || 0) >= MAX_ROUNDS) {
      await db.execute(`UPDATE pickup_requests SET status = 'EXPIRED' WHERE id = ?`, [request.id]);
      expired += 1;
      continue;
    }

    const result = await broadcastRequest(request);
    if (result.broadcasted > 0) {
      rebroadcast.push({ requestId: request.id, candidates: result.candidates });
    } else {
      // No fresh stores left to try — expire now rather than spin.
      await db.execute(`UPDATE pickup_requests SET status = 'EXPIRED' WHERE id = ?`, [request.id]);
      expired += 1;
    }
  }

  return { expired, rebroadcast };
};

/* ============================== READS ============================== */

// Raw (snake_case) single row — used internally by transitions that need the
// secret OTP columns or just a cheap existence/ownership check.
const getRawRequest = async (id) => {
  const [rows] = await db.execute('SELECT * FROM pickup_requests WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
};

const REQUEST_SELECT = `
  pr.id, pr.user_id, pr.assigned_recycler_id, pr.assigned_store_id,
  pr.waste_category, pr.waste_quantity, pr.pickup_address,
  pr.pickup_latitude, pr.pickup_longitude, pr.preferred_time_slot,
  pr.status, pr.acceptance_deadline, pr.completion_timestamp, pr.broadcast_round,
  pr.user_otp_verified, pr.recycler_otp_verified, pr.actual_quantity_kg,
  pr.created_at, pr.updated_at,
  u.name AS user_name, u.email AS user_email,
  r.name AS recycler_name,
  s.store_name AS store_name, s.address AS store_address, s.contact_number AS store_contact
`;

const REQUEST_JOINS = `
  JOIN users u ON u.id = pr.user_id
  LEFT JOIN users r ON r.id = pr.assigned_recycler_id
  LEFT JOIN stores s ON s.id = pr.assigned_store_id
`;

// Full mapped request + its candidate fan-out (for detail views).
const getRequestById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT} FROM pickup_requests pr ${REQUEST_JOINS} WHERE pr.id = ? LIMIT 1`,
    [id]
  );
  const request = mapPickupRow(rows[0]);
  if (!request) return null;

  const [cands] = await db.query(
    `SELECT c.id, c.store_id, c.recycler_id, c.round, c.distance_km, c.status,
            c.notified_at, c.responded_at, s.store_name
     FROM pickup_request_candidates c
     JOIN stores s ON s.id = c.store_id
     WHERE c.request_id = ?
     ORDER BY c.round ASC, c.distance_km ASC`,
    [id]
  );
  request.candidates = cands.map((c) => ({
    id: c.id,
    storeId: c.store_id,
    recyclerId: c.recycler_id,
    storeName: c.store_name,
    round: c.round,
    distanceKm: c.distance_km == null ? null : Number(c.distance_km),
    status: c.status,
    notifiedAt: c.notified_at,
    respondedAt: c.responded_at
  }));
  return request;
};

const listForUser = async (userId, { status, limit = 10, offset = 0 } = {}) => {
  const where = ['pr.user_id = ?'];
  const values = [userId];
  if (status) {
    where.push('pr.status = ?');
    values.push(status);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM pickup_requests pr ${whereSql}`,
    values
  );
  // Owner-only view: include the user's own OTP so it can be shown on their
  // dashboard once the recycler has accepted (status OTP_PENDING). Safe here
  // because this query is always scoped to the authenticated user's own rows.
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT}, pr.otp_user FROM pickup_requests pr ${REQUEST_JOINS} ${whereSql}
     ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return {
    rows: rows.map((r) => ({ ...mapPickupRow(r), otp: r.otp_user || null })),
    total
  };
};

/**
 * Recycler inbox: the open offers broadcast to any of this recycler's stores
 * (status BROADCASTED, their candidate still NOTIFIED) plus every request
 * currently assigned to them (ACCEPTED..OTP_PENDING) and, optionally, completed
 * history. Deduped per request (a recycler may own several candidate stores).
 */
const listForRecycler = async (recyclerId, { scope = 'active' } = {}) => {
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT},
            c.status AS candidate_status, c.distance_km AS distance_km
     FROM pickup_requests pr
     ${REQUEST_JOINS}
     LEFT JOIN pickup_request_candidates c
       ON c.request_id = pr.id AND c.recycler_id = ? AND c.status = 'NOTIFIED'
     WHERE
       (pr.status = 'BROADCASTED' AND c.id IS NOT NULL)
       OR (pr.assigned_recycler_id = ? AND pr.status IN ('ACCEPTED','EN_ROUTE','ARRIVED','OTP_PENDING'))
       ${scope === 'all' ? "OR (pr.assigned_recycler_id = ? AND pr.status IN ('COMPLETED','CANCELLED','EXPIRED'))" : ''}
     ORDER BY pr.created_at DESC`,
    scope === 'all' ? [recyclerId, recyclerId, recyclerId] : [recyclerId, recyclerId]
  );

  // Dedupe per request id (multiple owned candidate stores -> keep the nearest).
  const byId = new Map();
  for (const row of rows) {
    const mapped = mapPickupRow(row);
    const existing = byId.get(mapped.id);
    if (!existing || (mapped.distanceKm ?? Infinity) < (existing.distanceKm ?? Infinity)) {
      byId.set(mapped.id, mapped);
    }
  }
  return [...byId.values()];
};

// Admin: all pickup requests (optional status filter), newest first, paginated.
const listAllForAdmin = async ({ status, limit = 20, offset = 0 } = {}) => {
  const where = [];
  const values = [];
  if (status) {
    where.push('pr.status = ?');
    values.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM pickup_requests pr ${whereSql}`,
    values
  );
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT} FROM pickup_requests pr ${REQUEST_JOINS} ${whereSql}
     ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return { rows: rows.map(mapPickupRow), total };
};

module.exports = {
  // constants
  PICKUP_STATUSES,
  OPEN_STATUSES,
  BATCH_SIZE,
  ACCEPTANCE_TIMEOUT_SECONDS,
  MAX_ROUNDS,
  // helpers (exported for reuse/testing)
  mapPickupRow,
  validatePickupPayload,
  isWithinOperatingHours,
  findEligibleStores,
  // lifecycle
  createPickupRequest,
  broadcastRequest,
  acceptRequest,
  rejectRequest,
  transitionStatus,
  startVerification,
  armForCollection,
  collect,
  cancelRequest,
  processExpirations,
  // reads
  getRequestById,
  getRawRequest,
  listForUser,
  listForRecycler,
  listAllForAdmin
};
