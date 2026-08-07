/**
 * Reward engine — the one place that decides how points are earned, spent, and
 * expired. Controllers and triggers call this; it applies the admin-configured
 * rules (cap / cooldown / expiry), writes the transactional ledger, updates the
 * streak, evaluates badges, and best-effort mirrors to the blockchain ledger.
 *
 * Earning is idempotent per (event_type, ref) so a retried completion never
 * double-awards. Everything is gated by the `rewards` feature flag.
 */
const rewardModel = require('../models/rewardModel');
const ruleModel = require('../models/rewardRuleModel');
const badgeModel = require('../models/badgeModel');
const catalogModel = require('../models/rewardCatalogModel');
const ledger = require('./rewardsLedger');
const { isEnabled } = require('./featureService');
const { isRewardsEnabled } = require('../models/settingsModel');
const { pointsForRule, nextStreak, nextLevelInfo } = require('../utils/rewardMath');
const { findUserById } = require('../models/userModel');
const logger = require('../utils/logger');

const accountIdForUser = (userId) => `user_${userId}`;

// The rewards program is live only when BOTH the structural feature flag is on
// AND an admin has activated it (the legacy `rewards_enabled` operational toggle,
// default OFF — preserves prior behaviour of "no awards until switched on").
async function rewardsActive() {
  return (await isEnabled('rewards')) && (await isRewardsEnabled());
}

const today = () => new Date().toISOString().slice(0, 10);
const datePlusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const asDay = (d) =>
  !d ? null : typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);

// Best-effort mirror of a delta to the external ledger. Never throws.
async function mirrorToLedger(userId, delta) {
  if (!ledger.isConfigured() || !delta) return;
  try {
    const user = await findUserById(userId);
    const id = accountIdForUser(userId);
    await ledger.ensureAccount(id, (user && user.name) || id);
    if (delta > 0) await ledger.give(id, delta);
    else await ledger.redeem(id, -delta);
  } catch (err) {
    logger.warn('reward ledger mirror failed (ignored)', { userId, error: err.message });
  }
}

/**
 * Award points for an event. Returns
 *   { awarded, applied, reason }  — awarded=points added (0 when skipped).
 * Skips (awarded:0) on: feature off, disabled/missing rule, daily cap hit,
 * cooldown, zero points, or a duplicate ref. May throw only on real errors.
 */
async function award(userId, eventType, opts = {}) {
  if (!(await rewardsActive())) return { awarded: 0, applied: false, reason: 'feature_off' };
  const { quantityKg = 0, refType = null, refId = null, meta = null } = opts;

  const rule = await ruleModel.getRule(eventType);
  if (!rule || !rule.enabled) return { awarded: 0, applied: false, reason: 'rule_disabled' };

  if (rule.dailyCap != null) {
    const usedToday = await rewardModel.countEventToday(userId, eventType);
    if (usedToday >= rule.dailyCap) return { awarded: 0, applied: false, reason: 'daily_cap' };
  }
  if (rule.cooldownSeconds != null) {
    const since = await rewardModel.secondsSinceLast(userId, eventType);
    if (since != null && since < rule.cooldownSeconds) {
      return { awarded: 0, applied: false, reason: 'cooldown' };
    }
  }

  const points = pointsForRule(rule, quantityKg);
  if (points <= 0) return { awarded: 0, applied: false, reason: 'zero_points' };

  const expiresAt = rule.expiresDays ? datePlusDays(rule.expiresDays) : null;

  // Streak: recycle completions extend a daily streak.
  let streakUpdate = {};
  if (eventType === 'recycle_completed') {
    const acct = await rewardModel.ensureAccount(userId);
    const streakCount = nextStreak(acct.streakCount, asDay(acct.lastEarnDate), today());
    streakUpdate = { streakCount, lastEarnDate: today() };
  }

  const result = await rewardModel.appendTransaction({
    userId,
    delta: points,
    eventType,
    reason: rule.description || eventType,
    refType,
    refId,
    expiresAt,
    meta,
    ...streakUpdate,
  });

  if (!result.applied) return { awarded: 0, applied: false, reason: result.reason };

  await mirrorToLedger(userId, points);
  const badges = await evaluateBadges(userId);

  // A qualifying streak grants a once-daily bonus (its own rule/cap apply).
  if (eventType === 'recycle_completed' && (streakUpdate.streakCount || 0) >= 2) {
    await award(userId, 'streak_bonus', { refType: 'streak', refId: null }).catch(() => {});
  }

  return { awarded: points, applied: true, reason: 'ok', badges };
}

// Fire-and-forget wrapper for triggers on the request path. Never throws.
async function awardSafe(userId, eventType, opts = {}) {
  try {
    return await award(userId, eventType, opts);
  } catch (err) {
    logger.error('reward award failed (ignored)', { userId, eventType, error: err.message });
    return { awarded: 0, applied: false, reason: 'error' };
  }
}

// Admin: grant a manual bonus. Throws on bad input.
async function grant(userId, points, { reason, adminId }) {
  const amount = Math.trunc(Number(points));
  if (!Number.isFinite(amount) || amount <= 0) {
    const e = new Error('points must be a positive integer');
    e.statusCode = 400;
    throw e;
  }
  const res = await rewardModel.appendTransaction({
    userId,
    delta: amount,
    eventType: 'admin_grant',
    reason: reason || 'Admin bonus',
    refType: 'admin',
    createdBy: adminId,
  });
  await mirrorToLedger(userId, amount);
  await evaluateBadges(userId);
  return res;
}

// Admin: deduct points. Throws 400 on overspend (handled in the model).
async function deduct(userId, points, { reason, adminId }) {
  const amount = Math.trunc(Number(points));
  if (!Number.isFinite(amount) || amount <= 0) {
    const e = new Error('points must be a positive integer');
    e.statusCode = 400;
    throw e;
  }
  const res = await rewardModel.appendTransaction({
    userId,
    delta: -amount,
    eventType: 'admin_deduct',
    reason: reason || 'Admin adjustment',
    refType: 'admin',
    createdBy: adminId,
  });
  await mirrorToLedger(userId, -amount);
  return res;
}

// User: redeem a catalog item. Throws 400 (insufficient / unavailable).
async function redeem(userId, catalogCode) {
  const item = await catalogModel.getCatalogItem(catalogCode);
  if (!item || !item.enabled) {
    const e = new Error('Reward not available');
    e.statusCode = 404;
    throw e;
  }
  const acct = await rewardModel.ensureAccount(userId);
  if (acct.pointsBalance < item.pointsCost) {
    const e = new Error('Not enough points to redeem this reward');
    e.statusCode = 400;
    throw e;
  }
  if (item.stock != null) {
    const ok = await catalogModel.decrementStock(catalogCode);
    if (!ok) {
      const e = new Error('This reward is out of stock');
      e.statusCode = 409;
      throw e;
    }
  }
  // Spend is authoritative in the local ledger; the model rejects overspend even
  // under a race (row lock).
  await rewardModel.appendTransaction({
    userId,
    delta: -item.pointsCost,
    eventType: 'redeem',
    reason: `Redeemed: ${item.name}`,
    refType: 'redemption',
  });
  await mirrorToLedger(userId, -item.pointsCost);
  const voucherCode = `CTR-${catalogCode.toUpperCase().slice(0, 6)}-${userId}-${Date.now().toString(36).toUpperCase()}`;
  const id = await catalogModel.createRedemption({
    userId,
    catalogCode,
    pointsSpent: item.pointsCost,
    voucherCode,
  });
  return { id, catalogCode, name: item.name, pointsSpent: item.pointsCost, voucherCode, status: 'REQUESTED' };
}

// Evaluate every badge's criteria and award any newly met. Returns new codes.
async function evaluateBadges(userId) {
  const acct = await rewardModel.getAccount(userId);
  if (!acct) return [];
  const defs = await badgeModel.listBadges();
  const newly = [];
  for (const b of defs) {
    let met = false;
    if (b.criteriaType === 'lifetime_points') met = acct.lifetimePoints >= b.threshold;
    else if (b.criteriaType === 'streak') met = acct.streakCount >= b.threshold;
    else if (b.criteriaType === 'level') met = acct.level >= b.threshold;
    else if (b.criteriaType === 'event_count') {
      met = (await badgeModel.eventCount(userId, b.criteriaEvent)) >= b.threshold;
    }
    if (met && (await badgeModel.awardBadge(userId, b.code))) newly.push(b.code);
  }
  return newly;
}

// Assembled reward profile for /rewards/me.
async function getProfile(userId) {
  const acct = await rewardModel.ensureAccount(userId);
  const info = nextLevelInfo(acct.lifetimePoints);
  const badges = await badgeModel.listUserBadges(userId);
  return {
    pointsBalance: acct.pointsBalance,
    lifetimePoints: acct.lifetimePoints,
    level: info.level,
    toNext: info.toNext,
    progress: info.progress,
    nextThreshold: info.nextThreshold,
    streakCount: acct.streakCount,
    badges,
  };
}

// Scheduled sweep: claw back expired earn rows (append a negative 'expire' tx per
// row so the balance and history stay consistent). Returns { expired, points }.
async function runExpirySweep() {
  if (!(await rewardsActive())) return { expired: 0, points: 0 };
  const due = await rewardModel.dueForExpiry();
  let points = 0;
  for (const row of due) {
    try {
      await rewardModel.appendTransaction({
        userId: row.userId,
        delta: -row.delta,
        eventType: 'expire',
        reason: 'Points expired',
        refType: 'ledger',
        refId: row.id,
      });
      await rewardModel.markExpired(row.id);
      await mirrorToLedger(row.userId, -row.delta);
      points += row.delta;
    } catch (err) {
      logger.warn('reward expiry failed for row (skipped)', { id: row.id, error: err.message });
    }
  }
  if (due.length) logger.info('reward expiry sweep', { expired: due.length, points });
  return { expired: due.length, points };
}

module.exports = {
  accountIdForUser,
  award,
  awardSafe,
  grant,
  deduct,
  redeem,
  evaluateBadges,
  getProfile,
  runExpirySweep,
};
