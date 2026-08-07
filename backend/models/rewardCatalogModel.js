const db = require('../config/db');

/** Redeemable catalog + redemption records. */

const mapItem = (r) => ({
  code: r.code,
  name: r.name,
  description: r.description,
  pointsCost: r.points_cost,
  stock: r.stock,
  enabled: !!r.enabled,
  sortOrder: r.sort_order,
});

const listCatalog = async ({ activeOnly = true } = {}) => {
  const [rows] = await db.query(
    `SELECT * FROM reward_catalog ${activeOnly ? 'WHERE enabled = TRUE' : ''} ORDER BY sort_order ASC`
  );
  return rows.map(mapItem);
};

const getCatalogItem = async (code) => {
  const [rows] = await db.query('SELECT * FROM reward_catalog WHERE code = ? LIMIT 1', [code]);
  return rows[0] ? mapItem(rows[0]) : null;
};

// Atomically decrement stock when stock is tracked. Returns false if sold out.
const decrementStock = async (code) => {
  const [res] = await db.execute(
    'UPDATE reward_catalog SET stock = stock - 1 WHERE code = ? AND stock IS NOT NULL AND stock > 0',
    [code]
  );
  return res.affectedRows > 0;
};

const createRedemption = async ({ userId, catalogCode, pointsSpent, voucherCode }) => {
  const [res] = await db.execute(
    `INSERT INTO reward_redemptions (user_id, catalog_code, points_spent, voucher_code, status)
     VALUES (?, ?, ?, ?, 'REQUESTED')`,
    [userId, catalogCode, pointsSpent, voucherCode ?? null]
  );
  return res.insertId;
};

const mapRedemption = (r) => ({
  id: r.id,
  catalogCode: r.catalog_code,
  name: r.name || r.catalog_code,
  pointsSpent: r.points_spent,
  status: r.status,
  voucherCode: r.voucher_code,
  createdAt: r.created_at,
});

const listRedemptions = async (userId) => {
  const [rows] = await db.query(
    `SELECT rr.*, rc.name FROM reward_redemptions rr
       LEFT JOIN reward_catalog rc ON rc.code = rr.catalog_code
      WHERE rr.user_id = ? ORDER BY rr.created_at DESC`,
    [userId]
  );
  return rows.map(mapRedemption);
};

module.exports = {
  listCatalog,
  getCatalogItem,
  decrementStock,
  createRedemption,
  listRedemptions,
};
