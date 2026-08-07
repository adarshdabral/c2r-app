const db = require('../config/db');

/** Badge definitions + per-user awards. */

const mapBadge = (r) => ({
  code: r.code,
  name: r.name,
  description: r.description,
  icon: r.icon,
  criteriaType: r.criteria_type,
  criteriaEvent: r.criteria_event,
  threshold: r.threshold,
  tier: r.tier,
  sortOrder: r.sort_order,
});

const listBadges = async () => {
  const [rows] = await db.query('SELECT * FROM badges WHERE enabled = TRUE ORDER BY sort_order ASC');
  return rows.map(mapBadge);
};

const listUserBadges = async (userId) => {
  const [rows] = await db.query(
    `SELECT b.*, ub.awarded_at
       FROM user_badges ub JOIN badges b ON b.code = ub.badge_code
      WHERE ub.user_id = ? ORDER BY ub.awarded_at DESC`,
    [userId]
  );
  return rows.map((r) => ({ ...mapBadge(r), awardedAt: r.awarded_at }));
};

// Award a badge; returns true only if it was newly granted (idempotent).
const awardBadge = async (userId, badgeCode) => {
  const [res] = await db.execute(
    'INSERT IGNORE INTO user_badges (user_id, badge_code) VALUES (?, ?)',
    [userId, badgeCode]
  );
  return res.affectedRows > 0;
};

// How many times a user has earned via an event (for event_count criteria).
const eventCount = async (userId, eventType) => {
  const [[{ n }]] = await db.query(
    'SELECT COUNT(*) AS n FROM reward_ledger WHERE user_id = ? AND event_type = ? AND delta > 0',
    [userId, eventType]
  );
  return n;
};

module.exports = { listBadges, listUserBadges, awardBadge, eventCount };
