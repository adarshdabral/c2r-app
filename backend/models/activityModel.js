const db = require('../config/db');

/**
 * Unified activity timeline — aggregates a user's activity across existing
 * tables (pickups, drop-offs, rewards ledger, drive RSVPs, chatbot messages)
 * into one chronological feed with filtering, search, and pagination. Pure
 * reads; adds no tables.
 *
 * (Auth events aren't included — the platform keeps no login audit log; adding
 * one would touch the protected auth module.)
 */

// Each source contributes the same column shape so they UNION cleanly.
const UNION = `
  SELECT 'pickup' AS source, CONCAT('pickup_', pr.status) AS type,
         'Pickup request' AS title, pr.waste_category AS description,
         'pickup' AS ref_type, pr.id AS ref_id, pr.created_at AS at
    FROM pickup_requests pr WHERE pr.user_id = ?
  UNION ALL
  SELECT 'dropoff', CONCAT('dropoff_', dr.status), 'Drop-off request', dr.waste_category,
         'dropoff', dr.id, dr.created_at
    FROM dropoff_requests dr WHERE dr.user_id = ?
  UNION ALL
  SELECT 'reward', rl.event_type,
         CONCAT(IF(rl.delta >= 0, '+', ''), rl.delta, ' points'), rl.reason,
         'reward', rl.id, rl.created_at
    FROM reward_ledger rl WHERE rl.user_id = ?
  UNION ALL
  SELECT 'drive', 'drive_joined', CONCAT('Joined ', d.title), NULL,
         'drive', r.drive_id, r.created_at
    FROM collection_drive_rsvps r JOIN collection_drives d ON d.id = r.drive_id
   WHERE r.user_id = ? AND r.status = 'GOING'
  UNION ALL
  SELECT 'chatbot', 'message', 'You asked the assistant', cm.content,
         'chatbot', cm.id, cm.created_at
    FROM chat_messages cm WHERE cm.user_id = ? AND cm.role = 'user'
`;

// Distinct sources for the filter UI.
const SOURCES = ['pickup', 'dropoff', 'reward', 'drive', 'chatbot'];

const buildWhere = ({ source, search }) => {
  const where = [];
  const params = [];
  if (source && SOURCES.includes(source)) {
    where.push('t.source = ?');
    params.push(source);
  }
  if (search && String(search).trim()) {
    where.push('(t.title LIKE ? OR t.description LIKE ?)');
    const like = `%${String(search).trim()}%`;
    params.push(like, like);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

const timeline = async (userId, { source, search, limit = 20, offset = 0 } = {}) => {
  const uidParams = [userId, userId, userId, userId, userId];
  const { clause, params } = buildWhere({ source, search });

  const [rows] = await db.query(
    `SELECT t.source, t.type, t.title, t.description, t.ref_type, t.ref_id, t.at
       FROM ( ${UNION} ) t
       ${clause}
      ORDER BY t.at DESC LIMIT ? OFFSET ?`,
    [...uidParams, ...params, Number(limit), Number(offset)]
  );
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM ( ${UNION} ) t ${clause}`,
    [...uidParams, ...params]
  );

  return {
    rows: rows.map((r) => ({
      source: r.source,
      type: r.type,
      title: r.title,
      description: r.description,
      refType: r.ref_type,
      refId: r.ref_id,
      at: r.at,
    })),
    total: Number(total),
  };
};

module.exports = { timeline, SOURCES };
