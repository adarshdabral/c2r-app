const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');
const logger = require('./utils/logger');
const requestLogger = require('./middleware/requestLogger');

const authRoutes = require('./routes/authRoutes');
const stationRoutes = require('./routes/stationRoutes');
const storeRoutes = require('./routes/storeRoutes');
const pickupRequestRoutes = require('./routes/pickupRequestRoutes');
const dropOffRequestRoutes = require('./routes/dropOffRequestRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const addressRoutes = require('./routes/addressRoutes');
const recyclerRoutes = require('./routes/recyclerRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const rewardRoutes = require('./routes/rewardRoutes');
const adminRoutes = require("./routes/adminRoutes");


const app = express();

/* ----------------------- MIDDLEWARE ----------------------- */

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parser
app.use(express.json());

// Structured per-request logging
app.use(requestLogger);

// Rate limiter (for auth)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: () => ['development', 'test'].includes(process.env.NODE_ENV),
});

/* ----------------------- ROUTES ----------------------- */

app.get('/api/health', (req, res) => {
  res.status(200).json({ message: 'Server is running' });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/pickup-requests', pickupRequestRoutes);
app.use('/api/dropoff-requests', dropOffRequestRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/recyclers', recyclerRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/rewards', rewardRoutes);
app.use("/api/admin", adminRoutes);

/* ----------------------- 404 HANDLER ----------------------- */

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

/* ----------------------- ERROR HANDLER ----------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  // Operational (expected) errors are logged at warn; everything else is a bug.
  if (err.isOperational || statusCode < 500) {
    logger.warn('handled error', { path: req.originalUrl, status: statusCode, message: err.message });
  } else {
    logger.error('unhandled error', err);
  }

  res.status(statusCode).json({
    message: statusCode >= 500 ? 'Internal server error' : err.message
  });
});

/* ----------------------- DATABASE SETUP ----------------------- */

const createTables = async () => {
  // USERS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('user', 'recycler', 'admin') NOT NULL DEFAULT 'user',
      user_type VARCHAR(32) NULL,
      otp VARCHAR(6) NULL,
      otp_expiry DATETIME NULL,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Idempotent column additions for pre-existing users tables.
  // Adds OTP/verification columns if missing; backfills existing rows as verified
  // so users created before this feature shipped are not locked out at login.
  const ensureColumn = async (table, column, definition) => {
    try {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      return true;
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') return false;
      throw err;
    }
  };

  await ensureColumn('users', 'otp', 'VARCHAR(6) NULL');
  await ensureColumn('users', 'otp_expiry', 'DATETIME NULL');
  // Self-serve password reset (single-use token emailed as a link).
  await ensureColumn('users', 'reset_token', 'VARCHAR(64) NULL');
  await ensureColumn('users', 'reset_token_expiry', 'DATETIME NULL');
  // Admin account suspension (Phase 8). Suspended users are blocked at login.
  await ensureColumn('users', 'is_suspended', 'BOOLEAN NOT NULL DEFAULT FALSE');
  const addedIsVerified = await ensureColumn(
    'users',
    'is_verified',
    'BOOLEAN NOT NULL DEFAULT FALSE'
  );
  if (addedIsVerified) {
    await db.execute('UPDATE users SET is_verified = TRUE');
  }

  // STATIONS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      address VARCHAR(255) NOT NULL,
      capacity INT NOT NULL DEFAULT 0
    )
  `);

  // STORES
  // A recycler (users.role = 'recycler') owns many stores; each store is an
  // independent physical drop-off/pickup point with its own coordinates. This
  // replaces the single latitude/longitude that used to live on the user row.
  // Created before `bookings` so the bookings.store_id FK can reference it.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recycler_id INT NOT NULL,
      store_name VARCHAR(150) NOT NULL,
      description TEXT NULL,
      contact_number VARCHAR(20) NULL,
      email VARCHAR(150) NULL,
      address VARCHAR(255) NOT NULL,
      city VARCHAR(100) NULL,
      state VARCHAR(100) NULL,
      pincode VARCHAR(12) NULL,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      operating_hours VARCHAR(255) NULL,
      pickup_availability BOOLEAN NOT NULL DEFAULT TRUE,
      accepted_waste_types SET(
        'Waste Batteries', 'PCB Scrap', 'Mobile Phone Scrap', 'Laptop Scrap',
        'Computer Scrap', 'Hard Drive Scrap', 'IT Equipment Scrap',
        'Telecom Equipment Scrap', 'Display Panel Scrap'
      ) NULL,
      daily_capacity_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
      current_capacity_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
      status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
      verification_status ENUM('Pending', 'Verified', 'Rejected') NOT NULL DEFAULT 'Pending',
      rating DECIMAL(2, 1) NOT NULL DEFAULT 0,
      total_reviews INT NOT NULL DEFAULT 0,
      daily_threshold_kg DECIMAL(10, 2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_store_recycler
        FOREIGN KEY (recycler_id) REFERENCES users(id) ON DELETE CASCADE,

      INDEX idx_stores_recycler (recycler_id),
      INDEX idx_stores_geo (latitude, longitude),
      INDEX idx_stores_status (status),
      INDEX idx_stores_active_geo (status, latitude, longitude),
      INDEX idx_stores_verification (verification_status)
    )
  `);

  // REVIEWS
  // A user (users.role = 'user') leaves at most one review per store. The
  // UNIQUE(store_id, user_id) index enforces the "no duplicate reviews" rule at
  // the database level; store aggregates (stores.rating, stores.total_reviews)
  // are recomputed from this table on every write (see models/reviewModel.js).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      user_id INT NOT NULL,
      rating TINYINT NOT NULL,
      comment TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_review_store
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,

      CONSTRAINT fk_review_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

      CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),

      UNIQUE KEY uq_review_store_user (store_id, user_id),
      INDEX idx_reviews_store (store_id),
      INDEX idx_reviews_user (user_id)
    )
  `);

  // PICKUP REQUESTS (Phase 3)
  // A user raises a pickup request; the platform broadcasts it to the top-N
  // nearest eligible stores and the first recycler to accept wins. The status
  // column is the full pickup lifecycle state machine (see pickupRequestModel).
  // acceptance_deadline drives auto-expiry/retry; otp_user/otp_recycler back the
  // on-arrival OTP handshake that gates completion.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pickup_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      assigned_recycler_id INT NULL,
      assigned_store_id INT NULL,
      waste_category VARCHAR(32) NOT NULL,
      waste_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
      pickup_address VARCHAR(255) NOT NULL,
      pickup_latitude DECIMAL(10, 7) NOT NULL,
      pickup_longitude DECIMAL(10, 7) NOT NULL,
      preferred_time_slot VARCHAR(64) NULL,
      status ENUM(
        'REQUESTED', 'BROADCASTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED',
        'OTP_PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED'
      ) NOT NULL DEFAULT 'REQUESTED',
      acceptance_deadline DATETIME NULL,
      otp_user VARCHAR(6) NULL,
      otp_recycler VARCHAR(6) NULL,
      otp_expiry DATETIME NULL,
      otp_attempts INT NOT NULL DEFAULT 0,
      user_otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
      recycler_otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
      completion_timestamp DATETIME NULL,
      broadcast_round INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_pickup_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_pickup_recycler
        FOREIGN KEY (assigned_recycler_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_pickup_store
        FOREIGN KEY (assigned_store_id) REFERENCES stores(id) ON DELETE SET NULL,

      INDEX idx_pickup_user (user_id),
      INDEX idx_pickup_recycler (assigned_recycler_id),
      INDEX idx_pickup_status (status),
      INDEX idx_pickup_status_deadline (status, acceptance_deadline)
    )
  `);

  // PICKUP REQUEST CANDIDATES (Phase 3)
  // The fan-out of a broadcast: one row per store a request was offered to, per
  // round. NOTIFIED -> ACCEPTED (the winner) / REJECTED (declined) / MISSED
  // (someone else won, or the round expired). UNIQUE(request_id, store_id) keeps
  // a store from being offered the same request twice across retry rounds.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pickup_request_candidates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      store_id INT NOT NULL,
      recycler_id INT NOT NULL,
      round INT NOT NULL DEFAULT 1,
      distance_km DECIMAL(10, 2) NULL,
      status ENUM('NOTIFIED', 'ACCEPTED', 'REJECTED', 'MISSED') NOT NULL DEFAULT 'NOTIFIED',
      notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME NULL,

      CONSTRAINT fk_candidate_request
        FOREIGN KEY (request_id) REFERENCES pickup_requests(id) ON DELETE CASCADE,
      CONSTRAINT fk_candidate_store
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      CONSTRAINT fk_candidate_recycler
        FOREIGN KEY (recycler_id) REFERENCES users(id) ON DELETE CASCADE,

      UNIQUE KEY uq_candidate_request_store (request_id, store_id),
      INDEX idx_candidate_recycler (recycler_id, status),
      INDEX idx_candidate_request (request_id)
    )
  `);

  // DROP-OFF REQUESTS (Phase 4)
  // A user picks a specific store and a time slot to drop off recycling. Unlike
  // pickups there is no broadcast — the chosen store's recycler is notified and
  // approves the booking. recycler_id is denormalised from the store's owner so
  // recycler-scoped queries don't need a join. scheduled_date + time_slot back
  // the time-slot booking; otp_user/otp_recycler gate the on-site handover.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS dropoff_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      store_id INT NOT NULL,
      recycler_id INT NOT NULL,
      waste_category VARCHAR(32) NOT NULL,
      waste_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
      scheduled_date DATE NOT NULL,
      time_slot VARCHAR(32) NOT NULL,
      status ENUM(
        'REQUESTED', 'APPROVED', 'CHECKED_IN', 'OTP_PENDING', 'COMPLETED', 'CANCELLED'
      ) NOT NULL DEFAULT 'REQUESTED',
      otp_user VARCHAR(6) NULL,
      otp_recycler VARCHAR(6) NULL,
      otp_expiry DATETIME NULL,
      otp_attempts INT NOT NULL DEFAULT 0,
      user_otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
      recycler_otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
      completion_timestamp DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_dropoff_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_dropoff_store
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      CONSTRAINT fk_dropoff_recycler
        FOREIGN KEY (recycler_id) REFERENCES users(id) ON DELETE CASCADE,

      INDEX idx_dropoff_user (user_id),
      INDEX idx_dropoff_store (store_id),
      INDEX idx_dropoff_recycler (recycler_id, status),
      INDEX idx_dropoff_status (status)
    )
  `);

  // OTP SECURITY COLUMNS (Phase 5) — idempotent ALTERs for DBs created before
  // the mutual-OTP layer. Both request tables gain expiry, an attempt counter,
  // and the two per-side "verified" flags that gate completion.
  for (const table of ['pickup_requests', 'dropoff_requests']) {
    await ensureColumn(table, 'otp_expiry', 'DATETIME NULL');
    await ensureColumn(table, 'otp_attempts', 'INT NOT NULL DEFAULT 0');
    await ensureColumn(table, 'user_otp_verified', 'BOOLEAN NOT NULL DEFAULT FALSE');
    await ensureColumn(table, 'recycler_otp_verified', 'BOOLEAN NOT NULL DEFAULT FALSE');
    // Actual collected quantity logged by the recycler at completion (Waste
    // Collection Service Flow) — may differ from the user's declared quantity.
    await ensureColumn(table, 'actual_quantity_kg', 'DECIMAL(10, 2) NULL');
    // Multi-category scheduling: waste_category now holds a comma-separated list
    // of e-waste categories, so widen it from the original VARCHAR(32). MODIFY is
    // idempotent — safe to run on every boot.
    await db.execute(`ALTER TABLE ${table} MODIFY COLUMN waste_category VARCHAR(255) NOT NULL`);
  }

  // Admin-controlled per-store daily intake threshold (kg). NULL = no limit.
  await ensureColumn('stores', 'daily_threshold_kg', 'DECIMAL(10, 2) NULL');

  // OTP VERIFICATION LOG (Phase 5)
  // Append-only audit trail of every OTP attempt across both request types —
  // who submitted which code and the outcome. Backs fraud investigation and the
  // verification-history endpoint. No FK (request_type is polymorphic); indexed
  // by (request_type, request_id) for per-request history lookups.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS otp_verification_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_type ENUM('pickup', 'dropoff') NOT NULL,
      request_id INT NOT NULL,
      actor ENUM('user', 'recycler') NOT NULL,
      actor_user_id INT NULL,
      target ENUM('user_otp', 'recycler_otp') NOT NULL,
      result ENUM('SUCCESS', 'FAIL', 'EXPIRED', 'LOCKED') NOT NULL,
      attempt_no INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      INDEX idx_otplog_request (request_type, request_id),
      INDEX idx_otplog_actor (actor_user_id)
    )
  `);

  // DISPUTES (Phase 8)
  // A user or recycler can raise a dispute against a pickup/dropoff request;
  // admins triage and resolve them. request_type is polymorphic (no FK to the
  // request tables); raised_by/resolved_by reference users.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS disputes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_type ENUM('pickup', 'dropoff') NOT NULL,
      request_id INT NOT NULL,
      raised_by INT NOT NULL,
      raised_by_role ENUM('user', 'recycler') NOT NULL,
      reason VARCHAR(1000) NOT NULL,
      status ENUM('OPEN', 'RESOLVED', 'REJECTED') NOT NULL DEFAULT 'OPEN',
      resolution_note VARCHAR(1000) NULL,
      resolved_by INT NULL,
      resolved_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_dispute_raiser FOREIGN KEY (raised_by) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_dispute_resolver FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,

      INDEX idx_dispute_status (status),
      INDEX idx_dispute_request (request_type, request_id),
      INDEX idx_dispute_raiser (raised_by)
    )
  `);

  // BOOKINGS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      station_id INT NULL,
      store_id INT NULL,
      recycler_id INT NULL,
      status ENUM('pending', 'accepted', 'completed') NOT NULL DEFAULT 'pending',
      pickup_date DATETIME NOT NULL,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      address VARCHAR(255) NOT NULL,
      estimated_weight_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
      waste_type VARCHAR(32) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_booking_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

      CONSTRAINT fk_booking_station
        FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,

      CONSTRAINT fk_booking_store
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL,

      CONSTRAINT fk_booking_recycler
        FOREIGN KEY (recycler_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Idempotent column addition for pre-existing bookings tables: a booking now
  // targets a store. recycler_id is retained (derived from the store's owner)
  // so existing recycler-scoped queries keep working.
  await ensureColumn('bookings', 'store_id', 'INT NULL');
  await ensureColumn('bookings', 'estimated_weight_kg', 'DECIMAL(10, 2) NOT NULL DEFAULT 0');
  await ensureColumn('bookings', 'waste_type', 'VARCHAR(32) NULL');

  // SAVED ADDRESSES
  // A citizen's reusable pickup locations. Each carries resolved coordinates so a
  // saved address can seed a pickup request without re-geocoding. At most one
  // row per user is the default (enforced in models/addressModel.js).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      label VARCHAR(60) NOT NULL,
      address VARCHAR(255) NOT NULL,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_address_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_address_user (user_id)
    )
  `);

  // Generic key/value application settings. Backs the admin-controlled rewards
  // feature flag (`rewards_enabled`); absence of a row means the feature is off.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(64) PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  console.log("✅ Tables ensured");
};

/* ----------------------- SERVER START ----------------------- */

const PORT = Number(process.env.PORT) || 4000;

// Pickup-request expiry/retry sweeper. On each tick, requests past their
// acceptance deadline are retried against the next-nearest stores (or expired).
// Interval is configurable; defaults to 30s. Failures are logged, never fatal.
const { runPickupSweep } = require('./controllers/pickupRequestController');
const PICKUP_SWEEP_INTERVAL_MS = Number(process.env.PICKUP_SWEEP_INTERVAL_MS) || 30 * 1000;

const startPickupSweeper = () => {
  const tick = () => {
    runPickupSweep().catch((err) => logger.error('pickup sweep failed', err));
  };
  const timer = setInterval(tick, PICKUP_SWEEP_INTERVAL_MS);
  timer.unref?.(); // don't keep the event loop alive solely for the sweeper
  logger.info('pickup sweeper started', { intervalMs: PICKUP_SWEEP_INTERVAL_MS });
};

const startServer = async () => {
  try {
    await createTables();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    startPickupSweeper();

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Only boot the HTTP server / DB / sweeper when run directly (`node server.js`).
// When required by tests (supertest), expose the app + schema helper with no
// side effects — no listen, no DB connection, no background sweeper.
if (require.main === module) {
  startServer();
}

module.exports = { app, createTables };