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
const ewasteRoutes = require('./routes/ewasteRoutes');
const imageRoutes = require('./routes/imageRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const collectionDriveRoutes = require('./routes/collectionDriveRoutes');
const reportRoutes = require('./routes/reportRoutes');
const siteContentRoutes = require('./routes/siteContentRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const featureRoutes = require('./routes/featureRoutes');
const { requireFeature } = require('./middleware/featureFlag');
const adminRoutes = require("./routes/adminRoutes");


const app = express();

/* ----------------------- MIDDLEWARE ----------------------- */

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parser
// 25MB accommodates base64 image uploads (stored in MySQL); default is 100KB.
app.use(express.json({ limit: '25mb' }));

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

app.use('/api/features', featureRoutes); // public flag map — read before auth
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/pickup-requests', pickupRequestRoutes);
app.use('/api/dropoff-requests', dropOffRequestRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/recyclers', recyclerRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/rewards', requireFeature('rewards'), rewardRoutes);
app.use('/api/ewaste', ewasteRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/collection-drives', collectionDriveRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/site-content', siteContentRoutes);
app.use('/api/assistant', requireFeature('chatbot'), assistantRoutes);
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

// CPCB-aligned e-waste taxonomy seed. Data-driven: extend by editing this list
// (or via the DB) — no code changes elsewhere are needed. Seeded once, only when
// the categories table is empty, so admin/data edits are never overwritten.
const EWASTE_TAXONOMY = [
  { name: 'IT & Telecommunication Equipment', code: 'ITEW', items: ['Laptop', 'Desktop Computer', 'Monitor', 'Keyboard', 'Mouse', 'Printer', 'Scanner', 'Router', 'Modem', 'Server', 'Mobile Phone', 'Tablet', 'Landline Phone', 'UPS'] },
  { name: 'Large Household Appliances', code: 'LHA', items: ['Refrigerator', 'Washing Machine', 'Air Conditioner', 'Microwave Oven', 'Dishwasher', 'Water Heater / Geyser'] },
  { name: 'Small Household Appliances', code: 'SHA', items: ['Iron', 'Toaster', 'Mixer / Grinder', 'Vacuum Cleaner', 'Electric Kettle', 'Hair Dryer'] },
  { name: 'Consumer Electronics', code: 'CE', items: ['Television', 'Radio', 'DVD / Blu-ray Player', 'Camera', 'Speakers', 'Set-top Box', 'Gaming Console'] },
  { name: 'Lighting Equipment', code: 'LE', items: ['LED Bulb', 'CFL', 'Tube Light', 'Fluorescent Lamp'] },
  { name: 'Electrical & Electronic Tools', code: 'EET', items: ['Power Drill', 'Electric Saw', 'Soldering Iron', 'Sewing Machine'] },
  { name: 'Batteries & Accessories', code: 'BAT', items: ['Lithium-ion Battery', 'Lead-acid Battery', 'Power Bank', 'Charger', 'Cables & Wires'] },
  { name: 'Medical Devices', code: 'MED', items: ['Digital Thermometer', 'BP Monitor', 'Glucometer'] },
  { name: 'Monitoring & Control Instruments', code: 'MCI', items: ['Smoke Detector', 'Thermostat', 'Sensors'] },
];

const seedEwasteTaxonomy = async () => {
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM ewaste_categories');
  if (n > 0) return; // already seeded / admin-managed
  for (let ci = 0; ci < EWASTE_TAXONOMY.length; ci++) {
    const cat = EWASTE_TAXONOMY[ci];
    const [res] = await db.execute(
      'INSERT INTO ewaste_categories (name, code, sort_order) VALUES (?, ?, ?)',
      [cat.name, cat.code, ci]
    );
    const categoryId = res.insertId;
    for (let ii = 0; ii < cat.items.length; ii++) {
      await db.execute(
        'INSERT INTO ewaste_items (category_id, name, sort_order) VALUES (?, ?, ?)',
        [categoryId, cat.items[ii], ii]
      );
    }
  }
  console.log(`✅ Seeded ${EWASTE_TAXONOMY.length} e-waste categories`);
};

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
    // Data Sanitization Certificate: whether the user asked for one at booking.
    await ensureColumn(table, 'sanitization_requested', 'BOOLEAN NOT NULL DEFAULT FALSE');
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

  // ── CPCB e-waste taxonomy (data-driven) ──────────────────────────────────
  // Categories and the appliances/items under each. Adding future CPCB
  // categories/items is a data update (seed / admin), never a code change.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ewaste_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      code VARCHAR(32) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ewaste_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      FOREIGN KEY (category_id) REFERENCES ewaste_categories(id) ON DELETE CASCADE,
      UNIQUE KEY uq_item (category_id, name),
      INDEX idx_item_category (category_id)
    )
  `);

  // Selected (category, appliance) pairs per request — polymorphic over pickup/
  // dropoff (no FK on request_id, matching the OTP-log pattern). item_id NULL
  // means the whole category was selected without a specific appliance.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS request_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_type ENUM('pickup', 'dropoff') NOT NULL,
      request_id INT NOT NULL,
      category_id INT NOT NULL,
      item_id INT NULL,
      category_name VARCHAR(120) NOT NULL,
      item_name VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reqitem (request_type, request_id)
    )
  `);

  // Uploaded images (base64), kept in the DB so they survive Render redeploys.
  // uploaded_by separates the user's before-images from the recycler's
  // collected-waste images.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS request_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_type ENUM('pickup', 'dropoff') NOT NULL,
      request_id INT NOT NULL,
      uploaded_by ENUM('user', 'recycler') NOT NULL,
      uploader_id INT NULL,
      mime_type VARCHAR(40) NOT NULL DEFAULT 'image/jpeg',
      data LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reqimg (request_type, request_id, uploaded_by)
    )
  `);

  // Data Sanitization Certificates — one per request, issued by the recycler.
  // The generated PDF is stored as base64 (pdf_data) so it's permanently linked
  // to the booking regardless of the deploy filesystem.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_type ENUM('pickup', 'dropoff') NOT NULL,
      request_id INT NOT NULL,
      certificate_no VARCHAR(40) NOT NULL UNIQUE,
      verification_id VARCHAR(64) NOT NULL UNIQUE,
      recycler_id INT NULL,
      sanitization_method VARCHAR(120) NOT NULL,
      sanitized_on DATE NOT NULL,
      authorised_person VARCHAR(120) NOT NULL,
      designation VARCHAR(120) NULL,
      pdf_data LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cert_request (request_type, request_id)
    )
  `);

  // ── Collection drives (public e-waste events) + RSVPs ────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS collection_drives (
      id INT AUTO_INCREMENT PRIMARY KEY,
      host_id INT NOT NULL,
      host_role ENUM('recycler', 'admin') NOT NULL,
      title VARCHAR(150) NOT NULL,
      description TEXT NULL,
      address VARCHAR(255) NOT NULL,
      latitude DECIMAL(10, 7) NULL,
      longitude DECIMAL(10, 7) NULL,
      scheduled_date DATE NOT NULL,
      time_window VARCHAR(60) NULL,
      accepted_categories VARCHAR(255) NULL,
      capacity INT NULL,
      status ENUM('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'UPCOMING',
      reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_drive_host (host_id),
      INDEX idx_drive_status (status, scheduled_date)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS collection_drive_rsvps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      drive_id INT NOT NULL,
      user_id INT NOT NULL,
      status ENUM('GOING', 'CANCELLED') NOT NULL DEFAULT 'GOING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_rsvp_drive FOREIGN KEY (drive_id) REFERENCES collection_drives(id) ON DELETE CASCADE,
      UNIQUE KEY uq_rsvp (drive_id, user_id),
      INDEX idx_rsvp_user (user_id)
    )
  `);

  // Drive completion report — PDF + Excel (both base64), one per drive.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS collection_drive_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      drive_id INT NOT NULL,
      report_no VARCHAR(40) NOT NULL UNIQUE,
      generated_by INT NULL,
      attendee_count INT NOT NULL DEFAULT 0,
      pdf_data LONGTEXT NOT NULL,
      xls_data LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (drive_id) REFERENCES collection_drives(id) ON DELETE CASCADE,
      UNIQUE KEY uq_drive_report (drive_id)
    )
  `);

  // Bulk-producer analytics reports (transaction + period summaries). PDF base64.
  // pickup_id is UNIQUE so a transaction report is generated once per pickup;
  // summaries have pickup_id NULL (MySQL allows many NULLs in a UNIQUE index).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      report_type ENUM('transaction', 'monthly', 'quarterly', 'annual') NOT NULL,
      report_no VARCHAR(40) NOT NULL UNIQUE,
      pickup_id INT NULL,
      period_start DATE NULL,
      period_end DATE NULL,
      title VARCHAR(160) NOT NULL,
      total_quantity_kg DECIMAL(12, 2) NOT NULL DEFAULT 0,
      total_pickups INT NOT NULL DEFAULT 0,
      metrics JSON NULL,
      insights JSON NULL,
      pdf_data LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_report_user (user_id, created_at),
      UNIQUE KEY uq_report_pickup (pickup_id)
    )
  `);

  // ---- Website content CMS (admin-managed marketing/home content) ----
  // Singletons: hero_video, impact_image, hero_heading, hero_subheading, etc.
  // Media is stored base64 (Render's filesystem is ephemeral) in media_data.
  await db.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(60) NOT NULL UNIQUE,
      text_value TEXT NULL,
      media_data LONGTEXT NULL,
      media_type VARCHAR(60) NULL,
      updated_by INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Ordered collections: carousel images, FAQ-gallery images. Each item is an
  // image (media_data base64) with an optional caption; FAQ items may also carry
  // a question/answer in title/body.
  await db.query(`
    CREATE TABLE IF NOT EXISTS site_media_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      collection ENUM('carousel', 'faq_gallery') NOT NULL,
      title VARCHAR(200) NULL,
      body TEXT NULL,
      media_data LONGTEXT NULL,
      media_type VARCHAR(60) NULL,
      link_url VARCHAR(500) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_site_media_collection (collection, sort_order)
    )
  `);

  await seedEwasteTaxonomy();

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
    // Print the whole error — a bare `error.message` is empty for some pool
    // failures and hides the real cause (almost always the database).
    console.error('❌ Failed to start server:', error?.message || error);
    if (error?.code) console.error('   code:', error.code);
    if (error?.stack) console.error(error.stack);
    console.error(
      '   If this is a database error, verify the DB is reachable and that ' +
      'DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME are set. ' +
      'Render has no managed MySQL — point these at an external MySQL.'
    );
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