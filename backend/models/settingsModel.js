/**
 * Key/value application settings (the `app_settings` table, created in
 * server.js's createTables). Currently backs the admin-controlled rewards
 * feature flag, but the get/set pair is generic for future flags.
 */
const db = require('../config/db');

const REWARDS_ENABLED_KEY = 'rewards_enabled';

const getSetting = async (key, fallback = null) => {
  const [rows] = await db.execute(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  return rows.length ? rows[0].setting_value : fallback;
};

const setSetting = async (key, value) => {
  await db.execute(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
    [key, String(value)]
  );
};

// Rewards feature flag. Defaults to OFF: a fresh DB has no row, so the feature
// stays disabled until an admin turns it on and baseline behaviour is unchanged.
const isRewardsEnabled = async () => (await getSetting(REWARDS_ENABLED_KEY, '0')) === '1';
const setRewardsEnabled = async (enabled) => setSetting(REWARDS_ENABLED_KEY, enabled ? '1' : '0');

module.exports = {
  REWARDS_ENABLED_KEY,
  getSetting,
  setSetting,
  isRewardsEnabled,
  setRewardsEnabled,
};
