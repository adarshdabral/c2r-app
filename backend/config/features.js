/**
 * Centralized feature-flag configuration — the single source of truth for the
 * three top-level product features. Each flag has three layers, highest wins:
 *
 *   1. Built-in default (below)                — safe baseline
 *   2. Deploy-time env override                — FEATURE_<NAME>=off|on
 *   3. Runtime admin override (app_settings)   — feature_<name> = '1'|'0'
 *
 * The env layer lets ops disable a feature per-environment without a DB; the
 * admin layer lets a superuser flip it live (resolved in services/featureService).
 *
 * Disabling a feature must leave the rest of the platform fully functional:
 * routes 404, UI/nav entries hide, scheduled jobs no-op, awards stop firing.
 */

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'on', 'yes', 'enabled'].includes(String(value).trim().toLowerCase());
};

// The canonical feature keys. Keep in sync with frontend/src/lib/features.ts.
const FEATURE_KEYS = ['personalization', 'rewards', 'chatbot'];

// Layer 1 + 2: built-in defaults, overridable by env at boot.
const DEFAULTS = Object.freeze({
  personalization: parseBool(process.env.FEATURE_PERSONALIZATION, true),
  rewards: parseBool(process.env.FEATURE_REWARDS, true),
  chatbot: parseBool(process.env.FEATURE_CHATBOT, true),
});

module.exports = { FEATURE_KEYS, DEFAULTS, parseBool };
