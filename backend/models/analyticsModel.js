const db = require('../config/db');

/**
 * Platform analytics queries (admin). Shared by the chatbot's platform-health
 * action and the Admin Analytics module. Pure reads over existing tables.
 */

// Headline platform-health counts.
const platformHealth = async () => {
  const [[row]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'recycler') AS recyclers,
      (SELECT COUNT(*) FROM users WHERE is_suspended = TRUE) AS suspended,
      (SELECT COUNT(*) FROM stores) AS stores,
      (SELECT COUNT(*) FROM stores WHERE verification_status = 'Pending') AS storesPending,
      (SELECT COUNT(*) FROM disputes WHERE status = 'OPEN') AS openDisputes,
      (SELECT COUNT(*) FROM pickup_requests WHERE DATE(created_at) = CURDATE()) AS pickupsToday,
      (SELECT COUNT(*) FROM pickup_requests WHERE status = 'COMPLETED') AS pickupsCompleted
  `);
  return {
    users: Number(row.users),
    recyclers: Number(row.recyclers),
    suspended: Number(row.suspended),
    stores: Number(row.stores),
    storesPending: Number(row.storesPending),
    openDisputes: Number(row.openDisputes),
    pickupsToday: Number(row.pickupsToday),
    pickupsCompleted: Number(row.pickupsCompleted),
  };
};

// Active-user counts (distinct users who created a pickup/dropoff in a window).
const activeUsers = async (days) => {
  const [[{ n }]] = await db.query(
    `SELECT COUNT(DISTINCT user_id) AS n FROM (
        SELECT user_id, created_at FROM pickup_requests
        UNION ALL SELECT user_id, created_at FROM dropoff_requests
     ) t WHERE created_at >= (NOW() - INTERVAL ? DAY)`,
    [Number(days)]
  );
  return n;
};

// Role distribution.
const roleDistribution = async () => {
  const [rows] = await db.query('SELECT role, COUNT(*) AS n FROM users GROUP BY role');
  return rows.map((r) => ({ role: r.role, count: Number(r.n) }));
};

// New users per day over the last N days (user growth series).
const userGrowth = async (days = 14) => {
  const [rows] = await db.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS n FROM users
      WHERE created_at >= (NOW() - INTERVAL ? DAY)
      GROUP BY DATE(created_at) ORDER BY day ASC`,
    [Number(days)]
  );
  return rows.map((r) => ({ day: String(r.day).slice(0, 10), count: Number(r.n) }));
};

// Pickups per day (volume series) + status breakdown.
const pickupSeries = async (days = 14) => {
  const [rows] = await db.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS n FROM pickup_requests
      WHERE created_at >= (NOW() - INTERVAL ? DAY)
      GROUP BY DATE(created_at) ORDER BY day ASC`,
    [Number(days)]
  );
  return rows.map((r) => ({ day: String(r.day).slice(0, 10), count: Number(r.n) }));
};

// Recycling volume (kg) from completed pickups + dropoffs.
const recyclingVolume = async () => {
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(kg), 0) AS totalKg, COUNT(*) AS completed FROM (
        SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg FROM pickup_requests WHERE status = 'COMPLETED'
        UNION ALL
        SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg FROM dropoff_requests WHERE status = 'COMPLETED'
     ) t`
  );
  return { totalKg: Math.round(Number(row.totalKg) * 10) / 10, completed: Number(row.completed) };
};

// Platform-wide collection-drive totals.
const driveTotals = async () => {
  const [[d]] = await db.query(`
    SELECT COUNT(*) AS drives,
           COALESCE(SUM(status = 'UPCOMING'), 0) AS upcoming,
           COALESCE(SUM(status = 'COMPLETED'), 0) AS completed
      FROM collection_drives
  `);
  const [[r]] = await db.query(`
    SELECT COALESCE(SUM(status = 'GOING'), 0) AS rsvps,
           COALESCE(SUM(status = 'GOING' AND checked_in_at IS NOT NULL), 0) AS checkedIn
      FROM collection_drive_rsvps
  `);
  return {
    drives: Number(d.drives),
    upcoming: Number(d.upcoming),
    completed: Number(d.completed),
    rsvps: Number(r.rsvps),
    checkedIn: Number(r.checkedIn),
  };
};

// Chatbot usage.
const chatbotUsage = async () => {
  const [[row]] = await db.query(`
    SELECT (SELECT COUNT(*) FROM chat_messages WHERE role = 'user') AS messages,
           (SELECT COUNT(*) FROM chat_conversations) AS conversations,
           (SELECT COUNT(DISTINCT user_id) FROM chat_messages) AS users
  `);
  return { messages: Number(row.messages), conversations: Number(row.conversations), users: Number(row.users) };
};

// Feature usage — enabled state (from feature_flags) + an activity count per
// feature where one is measurable.
const featureUsage = async () => {
  const [flags] = await db.query('SELECT `key`, name, enabled FROM feature_flags ORDER BY id');
  const [[counts]] = await db.query(`
    SELECT (SELECT COUNT(*) FROM chat_messages WHERE role = 'user') AS chatbot,
           (SELECT COUNT(*) FROM reward_ledger) AS rewards,
           (SELECT COUNT(*) FROM notifications) AS notifications
  `);
  const usageFor = { chatbot: Number(counts.chatbot), rewards: Number(counts.rewards), notifications: Number(counts.notifications) };
  return flags.map((f) => ({
    key: f.key,
    name: f.name,
    enabled: !!f.enabled,
    usage: usageFor[f.key] ?? null,
  }));
};

module.exports = {
  platformHealth,
  activeUsers,
  roleDistribution,
  userGrowth,
  pickupSeries,
  recyclingVolume,
  driveTotals,
  chatbotUsage,
  featureUsage,
};
