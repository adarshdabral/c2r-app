/**
 * Centralized FeatureFlagService — the ONE place every module consults before
 * running feature-specific functionality: `FeatureFlagService.isEnabled('rewards')`.
 *
 * Source of truth is the `feature_flags` DATABASE table (managed by admins), not
 * env vars or config files. A short in-process cache keeps this off the hot path;
 * an admin change invalidates it so new state takes effect immediately (no
 * redeploy). If the DB is briefly unreachable, we fall back to the seed defaults.
 */
const { FEATURE_KEYS, DEFAULTS } = require('../config/features');
const flagModel = require('../models/featureFlagModel');
const logger = require('../utils/logger');

const CACHE_TTL_MS = 5000;
let cache = null;
let cacheAt = 0;

// Resolve the full { key: enabled } map from the DB, backfilling any key that
// has no row yet with its seed default.
async function resolveFlags() {
  const dbMap = await flagModel.getEnabledMap();
  const flags = {};
  for (const key of FEATURE_KEYS) {
    flags[key] = key in dbMap ? dbMap[key] : DEFAULTS[key];
  }
  return flags;
}

/** Resolve every flag (cached). Pass { fresh:true } to bypass the cache. */
async function getFlags({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache && now - cacheAt < CACHE_TTL_MS) return cache;
  try {
    cache = await resolveFlags();
    cacheAt = now;
  } catch (err) {
    logger.warn('feature flag resolution failed; using seed defaults', { error: err.message });
    return { ...DEFAULTS };
  }
  return cache;
}

/** True when a single feature is live. The canonical check for all modules. */
async function isEnabled(key) {
  const flags = await getFlags();
  return !!flags[key];
}

/** Detailed rows (name/description/updatedBy/updatedAt) for the admin dashboard. */
async function list() {
  return flagModel.listFlags();
}

/**
 * Admin toggle — persists to the DB, records who changed it, and invalidates the
 * cache so the change is effective on the very next read.
 */
async function setEnabled(key, enabled, updatedBy) {
  if (!FEATURE_KEYS.includes(key)) {
    const err = new Error(`Unknown feature: ${key}`);
    err.statusCode = 400;
    throw err;
  }
  const updated = await flagModel.setEnabled(key, enabled, updatedBy);
  cache = null;
  cacheAt = 0;
  logger.info('feature flag updated', { key, enabled, updatedBy });
  return updated;
}

// Test hook — resets the in-process cache between cases.
function _resetCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = { getFlags, isEnabled, list, setEnabled, _resetCache, FEATURE_KEYS };
