const db = require('../config/db');
const ApiError = require('../utils/ApiError');

/* ============================== CONSTANTS ============================== */

const MIN_RATING = 1;
const MAX_RATING = 5;
const MAX_COMMENT_LENGTH = 1000;

/* ============================== ROW MAPPING ============================== */
// snake_case DB row -> camelCase review object. user_name is only present when
// the query joins users (the public list / details); omit it otherwise.

const mapReviewRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    userId: row.user_id,
    rating: Number(row.rating),
    comment: row.comment,
    ...(row.user_name !== undefined ? { userName: row.user_name } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/* ============================== VALIDATION ============================== */

// Validates a review payload. `partial: true` (used for edits) only checks the
// fields that are present; create validation enforces the required rating.
const validateReviewPayload = (input = {}, { partial = false } = {}) => {
  const has = (key) => input[key] !== undefined && input[key] !== null;

  if (!partial || has('rating')) {
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
      throw ApiError.badRequest(`rating is required and must be an integer between ${MIN_RATING} and ${MAX_RATING}`);
    }
  }

  if (has('comment')) {
    if (typeof input.comment !== 'string') {
      throw ApiError.badRequest('comment must be a string');
    }
    if (input.comment.length > MAX_COMMENT_LENGTH) {
      throw ApiError.badRequest(`comment must be at most ${MAX_COMMENT_LENGTH} characters`);
    }
  }
};

/* ============================== AGGREGATES ============================== */
// Recomputes a store's rating (avg, 1 decimal) and total_reviews from the
// reviews table and writes them back. Runs on the supplied transaction
// connection so the aggregate stays consistent with the review write that
// triggered it. The stores.rating column is DECIMAL(2,1), so the average is
// rounded to one decimal place before storing.
const recomputeStoreAggregates = async (conn, storeId) => {
  const [[{ total, avg }]] = await conn.query(
    'SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0) AS avg FROM reviews WHERE store_id = ?',
    [storeId]
  );
  const rating = Math.round(Number(avg) * 10) / 10;
  await conn.execute(
    'UPDATE stores SET rating = ?, total_reviews = ? WHERE id = ?',
    [rating, total, storeId]
  );
  return { rating, totalReviews: total };
};

/* ============================== DATA ACCESS ============================== */

const findReviewById = async (id) => {
  const [rows] = await db.execute(
    'SELECT id, store_id, user_id, rating, comment, created_at, updated_at FROM reviews WHERE id = ? LIMIT 1',
    [id]
  );
  return mapReviewRow(rows[0]);
};

// A user may leave at most one review per store; this is the lookup that backs
// "have I already reviewed this store?" (and the UNIQUE constraint enforces it).
const findReviewByUserAndStore = async (storeId, userId) => {
  const [rows] = await db.execute(
    'SELECT id, store_id, user_id, rating, comment, created_at, updated_at FROM reviews WHERE store_id = ? AND user_id = ? LIMIT 1',
    [storeId, userId]
  );
  return mapReviewRow(rows[0]);
};

// Public, paginated list of a store's reviews (newest first) joined with the
// reviewer's name. Returns { rows, total } so the caller can build pagination.
const listReviewsByStore = async (storeId, { limit = 10, offset = 0 } = {}) => {
  const [[{ total }]] = await db.query(
    'SELECT COUNT(*) AS total FROM reviews WHERE store_id = ?',
    [storeId]
  );
  const [rows] = await db.query(
    `SELECT rv.id, rv.store_id, rv.user_id, rv.rating, rv.comment,
            rv.created_at, rv.updated_at, u.name AS user_name
     FROM reviews rv
     JOIN users u ON u.id = rv.user_id
     WHERE rv.store_id = ?
     ORDER BY rv.created_at DESC
     LIMIT ? OFFSET ?`,
    [storeId, limit, offset]
  );
  return { rows: rows.map(mapReviewRow), total };
};

// Creates a review and refreshes the store aggregates in one transaction. The
// duplicate guard is twofold: the UNIQUE(store_id, user_id) index is the source
// of truth (race-safe), and ER_DUP_ENTRY is translated to a friendly 409.
const createReview = async ({ storeId, userId, rating, comment = null }) => {
  validateReviewPayload({ rating, comment }, { partial: false });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO reviews (store_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
      [storeId, userId, Number(rating), comment]
    );
    await recomputeStoreAggregates(conn, storeId);
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('You have already reviewed this store');
    }
    throw err;
  } finally {
    conn.release();
  }
};

// Updates the rating/comment of an existing review and refreshes aggregates.
// Only the listed fields are writable; aggregates recompute even on a no-op so
// callers always see consistent values.
const updateReview = async (id, storeId, input = {}) => {
  validateReviewPayload(input, { partial: true });

  const sets = [];
  const values = [];
  if (input.rating !== undefined) {
    sets.push('rating = ?');
    values.push(Number(input.rating));
  }
  if (input.comment !== undefined) {
    sets.push('comment = ?');
    values.push(input.comment);
  }
  if (!sets.length) throw ApiError.badRequest('No updatable fields provided');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    values.push(id);
    const [result] = await conn.execute(
      `UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
    await recomputeStoreAggregates(conn, storeId);
    await conn.commit();
    return result.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// Deletes a review and refreshes the store aggregates in one transaction.
const deleteReview = async (id, storeId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute('DELETE FROM reviews WHERE id = ?', [id]);
    await recomputeStoreAggregates(conn, storeId);
    await conn.commit();
    return result.affectedRows;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  MIN_RATING,
  MAX_RATING,
  MAX_COMMENT_LENGTH,
  mapReviewRow,
  validateReviewPayload,
  recomputeStoreAggregates,
  findReviewById,
  findReviewByUserAndStore,
  listReviewsByStore,
  createReview,
  updateReview,
  deleteReview
};
