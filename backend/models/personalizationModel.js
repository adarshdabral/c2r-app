const db = require('../config/db');

/**
 * Personalization read-model — aggregate queries over the user's own history
 * (pickups, drop-offs). Read-only; adds no tables. Everything here is derived
 * from data the platform already stores.
 */

// Top waste categories the user recycles (across pickups + drop-offs).
const frequentWasteTypes = async (userId, limit = 5) => {
  const [rows] = await db.query(
    `SELECT category, COUNT(*) AS count FROM (
        SELECT waste_category AS category FROM pickup_requests WHERE user_id = ?
        UNION ALL
        SELECT waste_category AS category FROM dropoff_requests WHERE user_id = ?
     ) t
     WHERE category IS NOT NULL AND category <> ''
     GROUP BY category ORDER BY count DESC LIMIT ?`,
    [userId, userId, Number(limit)]
  );
  return rows.map((r) => ({ category: r.category, count: Number(r.count) }));
};

// Most-used preferred pickup time slots (learned from pickup history).
const preferredTimeSlots = async (userId, limit = 3) => {
  const [rows] = await db.query(
    `SELECT preferred_time_slot AS slot, COUNT(*) AS count
       FROM pickup_requests
      WHERE user_id = ? AND preferred_time_slot IS NOT NULL AND preferred_time_slot <> ''
      GROUP BY preferred_time_slot ORDER BY count DESC LIMIT ?`,
    [userId, Number(limit)]
  );
  return rows.map((r) => ({ slot: r.slot, count: Number(r.count) }));
};

// The store the user has completed the most recycles with.
const favoriteRecycler = async (userId) => {
  const [rows] = await db.query(
    `SELECT s.id AS storeId, s.store_name AS storeName, s.recycler_id AS recyclerId,
            s.rating AS rating, s.city AS city, COUNT(*) AS count
       FROM (
         SELECT assigned_store_id AS store_id FROM pickup_requests
           WHERE user_id = ? AND status = 'COMPLETED' AND assigned_store_id IS NOT NULL
         UNION ALL
         SELECT store_id FROM dropoff_requests WHERE user_id = ? AND status = 'COMPLETED'
       ) t
       JOIN stores s ON s.id = t.store_id
      GROUP BY s.id, s.store_name, s.recycler_id, s.rating, s.city
      ORDER BY count DESC LIMIT 1`,
    [userId, userId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    storeId: r.storeId,
    storeName: r.storeName,
    recyclerId: r.recyclerId,
    rating: r.rating === null ? null : Number(r.rating),
    city: r.city,
    completedCount: Number(r.count),
  };
};

// Most recent requests (both flows) — the "recently used services" feed.
const recentActivity = async (userId, limit = 6) => {
  const [rows] = await db.query(
    `SELECT type, id, category, status, created_at FROM (
        SELECT 'pickup' AS type, id, waste_category AS category, status, created_at
          FROM pickup_requests WHERE user_id = ?
        UNION ALL
        SELECT 'dropoff' AS type, id, waste_category AS category, status, created_at
          FROM dropoff_requests WHERE user_id = ?
     ) t
     ORDER BY created_at DESC LIMIT ?`,
    [userId, userId, Number(limit)]
  );
  return rows.map((r) => ({
    type: r.type,
    id: r.id,
    category: r.category,
    status: r.status,
    createdAt: r.created_at,
  }));
};

// Whether the user has an active (not completed/cancelled) pickup right now.
const hasActivePickup = async (userId) => {
  const [[{ n }]] = await db.query(
    `SELECT COUNT(*) AS n FROM pickup_requests
      WHERE user_id = ? AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED')`,
    [userId]
  );
  return n > 0;
};

// Lifetime recycling stats (completed count + kg diverted).
const stats = async (userId) => {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS completed, COALESCE(SUM(kg), 0) AS totalKg FROM (
        SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg
          FROM pickup_requests WHERE user_id = ? AND status = 'COMPLETED'
        UNION ALL
        SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg
          FROM dropoff_requests WHERE user_id = ? AND status = 'COMPLETED'
     ) t`,
    [userId, userId]
  );
  return { completed: Number(row.completed), totalKg: Math.round(Number(row.totalKg) * 10) / 10 };
};

/* ------------------------------ Recycler side ------------------------------ */

// Lifetime processing stats for a recycler (completed pickups + drop-offs).
const recyclerStats = async (recyclerId) => {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS completed, COALESCE(SUM(kg), 0) AS totalKg FROM (
        SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg
          FROM pickup_requests WHERE assigned_recycler_id = ? AND status = 'COMPLETED'
        UNION ALL
        SELECT COALESCE(actual_quantity_kg, waste_quantity) AS kg
          FROM dropoff_requests WHERE recycler_id = ? AND status = 'COMPLETED'
     ) t`,
    [recyclerId, recyclerId]
  );
  return { completed: Number(row.completed), totalKg: Math.round(Number(row.totalKg) * 10) / 10 };
};

// Store portfolio aggregate for a recycler.
const recyclerStoreAgg = async (recyclerId) => {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS stores,
            COALESCE(AVG(NULLIF(rating, 0)), 0) AS avgRating,
            COALESCE(SUM(total_reviews), 0) AS reviews,
            SUM(verification_status = 'Verified') AS verified
       FROM stores WHERE recycler_id = ?`,
    [recyclerId]
  );
  return {
    stores: Number(row.stores),
    verified: Number(row.verified || 0),
    avgRating: Math.round(Number(row.avgRating) * 10) / 10,
    reviews: Number(row.reviews),
  };
};

// Open pickup demand — broadcast requests this recycler is a live candidate for.
const recyclerOpenDemand = async (recyclerId) => {
  const [[{ n }]] = await db.query(
    `SELECT COUNT(*) AS n
       FROM pickup_request_candidates c
       JOIN pickup_requests pr ON pr.id = c.request_id
      WHERE c.recycler_id = ? AND c.status = 'NOTIFIED' AND pr.status = 'BROADCASTED'`,
    [recyclerId]
  );
  return n;
};

module.exports = {
  frequentWasteTypes,
  preferredTimeSlots,
  favoriteRecycler,
  recentActivity,
  hasActivePickup,
  stats,
  recyclerStats,
  recyclerStoreAgg,
  recyclerOpenDemand,
};
