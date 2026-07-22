/**
 * Migration: legacy recycler location -> Store architecture.
 *
 * Historically a recycler's coordinates lived on the users row
 * (users.latitude / users.longitude). The Store architecture moves location
 * onto a dedicated `stores` table (one recycler -> many stores). This script
 * backfills a default store for every existing recycler that still has location
 * data and does not yet own a store.
 *
 * Rules:
 *   FOR every recycler WITH location data:
 *     IF the recycler has no store  ->  create a default store
 *       storeName          = <recycler's name> (business name)
 *       status             = 'Active'
 *       verificationStatus = 'Pending'
 *
 * Properties:
 *   - Idempotent / re-runnable: a recycler that already owns >=1 store is
 *     skipped, so running twice creates nothing new.
 *   - Safe: read-only against users; only INSERTs into stores. Wrapped per-row
 *     so one bad row cannot abort the whole run. No destructive statements.
 *   - Fresh-DB tolerant: if users.latitude/longitude no longer exist (a database
 *     created after the columns were dropped), there is nothing to migrate and
 *     the script exits cleanly.
 *
 * Usage:  node scripts/migrateRecyclersToStores.js     (or: npm run migrate:stores)
 */

const db = require('../config/db');
const { createStore } = require('../models/storeModel');

// Returns true if `column` exists on `table` in the current database.
const columnExists = async (table, column) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].n > 0;
};

const migrate = async () => {
  const hasLat = await columnExists('users', 'latitude');
  const hasLng = await columnExists('users', 'longitude');

  if (!hasLat || !hasLng) {
    console.log('ℹ️  users.latitude/longitude not present — nothing to migrate.');
    return { total: 0, created: 0, skipped: 0, failed: 0 };
  }

  // Recyclers that still carry location data on the user row.
  const [recyclers] = await db.query(
    `SELECT id, name, latitude, longitude
     FROM users
     WHERE role = 'recycler'
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL`
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of recyclers) {
    try {
      // Idempotency guard: skip if this recycler already owns any store.
      const [[{ n }]] = await db.query(
        'SELECT COUNT(*) AS n FROM stores WHERE recycler_id = ?',
        [r.id]
      );
      if (n > 0) {
        skipped += 1;
        continue;
      }

      await createStore({
        recyclerId: r.id,
        storeName: (r.name && r.name.trim()) || `Recycler #${r.id} Store`,
        address: 'Address pending — please update',
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        status: 'Active',
        verificationStatus: 'Pending'
      });

      created += 1;
      console.log(`✅ Created default store for recycler #${r.id} (${r.name})`);
    } catch (err) {
      failed += 1;
      console.error(`❌ Failed for recycler #${r.id}: ${err.message}`);
    }
  }

  return { total: recyclers.length, created, skipped, failed };
};

const run = async () => {
  try {
    console.log('Migration: recyclers -> default stores');
    const summary = await migrate();
    console.log(
      `\nDone. recyclers=${summary.total} created=${summary.created} ` +
      `skipped=${summary.skipped} failed=${summary.failed}`
    );
    await db.end();
    process.exit(summary.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Migration aborted:', err.message);
    try { await db.end(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
};

run();
