/**
 * Feature-flag resolution service. Combines the built-in/env defaults
 * (config/features.js) with per-flag admin overrides persisted in `app_settings`
 * under the `feature_<key>` convention. A short in-process cache keeps this off
 * the hot path (the middleware calls it on every gated request).
 *
 * This is the ONLY place that decides whether a feature is live — controllers,
 * middleware, scheduled jobs, and the public /api/features endpoint all defer
 * here so behaviour can never diverge.
 */
const { FEATURE_KEYS, DEFAULTS } = require('../config/features');
const { getSetting, setSetting } = require('../models/settingsModel');
const logger = require('../utils/logger');

const OVERRIDE_PREFIX = 'feature_';
const CACHE_TTL_MS = 5000;

let cache = null;
let cacheAt = 0;

const overrideKey = (key) => `${OVERRIDE_PREFIX}${key}`;

// Admin override (app_settings) wins over the env/built-in default. Absence of a
// row means "use the default", so a fresh DB inherits config/features.js exactly.
async function resolveFlags() {
  const flags = {};
  for (const key of FEATURE_KEYS) {
    const override = await getSetting(overrideKey(key), null);
    flags[key] = override === null ? DEFAULTS[key] : override === '1';
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
    // Never let a settings-table hiccup take down a gated route — fall back to
    // the safe built-in defaults.
    logger.warn('feature flag resolution failed; using defaults', { error: err.message });
    return { ...DEFAULTS };
  }
  return cache;
}

/** True when a single feature is live. */
async function isEnabled(key) {
  const flags = await getFlags();
  return !!flags[key];
}

/** Admin runtime toggle. Persists the override and invalidates the cache. */
async function setOverride(key, enabled) {
  if (!FEATURE_KEYS.includes(key)) {
    const err = new Error(`Unknown feature: ${key}`);
    err.statusCode = 400;
    throw err;
  }
  await setSetting(overrideKey(key), enabled ? '1' : '0');
  cache = null;
  cacheAt = 0;
  logger.info('feature flag updated', { key, enabled });
}

// Test hook — resets the in-process cache between cases.
function _resetCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = { getFlags, isEnabled, setOverride, overrideKey, _resetCache, FEATURE_KEYS };
