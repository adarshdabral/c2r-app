const db = require('../config/db');

/** Notification repository — in-app notifications (email/push-ready via channel). */

const mapRow = (r) => ({
  id: r.id,
  category: r.category,
  type: r.type,
  title: r.title,
  body: r.body,
  data: r.data || null,
  channel: r.channel,
  read: !!r.read_at,
  readAt: r.read_at,
  createdAt: r.created_at,
});

const create = async ({ userId, category, type, title, body, data, channel = 'in_app' }) => {
  const [res] = await db.execute(
    `INSERT INTO notifications (user_id, category, type, title, body, data, channel)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, category, type, title, body ?? null, data ? JSON.stringify(data) : null, channel]
  );
  return res.insertId;
};

// Fan out one payload to many recipients (admin broadcast). Batched insert.
const createMany = async (userIds, { category, type, title, body, data, channel = 'in_app' }) => {
  if (!userIds.length) return 0;
  const values = userIds.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  for (const uid of userIds) {
    params.push(uid, category, type, title, body ?? null, data ? JSON.stringify(data) : null, channel);
  }
  const [res] = await db.execute(
    `INSERT INTO notifications (user_id, category, type, title, body, data, channel) VALUES ${values}`,
    params
  );
  return res.affectedRows;
};

const listForUser = async (userId, { limit = 20, offset = 0, category, unreadOnly = false } = {}) => {
  const where = ['user_id = ?'];
  const params = [userId];
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (unreadOnly) where.push('read_at IS NULL');
  const [rows] = await db.query(
    `SELECT * FROM notifications WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${where.join(' AND ')}`,
    params
  );
  return { rows: rows.map(mapRow), total: Number(total) };
};

const unreadCount = async (userId) => {
  const [[{ n }]] = await db.query(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return n;
};

const markRead = async (id, userId) => {
  const [res] = await db.execute(
    'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
    [id, userId]
  );
  return res.affectedRows > 0;
};

const markAllRead = async (userId) => {
  const [res] = await db.execute(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  return res.affectedRows;
};

// Active (non-suspended) recipient ids, optionally filtered by role — for admin
// broadcasts.
const recipientIds = async (role) => {
  const [rows] = role
    ? await db.query('SELECT id FROM users WHERE role = ? AND is_suspended = FALSE', [role])
    : await db.query('SELECT id FROM users WHERE is_suspended = FALSE');
  return rows.map((r) => r.id);
};

module.exports = { create, createMany, listForUser, unreadCount, markRead, markAllRead, recipientIds };
