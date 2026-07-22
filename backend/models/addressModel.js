const db = require('../config/db');

// Saved pickup addresses for a citizen. A user has many; exactly one may be the
// default (enforced in code: setting/creating a default clears the others).

const mapRow = (row) => ({
  id: row.id,
  label: row.label,
  address: row.address,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  isDefault: row.is_default === 1 || row.is_default === true,
  createdAt: row.created_at
});

const listAddresses = async (userId) => {
  const [rows] = await db.execute(
    `SELECT id, label, address, latitude, longitude, is_default, created_at
       FROM user_addresses
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return rows.map(mapRow);
};

const findAddress = async (id, userId) => {
  const [rows] = await db.execute(
    `SELECT id, label, address, latitude, longitude, is_default, created_at
       FROM user_addresses WHERE id = ? AND user_id = ? LIMIT 1`,
    [id, userId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
};

const clearDefault = async (userId, conn = db) => {
  await conn.execute(
    'UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?',
    [userId]
  );
};

const countAddresses = async (userId) => {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS n FROM user_addresses WHERE user_id = ?',
    [userId]
  );
  return Number(rows[0].n);
};

const createAddress = async (userId, { label, address, latitude, longitude, isDefault }) => {
  // First address is always the default; otherwise honour the flag.
  const existing = await countAddresses(userId);
  const makeDefault = isDefault || existing === 0;
  if (makeDefault) await clearDefault(userId);

  const [result] = await db.execute(
    `INSERT INTO user_addresses (user_id, label, address, latitude, longitude, is_default)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, label, address, latitude, longitude, makeDefault]
  );
  return findAddress(result.insertId, userId);
};

const updateAddress = async (id, userId, { label, address, latitude, longitude, isDefault }) => {
  if (isDefault) await clearDefault(userId);
  const [result] = await db.execute(
    `UPDATE user_addresses
        SET label = ?, address = ?, latitude = ?, longitude = ?, is_default = ?
      WHERE id = ? AND user_id = ?`,
    [label, address, latitude, longitude, !!isDefault, id, userId]
  );
  if (result.affectedRows === 0) return null;
  return findAddress(id, userId);
};

const setDefaultAddress = async (id, userId) => {
  const target = await findAddress(id, userId);
  if (!target) return null;
  await clearDefault(userId);
  await db.execute(
    'UPDATE user_addresses SET is_default = TRUE WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return findAddress(id, userId);
};

const deleteAddress = async (id, userId) => {
  const target = await findAddress(id, userId);
  if (!target) return false;
  await db.execute('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [id, userId]);
  // If we removed the default, promote the most recent remaining address.
  if (target.isDefault) {
    const [rows] = await db.execute(
      'SELECT id FROM user_addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    if (rows[0]) {
      await db.execute('UPDATE user_addresses SET is_default = TRUE WHERE id = ?', [rows[0].id]);
    }
  }
  return true;
};

module.exports = {
  listAddresses,
  findAddress,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress
};
