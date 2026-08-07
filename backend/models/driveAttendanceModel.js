const db = require('../config/db');

/**
 * Drive attendance + analytics queries (reads the existing collection_drive_rsvps
 * / collection_drives tables; additive to the drives module).
 */

// A single user's RSVP row for a drive (or null).
const getRsvp = async (driveId, userId) => {
  const [rows] = await db.query(
    'SELECT drive_id, user_id, status, checked_in_at FROM collection_drive_rsvps WHERE drive_id = ? AND user_id = ? LIMIT 1',
    [driveId, userId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { driveId: r.drive_id, userId: r.user_id, status: r.status, checkedInAt: r.checked_in_at };
};

// Mark a GOING attendee checked-in (idempotent). Returns true if newly checked in.
const checkIn = async (driveId, userId) => {
  const [res] = await db.execute(
    `UPDATE collection_drive_rsvps SET checked_in_at = NOW()
      WHERE drive_id = ? AND user_id = ? AND status = 'GOING' AND checked_in_at IS NULL`,
    [driveId, userId]
  );
  return res.affectedRows > 0;
};

// Per-drive attendance analytics.
const driveAnalytics = async (driveId) => {
  const [[row]] = await db.query(
    `SELECT
        (SELECT capacity FROM collection_drives WHERE id = ?) AS capacity,
        COALESCE(SUM(status = 'GOING'), 0) AS going,
        COALESCE(SUM(status = 'GOING' AND checked_in_at IS NOT NULL), 0) AS checkedIn,
        COALESCE(SUM(status = 'CANCELLED'), 0) AS cancelled
       FROM collection_drive_rsvps WHERE drive_id = ?`,
    [driveId, driveId]
  );
  const going = Number(row.going);
  const checkedIn = Number(row.checkedIn);
  const capacity = row.capacity == null ? null : Number(row.capacity);
  return {
    capacity,
    going,
    checkedIn,
    cancelled: Number(row.cancelled),
    attendanceRate: going > 0 ? Math.round((checkedIn / going) * 100) : 0,
    capacityUsedPct: capacity ? Math.round((going / capacity) * 100) : null,
  };
};

// Aggregate analytics across all drives a host runs.
const hostingAnalytics = async (hostId) => {
  const [[row]] = await db.query(
    `SELECT
        COUNT(DISTINCT d.id) AS drives,
        COALESCE(SUM(d.status = 'UPCOMING'), 0) AS upcoming,
        COALESCE(SUM(d.status = 'COMPLETED'), 0) AS completed
       FROM collection_drives d WHERE d.host_id = ?`,
    [hostId]
  );
  const [[att]] = await db.query(
    `SELECT
        COALESCE(SUM(r.status = 'GOING'), 0) AS totalGoing,
        COALESCE(SUM(r.status = 'GOING' AND r.checked_in_at IS NOT NULL), 0) AS totalCheckedIn
       FROM collection_drive_rsvps r
       JOIN collection_drives d ON d.id = r.drive_id
      WHERE d.host_id = ?`,
    [hostId]
  );
  const totalGoing = Number(att.totalGoing);
  const totalCheckedIn = Number(att.totalCheckedIn);
  return {
    drives: Number(row.drives),
    upcoming: Number(row.upcoming),
    completed: Number(row.completed),
    totalGoing,
    totalCheckedIn,
    avgAttendanceRate: totalGoing > 0 ? Math.round((totalCheckedIn / totalGoing) * 100) : 0,
  };
};

module.exports = { getRsvp, checkIn, driveAnalytics, hostingAnalytics };
