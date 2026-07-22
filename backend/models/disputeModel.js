const db = require('../config/db');
const ApiError = require('../utils/ApiError');

const REQUEST_TYPES = ['pickup', 'dropoff'];
const DISPUTE_STATUSES = ['OPEN', 'RESOLVED', 'REJECTED'];
const RESOLUTION_STATUSES = ['RESOLVED', 'REJECTED'];

// request_type -> { table, recyclerCol } so we can validate the target request
// and the raiser's involvement generically (mirrors the OTP layer's map).
const REQUEST_TABLES = {
  pickup: { table: 'pickup_requests', recyclerCol: 'assigned_recycler_id' },
  dropoff: { table: 'dropoff_requests', recyclerCol: 'recycler_id' }
};

const mapDisputeRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    requestType: row.request_type,
    requestId: row.request_id,
    raisedBy: row.raised_by,
    raisedByRole: row.raised_by_role,
    reason: row.reason,
    status: row.status,
    resolutionNote: row.resolution_note,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    ...(row.raiser_name !== undefined ? { raiserName: row.raiser_name } : {}),
    ...(row.resolver_name !== undefined ? { resolverName: row.resolver_name } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * Raises a dispute against a pickup/dropoff request. Validates the request
 * exists and that the raiser is a party to it (the owning user or the assigned
 * recycler). Blocks a second OPEN dispute by the same person on the same request.
 */
const createDispute = async ({ requestType, requestId, raisedBy, raisedByRole, reason }) => {
  if (!REQUEST_TYPES.includes(requestType)) {
    throw ApiError.badRequest(`requestType must be one of: ${REQUEST_TYPES.join(', ')}`);
  }
  if (!Number.isInteger(Number(requestId)) || Number(requestId) <= 0) {
    throw ApiError.badRequest('A valid requestId is required');
  }
  if (!reason || String(reason).trim().length < 5) {
    throw ApiError.badRequest('reason is required and must be at least 5 characters');
  }
  if (String(reason).length > 1000) {
    throw ApiError.badRequest('reason must be at most 1000 characters');
  }

  const { table, recyclerCol } = REQUEST_TABLES[requestType];
  const [[reqRow]] = await db.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [requestId]);
  if (!reqRow) throw ApiError.notFound('Request not found');

  // The raiser must be a party to the request.
  const isParty = reqRow.user_id === raisedBy || reqRow[recyclerCol] === raisedBy;
  if (!isParty) throw ApiError.forbidden('You are not a party to this request');

  const [[existing]] = await db.query(
    `SELECT id FROM disputes
     WHERE request_type = ? AND request_id = ? AND raised_by = ? AND status = 'OPEN' LIMIT 1`,
    [requestType, requestId, raisedBy]
  );
  if (existing) throw ApiError.conflict('You already have an open dispute for this request');

  const [result] = await db.execute(
    `INSERT INTO disputes (request_type, request_id, raised_by, raised_by_role, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [requestType, requestId, raisedBy, raisedByRole, String(reason).trim()]
  );
  return result.insertId;
};

const DISPUTE_SELECT = `
  d.id, d.request_type, d.request_id, d.raised_by, d.raised_by_role, d.reason,
  d.status, d.resolution_note, d.resolved_by, d.resolved_at, d.created_at, d.updated_at,
  raiser.name AS raiser_name,
  resolver.name AS resolver_name
`;
const DISPUTE_JOINS = `
  JOIN users raiser ON raiser.id = d.raised_by
  LEFT JOIN users resolver ON resolver.id = d.resolved_by
`;

const getDisputeById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${DISPUTE_SELECT} FROM disputes d ${DISPUTE_JOINS} WHERE d.id = ? LIMIT 1`,
    [id]
  );
  return mapDisputeRow(rows[0]);
};

// Admin: all disputes (optional status filter), newest first, paginated.
const listForAdmin = async ({ status, limit = 20, offset = 0 } = {}) => {
  const where = [];
  const values = [];
  if (status && DISPUTE_STATUSES.includes(status)) {
    where.push('d.status = ?');
    values.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM disputes d ${whereSql}`, values);
  const [rows] = await db.query(
    `SELECT ${DISPUTE_SELECT} FROM disputes d ${DISPUTE_JOINS} ${whereSql}
     ORDER BY (d.status = 'OPEN') DESC, d.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return { rows: rows.map(mapDisputeRow), total };
};

// Disputes raised by a given user (their own view).
const listForRaiser = async (userId) => {
  const [rows] = await db.query(
    `SELECT ${DISPUTE_SELECT} FROM disputes d ${DISPUTE_JOINS}
     WHERE d.raised_by = ? ORDER BY d.created_at DESC`,
    [userId]
  );
  return rows.map(mapDisputeRow);
};

// Admin resolves (or rejects) an open dispute with a note.
const resolveDispute = async (id, adminId, { status, resolutionNote }) => {
  if (!RESOLUTION_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${RESOLUTION_STATUSES.join(', ')}`);
  }
  if (resolutionNote && String(resolutionNote).length > 1000) {
    throw ApiError.badRequest('resolutionNote must be at most 1000 characters');
  }
  const existing = await getDisputeById(id);
  if (!existing) throw ApiError.notFound('Dispute not found');
  if (existing.status !== 'OPEN') {
    throw ApiError.badRequest(`This dispute is already ${existing.status.toLowerCase()}`);
  }
  await db.execute(
    `UPDATE disputes
       SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = NOW()
     WHERE id = ?`,
    [status, resolutionNote ? String(resolutionNote).trim() : null, adminId, id]
  );
  return getDisputeById(id);
};

module.exports = {
  REQUEST_TYPES,
  DISPUTE_STATUSES,
  RESOLUTION_STATUSES,
  mapDisputeRow,
  createDispute,
  getDisputeById,
  listForAdmin,
  listForRaiser,
  resolveDispute
};
