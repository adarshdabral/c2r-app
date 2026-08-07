/**
 * Admin analytics service — assembles the platform analytics dashboard from the
 * analytics model + existing reward analytics. Read-only; each sub-query is
 * independent so a partial failure degrades gracefully.
 */
const analyticsModel = require('../models/analyticsModel');
const rewardModel = require('../models/rewardModel');
const logger = require('../utils/logger');

const safe = async (p, fallback) => {
  try {
    return await p;
  } catch (err) {
    logger.warn('analytics sub-query failed (ignored)', { error: err.message });
    return fallback;
  }
};

async function dashboard() {
  const [health, dau, wau, mau, volume, roles, growth, pickups, drives, rewards, chatbot, features] =
    await Promise.all([
      safe(analyticsModel.platformHealth(), {}),
      safe(analyticsModel.activeUsers(1), 0),
      safe(analyticsModel.activeUsers(7), 0),
      safe(analyticsModel.activeUsers(30), 0),
      safe(analyticsModel.recyclingVolume(), { totalKg: 0, completed: 0 }),
      safe(analyticsModel.roleDistribution(), []),
      safe(analyticsModel.userGrowth(14), []),
      safe(analyticsModel.pickupSeries(14), []),
      safe(analyticsModel.driveTotals(), {}),
      safe(rewardModel.analytics(), {}),
      safe(analyticsModel.chatbotUsage(), {}),
      safe(analyticsModel.featureUsage(), []),
    ]);

  return {
    health,
    activeUsers: { dau, wau, mau },
    volume,
    roles,
    growth,
    pickups,
    drives,
    rewards,
    chatbot,
    features,
    generatedAt: new Date().toISOString(),
  };
}

// Flat key/value CSV of the headline metrics (admin export).
async function exportCsv() {
  const d = await dashboard();
  const rows = [
    ['metric', 'value'],
    ['users', d.health.users],
    ['recyclers', d.health.recyclers],
    ['stores', d.health.stores],
    ['stores_pending', d.health.storesPending],
    ['open_disputes', d.health.openDisputes],
    ['dau', d.activeUsers.dau],
    ['wau', d.activeUsers.wau],
    ['mau', d.activeUsers.mau],
    ['recycling_kg', d.volume.totalKg],
    ['recycles_completed', d.volume.completed],
    ['drives_total', d.drives.drives],
    ['drive_rsvps', d.drives.rsvps],
    ['drive_checked_in', d.drives.checkedIn],
    ['reward_points_earned', d.rewards.pointsEarned],
    ['reward_points_spent', d.rewards.pointsSpent],
    ['chatbot_messages', d.chatbot.messages],
    ['chatbot_conversations', d.chatbot.conversations],
  ];
  for (const r of d.roles) rows.push([`role_${r.role}`, r.count]);
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

module.exports = { dashboard, exportCsv };
