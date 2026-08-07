/**
 * Feature registry — metadata + the INITIAL default for each platform feature.
 *
 * IMPORTANT: this file no longer *controls* whether a feature is on. The
 * `feature_flags` DATABASE table is the single source of truth, managed by
 * admins via the dashboard. The env var / default below is read exactly once —
 * when seeding a brand-new row (see seedFeatureFlags in server.js). After that,
 * only admins change state, and changes take effect immediately (no redeploy).
 */

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'on', 'yes', 'enabled'].includes(String(value).trim().toLowerCase());
};

// One entry per platform feature. `default` is the seed value (env override
// allowed only at first seed). Extend this list to register a new feature.
const FEATURE_REGISTRY = [
  {
    key: 'personalization',
    name: 'Personalization',
    description: 'Personalized dashboard, recommendations, and reminders derived from user history.',
    default: parseBool(process.env.FEATURE_PERSONALIZATION, true),
  },
  {
    key: 'rewards',
    name: 'Reward System',
    description: 'Points, badges, streaks, redemptions, leaderboard, and the reward ledger.',
    default: parseBool(process.env.FEATURE_REWARDS, true),
  },
  {
    key: 'chatbot',
    name: 'AI Chatbot',
    description: 'The role-aware assistant and its platform actions.',
    default: parseBool(process.env.FEATURE_CHATBOT, true),
  },
  {
    key: 'notifications',
    name: 'Notifications',
    description: 'In-app notifications for rewards, pickups, drives, and admin broadcasts.',
    default: parseBool(process.env.FEATURE_NOTIFICATIONS, true),
  },
  {
    key: 'activity',
    name: 'Activity History',
    description: 'A unified timeline of a user\'s activity across the platform.',
    default: parseBool(process.env.FEATURE_ACTIVITY, true),
  },
  {
    key: 'analytics',
    name: 'Admin Analytics',
    description: 'Expanded platform analytics, charts, and exports in the admin dashboard.',
    default: parseBool(process.env.FEATURE_ANALYTICS, true),
  },
];

const FEATURE_KEYS = FEATURE_REGISTRY.map((f) => f.key);
// Fallback map used only if the DB is briefly unreachable.
const DEFAULTS = Object.freeze(Object.fromEntries(FEATURE_REGISTRY.map((f) => [f.key, f.default])));

module.exports = { FEATURE_REGISTRY, FEATURE_KEYS, DEFAULTS, parseBool };
