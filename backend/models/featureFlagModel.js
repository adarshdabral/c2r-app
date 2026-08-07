const db = require('../config/db');

/**
 * feature_flags table access — the single source of truth for platform feature
 * state. `key` is a reserved word in MySQL, hence the backticks throughout.
 */

const mapFlag = (r) => ({
  key: r.key,
  name: r.name,
  description: r.description,
  enabled: !!r.enabled,
  updatedBy: r.updated_by,
  updatedByName: r.updated_by_name || null,
  updatedAt: r.updated_at,
});

// Full rows incl. metadata + who last changed each (admin dashboard).
const listFlags = async () => {
  const [rows] = await db.query(
    `SELECT ff.*, u.name AS updated_by_name
       FROM feature_flags ff
       LEFT JOIN users u ON u.id = ff.updated_by
      ORDER BY ff.id ASC`
  );
  return rows.map(mapFlag);
};

const getFlag = async (key) => {
  const [rows] = await db.query(
    `SELECT ff.*, u.name AS updated_by_name
       FROM feature_flags ff LEFT JOIN users u ON u.id = ff.updated_by
      WHERE ff.\`key\` = ? LIMIT 1`,
    [key]
  );
  return rows[0] ? mapFlag(rows[0]) : null;
};

// Lightweight { key: enabled } map for the resolver / public endpoint.
const getEnabledMap = async () => {
  const [rows] = await db.query('SELECT `key`, enabled FROM feature_flags');
  const map = {};
  for (const r of rows) map[r.key] = !!r.enabled;
  return map;
};

// Flip a flag; records who changed it. Returns the updated row (or null).
const setEnabled = async (key, enabled, updatedBy) => {
  const [res] = await db.execute(
    'UPDATE feature_flags SET enabled = ?, updated_by = ? WHERE `key` = ?',
    [enabled ? 1 : 0, updatedBy ?? null, key]
  );
  if (res.affectedRows === 0) return null;
  return getFlag(key);
};

// Idempotent seed — inserts a row only if the key doesn't already exist, so an
// admin's saved state is never overwritten on reboot.
const seedDefault = async ({ key, name, description, default: def }) => {
  await db.execute(
    'INSERT IGNORE INTO feature_flags (`key`, name, description, enabled) VALUES (?, ?, ?, ?)',
    [key, name, description, def ? 1 : 0]
  );
};

module.exports = { listFlags, getFlag, getEnabledMap, setEnabled, seedDefault };
