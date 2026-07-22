const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const { normalizeWasteCategories } = require('../utils/wasteCategories');
const {
  WASTE_TYPES,
  findStoreById,
  canAcceptBooking,
  getStoreDailyLoad,
  isWithinThreshold
} = require('./storeModel');
const { armVerification, logAttempt, MAX_OTP_ATTEMPTS } = require('./otpVerificationModel');

/* ============================== STATUS MACHINE ============================== */

const DROPOFF_STATUSES = [
  'REQUESTED', 'APPROVED', 'CHECKED_IN', 'OTP_PENDING', 'COMPLETED', 'CANCELLED'
];

/* ============================== ROW MAPPING ============================== */

const mapDropOffRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    storeId: row.store_id,
    recyclerId: row.recycler_id,
    // `wasteCategory` stays the raw comma-joined string (backward compatible for
    // display); `wasteCategories` is the parsed multi-select array.
    wasteCategory: row.waste_category,
    wasteCategories: row.waste_category ? String(row.waste_category).split(',') : [],
    wasteQuantity: Number(row.waste_quantity),
    scheduledDate: row.scheduled_date,
    timeSlot: row.time_slot,
    status: row.status,
    // OTPs are secrets — never mapped. The per-side verified flags ARE surfaced
    // so the UI can show two-sided completion progress.
    ...(row.user_otp_verified !== undefined ? { userOtpVerified: Boolean(row.user_otp_verified) } : {}),
    ...(row.recycler_otp_verified !== undefined ? { recyclerOtpVerified: Boolean(row.recycler_otp_verified) } : {}),
    ...(row.actual_quantity_kg !== undefined
      ? { actualQuantityKg: row.actual_quantity_kg === null ? null : Number(row.actual_quantity_kg) }
      : {}),
    completionTimestamp: row.completion_timestamp,
    // Joined display fields (present only on list/detail queries).
    ...(row.user_name !== undefined ? { userName: row.user_name } : {}),
    ...(row.user_email !== undefined ? { userEmail: row.user_email } : {}),
    ...(row.recycler_name !== undefined ? { recyclerName: row.recycler_name } : {}),
    ...(row.recycler_email !== undefined ? { recyclerEmail: row.recycler_email } : {}),
    ...(row.store_name !== undefined ? { storeName: row.store_name } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/* ============================== VALIDATION ============================== */

const isFiniteNum = (v) => Number.isFinite(Number(v));
// YYYY-MM-DD (the HTML <input type="date"> value).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const validateDropOffPayload = (input = {}) => {
  if (!isFiniteNum(input.storeId) || Number(input.storeId) <= 0) {
    throw ApiError.badRequest('storeId is required and must be a positive number');
  }
  normalizeWasteCategories(input, WASTE_TYPES); // throws on empty / invalid
  if (!isFiniteNum(input.wasteQuantity) || Number(input.wasteQuantity) <= 0) {
    throw ApiError.badRequest('wasteQuantity must be a positive number');
  }
  if (!input.scheduledDate || !DATE_RE.test(String(input.scheduledDate))) {
    throw ApiError.badRequest('scheduledDate is required and must be in YYYY-MM-DD format');
  }
  const parsed = new Date(`${input.scheduledDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest('scheduledDate is not a valid date');
  }
  if (!input.timeSlot || String(input.timeSlot).trim().length < 2) {
    throw ApiError.badRequest('timeSlot is required');
  }
  if (String(input.timeSlot).length > 32) {
    throw ApiError.badRequest('timeSlot must be at most 32 characters');
  }
};

/* ============================== CREATE ============================== */
/**
 * Creates a drop-off request against a user-selected store. The store must be
 * able to accept the booking (active, verified, accepts the waste type, and has
 * capacity for the quantity) — checked up-front for immediate feedback. Capacity
 * is NOT reserved here; it is reserved when the recycler approves (re-checked
 * under lock then), so an unapproved request never holds capacity.
 */
const createDropOffRequest = async (input) => {
  validateDropOffPayload(input);

  const store = await findStoreById(Number(input.storeId));
  const verdict = canAcceptBooking(store, Number(input.wasteQuantity));
  if (!verdict.ok) {
    const err = new ApiError(verdict.status, verdict.message);
    err.code = verdict.code;
    throw err;
  }
  const categories = normalizeWasteCategories(input, WASTE_TYPES);
  const notAccepted = categories.filter((c) => !store.acceptedWasteTypes.includes(c));
  if (notAccepted.length) {
    throw ApiError.badRequest(`This store does not accept: ${notAccepted.join(', ')}`);
  }

  // Store eligibility: today's assigned load must be below the admin threshold.
  const dailyLoad = await getStoreDailyLoad(store.id);
  if (!isWithinThreshold(store, dailyLoad)) {
    const err = ApiError.conflict('This store has reached its daily intake limit. Please choose another store.');
    err.code = 'THRESHOLD_REACHED';
    throw err;
  }

  const [result] = await db.execute(
    `INSERT INTO dropoff_requests
      (user_id, store_id, recycler_id, waste_category, waste_quantity,
       scheduled_date, time_slot, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'REQUESTED')`,
    [
      Number(input.userId),
      store.id,
      store.recyclerId,
      categories.join(','),
      Number(input.wasteQuantity),
      input.scheduledDate,
      String(input.timeSlot).trim()
    ]
  );
  return result.insertId;
};

/* ============================== APPROVE ============================== */
// REQUESTED -> APPROVED, by the store's recycler. Reserves store capacity under
// a row lock (re-checking it is still available), so two approvals can't both
// overcommit the store.
const approveDropOff = async (id, recyclerId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM dropoff_requests WHERE id = ? FOR UPDATE', [id]);
    const request = rows[0];
    if (!request) throw ApiError.notFound('Drop-off request not found');
    if (request.recycler_id !== recyclerId) {
      throw ApiError.forbidden('You do not own the store for this request');
    }
    if (request.status !== 'REQUESTED') {
      throw ApiError.conflict(`Only a requested drop-off can be approved (currently ${request.status})`);
    }

    const [storeRows] = await conn.query(
      'SELECT id, status, daily_capacity_kg, current_capacity_kg FROM stores WHERE id = ? FOR UPDATE',
      [request.store_id]
    );
    const store = storeRows[0];
    const remaining = store
      ? Math.max(0, Number(store.daily_capacity_kg) - Number(store.current_capacity_kg))
      : 0;
    if (!store || store.status !== 'Active' || remaining < Number(request.waste_quantity)) {
      throw ApiError.conflict('The store can no longer accept this drop-off');
    }

    await conn.execute(
      'UPDATE stores SET current_capacity_kg = current_capacity_kg + ? WHERE id = ?',
      [Number(request.waste_quantity), store.id]
    );
    await conn.execute(`UPDATE dropoff_requests SET status = 'APPROVED' WHERE id = ?`, [id]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getRequestById(id);
};

/* ============================== REJECT (recycler) ============================== */
// The recycler declines a request. There is no dedicated REJECTED state in the
// spec, so a declined drop-off becomes CANCELLED. Releases any capacity that an
// earlier approval had reserved.
const rejectDropOff = async (id, recyclerId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM dropoff_requests WHERE id = ? FOR UPDATE', [id]);
    const request = rows[0];
    if (!request) throw ApiError.notFound('Drop-off request not found');
    if (request.recycler_id !== recyclerId) {
      throw ApiError.forbidden('You do not own the store for this request');
    }
    if (['COMPLETED', 'CANCELLED'].includes(request.status)) {
      throw ApiError.badRequest(`A ${request.status.toLowerCase()} drop-off cannot be rejected`);
    }

    if (releasesCapacity(request.status) && Number(request.waste_quantity) > 0) {
      await conn.execute(
        'UPDATE stores SET current_capacity_kg = GREATEST(0, current_capacity_kg - ?) WHERE id = ?',
        [Number(request.waste_quantity), request.store_id]
      );
    }
    await conn.execute(`UPDATE dropoff_requests SET status = 'CANCELLED' WHERE id = ?`, [id]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getRequestById(id);
};

// Capacity is held once a drop-off is APPROVED and stays held through CHECKED_IN
// / OTP_PENDING. Cancelling/rejecting from any of those releases it; a still
// REQUESTED drop-off never reserved any.
const releasesCapacity = (status) => ['APPROVED', 'CHECKED_IN', 'OTP_PENDING'].includes(status);

/* ============================== CHECK-IN ============================== */
// APPROVED -> CHECKED_IN, by the store's recycler when the user arrives.
const checkIn = async (id, recyclerId) => {
  const request = await getRawRequest(id);
  if (!request) throw ApiError.notFound('Drop-off request not found');
  if (request.recycler_id !== recyclerId) {
    throw ApiError.forbidden('You do not own the store for this request');
  }
  if (request.status !== 'APPROVED') {
    throw ApiError.badRequest(`Invalid transition: ${request.status} → CHECKED_IN`);
  }
  await db.execute(`UPDATE dropoff_requests SET status = 'CHECKED_IN' WHERE id = ?`, [id]);
  return getRequestById(id);
};

/* ============================== OTP HANDSHAKE ============================== */
// CHECKED_IN -> OTP_PENDING. Generates the user-held OTP (handed to the recycler
// to confirm the drop-off) plus a recycler-held OTP (shown to the user). Returns
// the OTPs + user contact so the caller can email otp_user.
const startVerification = async (id, recyclerId) => {
  const request = await getRawRequest(id);
  if (!request) throw ApiError.notFound('Drop-off request not found');
  if (request.recycler_id !== recyclerId) {
    throw ApiError.forbidden('You do not own the store for this request');
  }
  if (!['CHECKED_IN', 'OTP_PENDING'].includes(request.status)) {
    // CHECKED_IN -> first arm; OTP_PENDING -> resend (re-arm after expiry/lockout).
    throw ApiError.badRequest(`Invalid transition: ${request.status} → OTP_PENDING`);
  }

  await db.execute(`UPDATE dropoff_requests SET status = 'OTP_PENDING' WHERE id = ?`, [id]);
  const { otpUser, otpRecycler } = await armVerification(db, 'dropoff', id);

  const [[user]] = await db.query('SELECT name, email FROM users WHERE id = ? LIMIT 1', [request.user_id]);
  return { otpUser, otpRecycler, userName: user?.name || 'User', userEmail: user?.email || null };
};

/* ============================== COLLECTION (Waste Collection Service Flow) ============================== */
// On approval, the user OTP is armed and the request moves to OTP_PENDING so the
// code shows on the user's dashboard. The recycler then enters the OTP + actual
// collected quantity to complete. TODO: this collapses the CHECKED_IN step for
// the streamlined flow; the older check-in/mutual endpoints remain available.
const armForCollection = async (id) => {
  await db.execute(`UPDATE dropoff_requests SET status = 'OTP_PENDING' WHERE id = ?`, [id]);
  await armVerification(db, 'dropoff', id);
};

const collect = async (id, recyclerId, { otp, actualQuantityKg }) => {
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
       FROM dropoff_requests WHERE id = ? FOR UPDATE`,
      [id]
    );
    const r = rows[0];
    if (!r) throw ApiError.notFound('Drop-off request not found');
    if (r.recycler_id !== recyclerId) throw ApiError.forbidden('You do not own the store for this request');
    if (r.status !== 'OTP_PENDING') throw ApiError.badRequest('This drop-off is not awaiting OTP collection');

    const audit = (result, attemptNo) =>
      logAttempt(conn, { requestType: 'dropoff', requestId: id, actor: 'recycler', actorUserId: recyclerId, target: 'user_otp', result, attemptNo });

    if (r.expired) {
      await audit('EXPIRED', r.otp_attempts);
      deferredError = ApiError.badRequest('OTP has expired. Ask the customer for a fresh code (resend verification).');
    } else if (r.otp_attempts >= MAX_OTP_ATTEMPTS) {
      await audit('LOCKED', r.otp_attempts);
      deferredError = new ApiError(429, 'Too many incorrect attempts. Resend verification to reset.');
    } else if (String(otp || '').trim() !== r.otp_user) {
      const attemptNo = r.otp_attempts + 1;
      await conn.execute('UPDATE dropoff_requests SET otp_attempts = ? WHERE id = ?', [attemptNo, id]);
      await audit(attemptNo >= MAX_OTP_ATTEMPTS ? 'LOCKED' : 'FAIL', attemptNo);
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - attemptNo);
      deferredError = ApiError.badRequest(`Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    } else {
      await conn.execute(
        `UPDATE dropoff_requests
           SET status = 'COMPLETED', user_otp_verified = 1, actual_quantity_kg = ?,
               completion_timestamp = NOW(), otp_user = NULL, otp_recycler = NULL
         WHERE id = ?`,
        [qty, id]
      );
      await audit('SUCCESS', r.otp_attempts);
      await conn.commit();
      committed = true;
      return getRequestById(id);
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

/* ============================== CANCEL (user) ============================== */
// The user cancels their own drop-off before it completes; releases reserved
// capacity if it had been approved.
const cancelDropOff = async (id, userId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM dropoff_requests WHERE id = ? FOR UPDATE', [id]);
    const request = rows[0];
    if (!request) throw ApiError.notFound('Drop-off request not found');
    if (request.user_id !== userId) throw ApiError.forbidden('You cannot cancel this drop-off');
    if (['COMPLETED', 'CANCELLED'].includes(request.status)) {
      throw ApiError.badRequest(`A ${request.status.toLowerCase()} drop-off cannot be cancelled`);
    }

    if (releasesCapacity(request.status) && Number(request.waste_quantity) > 0) {
      await conn.execute(
        'UPDATE stores SET current_capacity_kg = GREATEST(0, current_capacity_kg - ?) WHERE id = ?',
        [Number(request.waste_quantity), request.store_id]
      );
    }
    await conn.execute(`UPDATE dropoff_requests SET status = 'CANCELLED' WHERE id = ?`, [id]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ============================== READS ============================== */

const getRawRequest = async (id) => {
  const [rows] = await db.execute('SELECT * FROM dropoff_requests WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
};

const REQUEST_SELECT = `
  dr.id, dr.user_id, dr.store_id, dr.recycler_id, dr.waste_category, dr.waste_quantity,
  dr.scheduled_date, dr.time_slot, dr.status, dr.completion_timestamp,
  dr.user_otp_verified, dr.recycler_otp_verified, dr.actual_quantity_kg,
  dr.created_at, dr.updated_at,
  u.name AS user_name, u.email AS user_email,
  r.name AS recycler_name, r.email AS recycler_email,
  s.store_name AS store_name
`;

const REQUEST_JOINS = `
  JOIN users u ON u.id = dr.user_id
  LEFT JOIN users r ON r.id = dr.recycler_id
  LEFT JOIN stores s ON s.id = dr.store_id
`;

const getRequestById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT} FROM dropoff_requests dr ${REQUEST_JOINS} WHERE dr.id = ? LIMIT 1`,
    [id]
  );
  return mapDropOffRow(rows[0]);
};

const listForUser = async (userId, { status, limit = 10, offset = 0 } = {}) => {
  const where = ['dr.user_id = ?'];
  const values = [userId];
  if (status) {
    where.push('dr.status = ?');
    values.push(status);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM dropoff_requests dr ${whereSql}`,
    values
  );
  // Owner-only view: include the user's own OTP so it can be shown on their
  // dashboard once the recycler has approved (status OTP_PENDING).
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT}, dr.otp_user FROM dropoff_requests dr ${REQUEST_JOINS} ${whereSql}
     ORDER BY dr.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return {
    rows: rows.map((r) => ({ ...mapDropOffRow(r), otp: r.otp_user || null })),
    total
  };
};

// Incoming drop-offs across all of a recycler's stores.
const listForRecycler = async (recyclerId, { status, limit = 50, offset = 0 } = {}) => {
  const where = ['dr.recycler_id = ?'];
  const values = [recyclerId];
  if (status) {
    where.push('dr.status = ?');
    values.push(status);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM dropoff_requests dr ${whereSql}`,
    values
  );
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT} FROM dropoff_requests dr ${REQUEST_JOINS} ${whereSql}
     ORDER BY dr.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return { rows: rows.map(mapDropOffRow), total };
};

// Admin: all drop-off requests (optional status filter), newest first, paginated.
const listAllForAdmin = async ({ status, limit = 20, offset = 0 } = {}) => {
  const where = [];
  const values = [];
  if (status) {
    where.push('dr.status = ?');
    values.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM dropoff_requests dr ${whereSql}`,
    values
  );
  const [rows] = await db.query(
    `SELECT ${REQUEST_SELECT} FROM dropoff_requests dr ${REQUEST_JOINS} ${whereSql}
     ORDER BY dr.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return { rows: rows.map(mapDropOffRow), total };
};

module.exports = {
  DROPOFF_STATUSES,
  mapDropOffRow,
  validateDropOffPayload,
  createDropOffRequest,
  approveDropOff,
  rejectDropOff,
  checkIn,
  startVerification,
  armForCollection,
  collect,
  cancelDropOff,
  getRequestById,
  getRawRequest,
  listForUser,
  listForRecycler,
  listAllForAdmin
};
