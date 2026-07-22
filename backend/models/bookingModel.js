const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const {
  mapStoreRow,
  canAcceptBooking,
  STORE_SELECT_COLUMNS
} = require('./storeModel');

// Whitelisted sort keys -> trusted SQL expressions. Keys are validated by
// utils/query.parseSort before reaching any query, so these are safe to inline.
const BOOKING_SORT_COLUMNS = {
  created_at: 'b.created_at',
  pickup_date: 'b.pickup_date',
  status: 'b.status',
  id: 'b.id'
};

const BOOKING_SELECT = `
  b.id, b.user_id, b.recycler_id, b.store_id, b.status, b.pickup_date, b.created_at,
  b.latitude, b.longitude, b.address, b.estimated_weight_kg, b.waste_type,
  r.name AS recycler_name,
  s.store_name AS store_name
`;

// Shared join: recycler (assignee) + the targeted store. Both LEFT so unclaimed
// / store-less legacy bookings still return.
const BOOKING_JOINS = `
  LEFT JOIN users r ON r.id = b.recycler_id
  LEFT JOIN stores s ON s.id = b.store_id
`;

/* ================= CREATE BOOKING ================= */
const createBooking = async ({
  userId,
  recyclerId = null,
  storeId = null,
  pickupDate,
  status = 'pending',
  latitude,
  longitude,
  address
}) => {
  const [result] = await db.execute(
    `INSERT INTO bookings
    (user_id, recycler_id, store_id, status, pickup_date, latitude, longitude, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, recyclerId, storeId, status, pickupDate, latitude, longitude, address]
  );

  return result.insertId;
};

/* ================= CREATE STORE BOOKING (atomic + capacity) ================= */
// Creates a booking against a store and reserves its capacity in one
// transaction. The store row is locked (SELECT ... FOR UPDATE) so the eligibility
// check + capacity reservation are race-free — two concurrent bookings cannot
// both slip past the remaining-capacity limit (prevents overbooking).
//
// Throws an ApiError (with .code) when the store can't accept the booking; the
// transaction is rolled back so no capacity is consumed on rejection.
const createStoreBooking = async ({
  userId,
  storeId,
  estimatedWeightKg = 0,
  wasteType = null,
  pickupDate,
  latitude,
  longitude,
  address
}) => {
  const weight = Number(estimatedWeightKg) || 0;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT ${STORE_SELECT_COLUMNS} FROM stores WHERE id = ? FOR UPDATE`,
      [storeId]
    );
    const store = rows.length ? mapStoreRow(rows[0]) : null;

    // Gate via the shared availability check (active/verified/pickup/capacity).
    const verdict = canAcceptBooking(store, weight);
    if (!verdict.ok) {
      const err = new ApiError(verdict.status, verdict.message);
      err.code = verdict.code;
      throw err;
    }

    // If a waste type was specified, the store must accept it.
    if (wasteType && !store.acceptedWasteTypes.includes(wasteType)) {
      const err = new ApiError(400, `This store does not accept ${wasteType}`);
      err.code = 'WASTE_TYPE_NOT_ACCEPTED';
      throw err;
    }

    // Reserve capacity, then record the booking. recycler_id is the store owner.
    await conn.execute(
      'UPDATE stores SET current_capacity_kg = current_capacity_kg + ? WHERE id = ?',
      [weight, store.id]
    );
    const [result] = await conn.execute(
      `INSERT INTO bookings
        (user_id, recycler_id, store_id, status, pickup_date, latitude, longitude, address, estimated_weight_kg, waste_type)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [userId, store.recyclerId, store.id, pickupDate, latitude, longitude, address, weight, wasteType]
    );

    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ================= GET BOOKING BY ID ================= */
const getBookingById = async (id) => {
  const [rows] = await db.execute(
    `SELECT ${BOOKING_SELECT}, b.user_id
     FROM bookings b
     ${BOOKING_JOINS}
     WHERE b.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
};

/* ================= USER BOOKINGS (filter + sort + paginate) ================= */
const getBookingsByUser = async (userId, { status, sortColumn = 'created_at', sortOrder = 'DESC', limit = 10, offset = 0 } = {}) => {
  const where = ['b.user_id = ?'];
  const values = [userId];

  if (status) {
    where.push('b.status = ?');
    values.push(status);
  }

  const orderBy = BOOKING_SORT_COLUMNS[sortColumn] || BOOKING_SORT_COLUMNS.created_at;
  const baseFrom = `
    FROM bookings b
    ${BOOKING_JOINS}
    WHERE ${where.join(' AND ')}
  `;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${baseFrom}`, values);
  const [rows] = await db.query(
    `SELECT ${BOOKING_SELECT} ${baseFrom} ORDER BY ${orderBy} ${sortOrder} LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return { rows, total };
};

/* ================= ALL BOOKINGS (role scoped + filter/search/sort/paginate) ================= */
const getAllBookings = async ({
  role,
  userId,
  status,
  search,
  sortColumn = 'created_at',
  sortOrder = 'DESC',
  limit = 20,
  offset = 0
} = {}) => {
  const where = [];
  const values = [];

  // Recyclers only see unclaimed bookings or ones already assigned to them.
  if (role === 'recycler') {
    where.push('(b.recycler_id IS NULL OR b.recycler_id = ?)');
    values.push(userId);
  }
  if (status) {
    where.push('b.status = ?');
    values.push(status);
  }
  if (search) {
    where.push('(u.name LIKE ? OR b.address LIKE ? OR r.name LIKE ?)');
    const like = `%${search}%`;
    values.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = BOOKING_SORT_COLUMNS[sortColumn] || BOOKING_SORT_COLUMNS.created_at;

  const baseFrom = `
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    ${BOOKING_JOINS}
    ${whereSql}
  `;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${baseFrom}`, values);
  const [rows] = await db.query(
    `SELECT ${BOOKING_SELECT}, b.user_id, u.name AS user_name
     ${baseFrom}
     ORDER BY ${orderBy} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return { rows, total };
};

/* ================= BOOKINGS FOR RECYCLER (filter/sort/paginate) ================= */
const getBookingsForRecycler = async (recyclerId, { status, sortColumn = 'created_at', sortOrder = 'DESC', limit = 20, offset = 0 } = {}) => {
  const where = ['b.recycler_id = ?'];
  const values = [recyclerId];

  if (status) {
    where.push('b.status = ?');
    values.push(status);
  }

  const orderBy = BOOKING_SORT_COLUMNS[sortColumn] || BOOKING_SORT_COLUMNS.created_at;
  const baseFrom = `
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN stores s ON s.id = b.store_id
    WHERE ${where.join(' AND ')}
  `;

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${baseFrom}`, values);
  const [rows] = await db.query(
    `SELECT b.id, b.user_id, b.store_id, u.name AS user_name, u.email AS user_email,
            s.store_name AS store_name,
            b.latitude AS user_latitude, b.longitude AS user_longitude,
            b.address, b.status, b.pickup_date, b.created_at
     ${baseFrom}
     ORDER BY ${orderBy} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return { rows, total };
};

/* ================= UPDATE STATUS ================= */
const updateBookingStatus = async (id, status) => {
  const [result] = await db.execute(
    'UPDATE bookings SET status = ? WHERE id = ?',
    [status, id]
  );
  return result.affectedRows;
};

/* ================= ASSIGN RECYCLER (atomic claim) ================= */
const assignRecycler = async (id, recyclerId) => {
  const [result] = await db.execute(
    `UPDATE bookings
     SET recycler_id = ?
     WHERE id = ? AND (recycler_id IS NULL OR recycler_id = ?)`,
    [recyclerId, id, recyclerId]
  );

  return result.affectedRows;
};

/* ================= DELETE BOOKING ================= */
const deleteBookingById = async (id) => {
  const [result] = await db.execute('DELETE FROM bookings WHERE id = ?', [id]);
  return result.affectedRows;
};

module.exports = {
  createBooking,
  createStoreBooking,
  getBookingById,
  getBookingsByUser,
  getAllBookings,
  getBookingsForRecycler,
  updateBookingStatus,
  assignRecycler,
  deleteBookingById
};
