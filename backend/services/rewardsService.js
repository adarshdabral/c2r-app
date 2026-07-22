/**
 * Reward-points business logic layered over the raw ledger client. Keeps the
 * "how many points, for whom, when" rules in one place so the completion
 * controllers only have to fire a single best-effort call.
 */
const logger = require('../utils/logger');
const ledger = require('./rewardsLedger');
const { isRewardsEnabled } = require('../models/settingsModel');
const { findUserById } = require('../models/userModel');

// Points earned per kg recycled (configurable). points = round(kg * rate).
const POINTS_PER_KG = Number(process.env.REWARDS_POINTS_PER_KG) || 10;

// One ledger account per app user. Recyclers/admins never earn — only the
// citizen who raised the pickup/drop-off does.
const accountIdForUser = (userId) => `user_${userId}`;

const pointsForQuantity = (kg) => Math.max(0, Math.round(Number(kg) * POINTS_PER_KG));

/**
 * Award reward points for a completed recycle (a pickup or drop-off that just
 * reached COMPLETED). BEST-EFFORT: this never throws — a disabled flag, an
 * unconfigured or unreachable ledger, or a bad quantity all resolve to a
 * silent no-op so the recycle-completion response is never affected.
 *
 * @param {object} request  the completed request (needs userId + actualQuantityKg)
 * @param {'pickup'|'dropoff'} source
 */
async function awardForCompletion(request, source) {
  try {
    if (!ledger.isConfigured()) return;
    if (!(await isRewardsEnabled())) return;

    const userId = request && request.userId;
    const qty = request && request.actualQuantityKg;
    if (!userId || !Number.isFinite(Number(qty))) return;

    const points = pointsForQuantity(qty);
    if (points <= 0) return;

    const user = await findUserById(userId);
    const id = accountIdForUser(userId);
    await ledger.ensureAccount(id, (user && user.name) || id);
    await ledger.give(id, points);

    logger.info('reward points awarded', { userId, points, source, requestId: request.id });
  } catch (err) {
    // Swallow: rewards must never break or slow the completion path.
    logger.error('reward award failed (ignored)', {
      error: err.message,
      userId: request && request.userId,
      source,
    });
  }
}

module.exports = { awardForCompletion, accountIdForUser, pointsForQuantity, POINTS_PER_KG };
