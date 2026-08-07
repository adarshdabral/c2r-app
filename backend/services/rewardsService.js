/**
 * Recycle-completion reward hook. Thin adapter kept for backward compatibility:
 * the pickup/drop-off controllers call awardForCompletion() exactly as before,
 * but the logic now lives in the reward engine (local ledger + badges + streak,
 * with the blockchain ledger as an optional mirror).
 */
const engine = require('./rewardEngine');
const { findUserById } = require('../models/userModel');
const logger = require('../utils/logger');

/**
 * Award points for a completed recycle (pickup/drop-off that reached COMPLETED).
 * Best-effort / fire-and-forget: never throws or slows the completion path.
 * @param {object} request  needs { userId, actualQuantityKg, id }
 * @param {'pickup'|'dropoff'} source
 */
async function awardForCompletion(request, source) {
  try {
    const userId = request && request.userId;
    const qty = request && request.actualQuantityKg;
    if (!userId) return;

    await engine.awardSafe(userId, 'recycle_completed', {
      quantityKg: qty,
      refType: source,
      refId: request.id,
      meta: { source },
    });

    // Bulk producers earn an additional per-kg bonus.
    const user = await findUserById(userId);
    if (user && user.user_type === 'bulk_producer') {
      await engine.awardSafe(userId, 'bulk_recycle', {
        quantityKg: qty,
        refType: source,
        refId: request.id,
      });
    }
  } catch (err) {
    logger.error('reward award failed (ignored)', {
      error: err.message,
      userId: request && request.userId,
      source,
    });
  }
}

module.exports = {
  awardForCompletion,
  // Re-exported so existing importers (rewardController) keep working.
  accountIdForUser: engine.accountIdForUser,
};
