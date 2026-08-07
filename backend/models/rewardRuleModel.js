const db = require('../config/db');

/** Admin-editable earning rules (one row per event_type). */

const mapRule = (r) =>
  r
    ? {
        eventType: r.event_type,
        points: r.points,
        per_kg: !!r.per_kg,
        enabled: !!r.enabled,
        dailyCap: r.daily_cap,
        cooldownSeconds: r.cooldown_seconds,
        expiresDays: r.expires_days,
        description: r.description,
        updatedAt: r.updated_at,
      }
    : null;

const getRule = async (eventType) => {
  const [rows] = await db.query('SELECT * FROM reward_rules WHERE event_type = ? LIMIT 1', [eventType]);
  return mapRule(rows[0]);
};

const listRules = async () => {
  const [rows] = await db.query('SELECT * FROM reward_rules ORDER BY event_type ASC');
  return rows.map(mapRule);
};

// Partial update; only provided fields are written.
const updateRule = async (eventType, patch = {}) => {
  const map = {
    points: 'points',
    perKg: 'per_kg',
    enabled: 'enabled',
    dailyCap: 'daily_cap',
    cooldownSeconds: 'cooldown_seconds',
    expiresDays: 'expires_days',
    description: 'description',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(typeof patch[key] === 'boolean' ? (patch[key] ? 1 : 0) : patch[key]);
    }
  }
  if (!sets.length) return getRule(eventType);
  params.push(eventType);
  await db.execute(`UPDATE reward_rules SET ${sets.join(', ')} WHERE event_type = ?`, params);
  return getRule(eventType);
};

module.exports = { getRule, listRules, updateRule };
