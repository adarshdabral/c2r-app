const db = require('../config/db');
const ApiError = require('../utils/ApiError');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DRIVE_STATUSES = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];

const mapDrive = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    hostId: row.host_id,
    hostRole: row.host_role,
    ...(row.host_name !== undefined ? { hostName: row.host_name } : {}),
    title: row.title,
    description: row.description,
    address: row.address,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    scheduledDate: row.scheduled_date,
    timeWindow: row.time_window,
    acceptedCategories: row.accepted_categories ? String(row.accepted_categories).split(',') : [],
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    ...(row.going_count !== undefined ? { goingCount: Number(row.going_count) } : {}),
    ...(row.my_rsvp !== undefined ? { myRsvp: row.my_rsvp || null } : {}),
    ...(row.distance !== undefined && row.distance !== null
      ? { distanceKm: Math.round(Number(row.distance) * 10) / 10 }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// Haversine distance expression (Earth radius 6371 km). Bind order: lat, lng, lat.
const DISTANCE_EXPR = `
  (6371 * ACOS(LEAST(1,
    COS(RADIANS(?)) * COS(RADIANS(d.latitude)) *
    COS(RADIANS(d.longitude) - RADIANS(?)) +
    SIN(RADIANS(?)) * SIN(RADIANS(d.latitude))
  )))`;

const SELECT_BASE = `
  d.id, d.host_id, d.host_role, d.title, d.description, d.address,
  d.latitude, d.longitude, DATE_FORMAT(d.scheduled_date, '%Y-%m-%d') AS scheduled_date,
  d.time_window, d.accepted_categories, d.capacity, d.status, d.created_at, d.updated_at,
  h.name AS host_name,
  (SELECT COUNT(*) FROM collection_drive_rsvps r WHERE r.drive_id = d.id AND r.status = 'GOING') AS going_count
`;

const validate = (input) => {
  if (!input.title || String(input.title).trim().length < 2) {
    throw ApiError.badRequest('title is required');
  }
  if (!input.address || String(input.address).trim().length < 3) {
    throw ApiError.badRequest('address is required');
  }
  if (!input.scheduledDate || !DATE_RE.test(String(input.scheduledDate))) {
    throw ApiError.badRequest('scheduledDate is required and must be YYYY-MM-DD');
  }
  if (input.capacity != null && (!Number.isInteger(Number(input.capacity)) || Number(input.capacity) <= 0)) {
    throw ApiError.badRequest('capacity must be a positive integer');
  }
};

const createDrive = async (hostId, hostRole, input) => {
  validate(input);
  const categories = Array.isArray(input.acceptedCategories)
    ? input.acceptedCategories.filter(Boolean).join(',')
    : null;
  const [res] = await db.execute(
    `INSERT INTO collection_drives
      (host_id, host_role, title, description, address, latitude, longitude,
       scheduled_date, time_window, accepted_categories, capacity, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPCOMING')`,
    [
      hostId,
      hostRole,
      String(input.title).trim(),
      input.description ? String(input.description).trim() : null,
      String(input.address).trim(),
      input.latitude != null ? Number(input.latitude) : null,
      input.longitude != null ? Number(input.longitude) : null,
      input.scheduledDate,
      input.timeWindow ? String(input.timeWindow).trim() : null,
      categories,
      input.capacity != null ? Number(input.capacity) : null,
    ]
  );
  return res.insertId;
};

// Browse for a user. Not distance-filtered — coords only sort + label.
const listForUser = async (userId, { status, lat, lng, limit = 50, offset = 0 } = {}) => {
  const hasGeo = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const where = [];
  const values = [];
  // Default: upcoming + ongoing (browsable). Explicit status overrides.
  if (status && DRIVE_STATUSES.includes(status)) {
    where.push('d.status = ?');
    values.push(status);
  } else {
    where.push("d.status IN ('UPCOMING', 'ONGOING')");
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const distSelect = hasGeo ? `, ${DISTANCE_EXPR} AS distance` : '';
  const orderBy = hasGeo ? 'ORDER BY d.scheduled_date ASC, distance ASC' : 'ORDER BY d.scheduled_date ASC';

  // Bind order: my_rsvp(userId), [distance: lat,lng,lat], where values, limit, offset
  const binds = [userId];
  if (hasGeo) binds.push(Number(lat), Number(lng), Number(lat));
  binds.push(...values, Number(limit), Number(offset));

  const [rows] = await db.query(
    `SELECT ${SELECT_BASE},
       (SELECT status FROM collection_drive_rsvps r WHERE r.drive_id = d.id AND r.user_id = ?) AS my_rsvp
       ${distSelect}
     FROM collection_drives d
     JOIN users h ON h.id = d.host_id
     ${whereSql}
     ${orderBy}
     LIMIT ? OFFSET ?`,
    binds
  );
  return rows.map(mapDrive);
};

const getById = async (id, userId = null) => {
  const [rows] = await db.query(
    `SELECT ${SELECT_BASE},
       (SELECT status FROM collection_drive_rsvps r WHERE r.drive_id = d.id AND r.user_id = ?) AS my_rsvp
     FROM collection_drives d
     JOIN users h ON h.id = d.host_id
     WHERE d.id = ? LIMIT 1`,
    [userId, id]
  );
  return mapDrive(rows[0]);
};

const listForHost = async (hostId) => {
  const [rows] = await db.query(
    `SELECT ${SELECT_BASE}
     FROM collection_drives d
     JOIN users h ON h.id = d.host_id
     WHERE d.host_id = ?
     ORDER BY d.scheduled_date DESC`,
    [hostId]
  );
  return rows.map(mapDrive);
};

const getRaw = async (id) => {
  const [rows] = await db.execute('SELECT * FROM collection_drives WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
};

const updateStatus = async (id, status) => {
  await db.execute('UPDATE collection_drives SET status = ? WHERE id = ?', [status, id]);
};

// RSVP (idempotent upsert to GOING). Enforces capacity.
const rsvp = async (driveId, userId) => {
  const drive = await getRaw(driveId);
  if (!drive) throw ApiError.notFound('Drive not found');
  if (['COMPLETED', 'CANCELLED'].includes(drive.status)) {
    throw ApiError.badRequest(`This drive is ${drive.status.toLowerCase()} — RSVP is closed`);
  }
  if (drive.capacity != null) {
    const [[{ n }]] = await db.query(
      "SELECT COUNT(*) AS n FROM collection_drive_rsvps WHERE drive_id = ? AND status = 'GOING' AND user_id <> ?",
      [driveId, userId]
    );
    if (n >= drive.capacity) throw ApiError.conflict('This drive is full');
  }
  await db.execute(
    `INSERT INTO collection_drive_rsvps (drive_id, user_id, status) VALUES (?, ?, 'GOING')
     ON DUPLICATE KEY UPDATE status = 'GOING'`,
    [driveId, userId]
  );
};

const cancelRsvp = async (driveId, userId) => {
  await db.execute(
    "UPDATE collection_drive_rsvps SET status = 'CANCELLED' WHERE drive_id = ? AND user_id = ?",
    [driveId, userId]
  );
};

const listAttendees = async (driveId) => {
  const [rows] = await db.query(
    `SELECT r.user_id, r.created_at, u.name, u.email
     FROM collection_drive_rsvps r JOIN users u ON u.id = r.user_id
     WHERE r.drive_id = ? AND r.status = 'GOING' ORDER BY r.created_at`,
    [driveId]
  );
  return rows.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, rsvpAt: r.created_at }));
};

const myDrives = async (userId) => {
  const [rows] = await db.query(
    `SELECT ${SELECT_BASE}, 'GOING' AS my_rsvp
     FROM collection_drives d
     JOIN users h ON h.id = d.host_id
     JOIN collection_drive_rsvps r ON r.drive_id = d.id AND r.user_id = ? AND r.status = 'GOING'
     ORDER BY d.scheduled_date ASC`,
    [userId]
  );
  return rows.map(mapDrive);
};

module.exports = {
  DRIVE_STATUSES,
  createDrive,
  listForUser,
  getById,
  listForHost,
  getRaw,
  updateStatus,
  rsvp,
  cancelRsvp,
  listAttendees,
  myDrives,
};
