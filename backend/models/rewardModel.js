const db = require('../config/db');
const { levelForPoints } = require('../utils/rewardMath');

/**
 * Reward accounts + ledger — the transactional core (system of record).
 *
 * Every balance change goes through appendTransaction(), which locks the account
 * row, writes an append-only ledger entry with the resulting balance_after, and
 * updates the cached balance/lifetime/level atomically. The unique key on
 * (event_type, ref_type, ref_id) makes ref'd earn events idempotent — awarding
 * the same pickup twice is a silent no-op.
 */

const mapAccount = (row) =>
  row
    ? {
        userId: row.user_id,
        pointsBalance: row.points_balance,
        lifetimePoints: row.lifetime_points,
        level: row.level,
        streakCount: row.streak_count,
        lastEarnDate: row.last_earn_date,
      }
    : null;

const getAccount = async (userId) => {
  const [rows] = await db.query('SELECT * FROM reward_accounts WHERE user_id = ? LIMIT 1', [userId]);
  return mapAccount(rows[0]);
};

const ensureAccount = async (userId) => {
  await db.execute('INSERT IGNORE INTO reward_accounts (user_id) VALUES (?)', [userId]);
  return getAccount(userId);
};

// Count how many times an event has been awarded to a user today (daily_cap).
const countEventToday = async (userId, eventType) => {
  const [[{ n }]] = await db.query(
    `SELECT COUNT(*) AS n FROM reward_ledger
      WHERE user_id = ? AND event_type = ? AND delta > 0 AND DATE(created_at) = CURDATE()`,
    [userId, eventType]
  );
  return n;
};

// Seconds since this user last earned via `eventType` (for cooldown), or null.
const secondsSinceLast = async (userId, eventType) => {
  const [rows] = await db.query(
    `SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS secs
       FROM reward_ledger WHERE user_id = ? AND event_type = ? AND delta > 0`,
    [userId, eventType]
  );
  return rows[0] && rows[0].secs != null ? Number(rows[0].secs) : null;
};

/**
 * Apply a balance change atomically. `tx`:
 *   { userId, delta, eventType, reason?, refType?, refId?, expiresAt?, createdBy?,
 *     meta?, streakCount?, lastEarnDate? }
 * Returns { applied:true, delta, balanceAfter, lifetime, level } — or
 * { applied:false, reason:'duplicate' } when the ref'd event already exists.
 * Throws ApiError-shaped { statusCode:400 } on overspend.
 */
const appendTransaction = async (tx) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('INSERT IGNORE INTO reward_accounts (user_id) VALUES (?)', [tx.userId]);
    const [[acct]] = await conn.query('SELECT * FROM reward_accounts WHERE user_id = ? FOR UPDATE', [
      tx.userId,
    ]);

    const delta = Math.trunc(Number(tx.delta) || 0);
    if (delta < 0 && acct.points_balance + delta < 0) {
      await conn.rollback();
      const err = new Error('Insufficient points');
      err.statusCode = 400;
      throw err;
    }

    const balanceAfter = acct.points_balance + delta;
    const lifetime = acct.lifetime_points + (delta > 0 ? delta : 0);
    const level = levelForPoints(lifetime);

    try {
      await conn.execute(
        `INSERT INTO reward_ledger
          (user_id, delta, balance_after, event_type, reason, ref_type, ref_id, expires_at, created_by, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tx.userId,
          delta,
          balanceAfter,
          tx.eventType,
          tx.reason ?? null,
          tx.refType ?? null,
          tx.refId ?? null,
          tx.expiresAt ?? null,
          tx.createdBy ?? null,
          tx.meta ? JSON.stringify(tx.meta) : null,
        ]
      );
    } catch (e) {
      if (e && e.code === 'ER_DUP_ENTRY') {
        await conn.rollback();
        return { applied: false, reason: 'duplicate' };
      }
      throw e;
    }

    await conn.execute(
      `UPDATE reward_accounts
          SET points_balance = ?, lifetime_points = ?, level = ?,
              streak_count = COALESCE(?, streak_count),
              last_earn_date = COALESCE(?, last_earn_date)
        WHERE user_id = ?`,
      [balanceAfter, lifetime, level, tx.streakCount ?? null, tx.lastEarnDate ?? null, tx.userId]
    );

    await conn.commit();
    return { applied: true, delta, balanceAfter, lifetime, level };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    conn.release();
  }
};

const mapLedger = (r) => ({
  id: r.id,
  delta: r.delta,
  balanceAfter: r.balance_after,
  eventType: r.event_type,
  reason: r.reason,
  refType: r.ref_type,
  refId: r.ref_id,
  expiresAt: r.expires_at,
  expired: !!r.expired,
  createdAt: r.created_at,
});

const listLedger = async (userId, { limit = 50, offset = 0 } = {}) => {
  const [rows] = await db.query(
    `SELECT * FROM reward_ledger WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [userId, Number(limit), Number(offset)]
  );
  return rows.map(mapLedger);
};

// Earn rows that have passed their expiry and haven't been clawed back yet.
const dueForExpiry = async () => {
  const [rows] = await db.query(
    `SELECT id, user_id, delta FROM reward_ledger
      WHERE expired = FALSE AND delta > 0 AND expires_at IS NOT NULL AND expires_at <= CURDATE()`
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id, delta: r.delta }));
};

const markExpired = async (ledgerId) => {
  await db.execute('UPDATE reward_ledger SET expired = TRUE WHERE id = ?', [ledgerId]);
};

// Top accounts by lifetime points (leaderboard). Names come from users.
const leaderboard = async (limit = 20) => {
  const [rows] = await db.query(
    `SELECT ra.user_id, ra.lifetime_points, ra.level, u.name
       FROM reward_accounts ra JOIN users u ON u.id = ra.user_id
      ORDER BY ra.lifetime_points DESC, ra.user_id ASC LIMIT ?`,
    [Number(limit)]
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    name: r.name,
    lifetimePoints: r.lifetime_points,
    level: r.level,
  }));
};

// Platform-wide reward analytics for the admin dashboard.
const analytics = async () => {
  const [[totals]] = await db.query(
    `SELECT
        (SELECT COUNT(*) FROM reward_accounts) AS accounts,
        (SELECT COALESCE(SUM(points_balance),0) FROM reward_accounts) AS pointsOutstanding,
        (SELECT COALESCE(SUM(delta),0) FROM reward_ledger WHERE delta > 0) AS pointsEarned,
        (SELECT COALESCE(-SUM(delta),0) FROM reward_ledger WHERE delta < 0) AS pointsSpent,
        (SELECT COUNT(*) FROM reward_redemptions) AS redemptions,
        (SELECT COUNT(*) FROM user_badges) AS badgesAwarded`
  );
  const [byEvent] = await db.query(
    `SELECT event_type AS eventType, COUNT(*) AS count, COALESCE(SUM(delta),0) AS points
       FROM reward_ledger WHERE delta > 0 GROUP BY event_type ORDER BY points DESC`
  );
  return {
    accounts: Number(totals.accounts),
    pointsOutstanding: Number(totals.pointsOutstanding),
    pointsEarned: Number(totals.pointsEarned),
    pointsSpent: Number(totals.pointsSpent),
    redemptions: Number(totals.redemptions),
    badgesAwarded: Number(totals.badgesAwarded),
    byEvent,
  };
};

// Rows for CSV export (admin). Joined with the account owner's name.
const exportRows = async () => {
  const [rows] = await db.query(
    `SELECT rl.created_at, rl.user_id, u.name, rl.event_type, rl.delta, rl.balance_after,
            rl.reason, rl.ref_type, rl.ref_id, rl.expired
       FROM reward_ledger rl LEFT JOIN users u ON u.id = rl.user_id
      ORDER BY rl.created_at ASC, rl.id ASC`
  );
  return rows;
};

module.exports = {
  getAccount,
  ensureAccount,
  countEventToday,
  secondsSinceLast,
  appendTransaction,
  listLedger,
  dueForExpiry,
  markExpired,
  leaderboard,
  analytics,
  exportRows,
};
