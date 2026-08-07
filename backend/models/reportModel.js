const db = require('../config/db');

const parseJson = (v) => {
  if (v == null) return null;
  if (typeof v === 'object') return v; // mysql2 already parsed JSON columns
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const META = `
  id, user_id, report_type, report_no, pickup_id,
  DATE_FORMAT(period_start, '%Y-%m-%d') AS period_start,
  DATE_FORMAT(period_end, '%Y-%m-%d') AS period_end,
  title, total_quantity_kg, total_pickups, metrics, insights, created_at
`;

const mapRow = (r) =>
  r && {
    id: r.id,
    userId: r.user_id,
    reportType: r.report_type,
    reportNo: r.report_no,
    pickupId: r.pickup_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    title: r.title,
    totalQuantityKg: Number(r.total_quantity_kg),
    totalPickups: r.total_pickups,
    metrics: parseJson(r.metrics),
    insights: parseJson(r.insights) || [],
    createdAt: r.created_at,
  };

const create = async (r) => {
  const [res] = await db.execute(
    `INSERT INTO reports
      (user_id, report_type, report_no, pickup_id, period_start, period_end,
       title, total_quantity_kg, total_pickups, metrics, insights, pdf_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.userId, r.reportType, r.reportNo, r.pickupId ?? null,
      r.periodStart ?? null, r.periodEnd ?? null, r.title,
      r.totalQuantityKg, r.totalPickups,
      JSON.stringify(r.metrics || {}), JSON.stringify(r.insights || []), r.pdfData,
    ]
  );
  return res.insertId;
};

const existsForPickup = async (pickupId) => {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM reports WHERE pickup_id = ?', [pickupId]);
  return n > 0;
};

const listForUser = async (userId) => {
  const [rows] = await db.query(
    `SELECT ${META} FROM reports WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(mapRow);
};

const listAll = async ({ limit = 50, offset = 0 } = {}) => {
  const [rows] = await db.query(
    `SELECT ${META}, u.name AS user_name
     FROM reports JOIN users u ON u.id = reports.user_id
     ORDER BY reports.created_at DESC LIMIT ? OFFSET ?`,
    [Number(limit), Number(offset)]
  );
  return rows.map((r) => ({ ...mapRow(r), userName: r.user_name }));
};

const getById = async (id) => {
  const [rows] = await db.query(`SELECT ${META} FROM reports WHERE id = ? LIMIT 1`, [id]);
  return mapRow(rows[0]);
};

const getPdf = async (id) => {
  const [rows] = await db.query('SELECT user_id, report_no, pdf_data FROM reports WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
};

// Sum completed pickups + drop-offs for a user in [start, end] (verified qty,
// falling back to declared).
const aggregateCompleted = async (userId, start, end) => {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(kg), 0) AS total, COUNT(*) AS c FROM (
       SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg
         FROM pickup_requests
        WHERE user_id = ? AND status = 'COMPLETED'
          AND completion_timestamp BETWEEN ? AND ?
       UNION ALL
       SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg
         FROM dropoff_requests
        WHERE user_id = ? AND status = 'COMPLETED'
          AND completion_timestamp BETWEEN ? AND ?
     ) t`,
    [userId, start, end, userId, start, end]
  );
  return { totalKg: Number(rows[0].total), count: Number(rows[0].c) };
};

module.exports = { create, existsForPickup, listForUser, listAll, getById, getPdf, aggregateCompleted };
