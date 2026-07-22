/**
 * User-facing rewards endpoints (mounted at /api/rewards). Recyclers/admins do
 * not earn points; the balance/history routes are gated to role='user'.
 *
 * Every handler is a no-op-shaped response when the feature is disabled or the
 * ledger is unconfigured — the app reads `enabled:false` and hides the UI, so a
 * turned-off feature performs zero ledger operations.
 */
const asyncHandler = require('../utils/asyncHandler');
const ledger = require('../services/rewardsLedger');
const { isRewardsEnabled } = require('../models/settingsModel');
const { findUserById } = require('../models/userModel');
const { accountIdForUser } = require('../services/rewardsService');

const featureLive = async () => (await isRewardsEnabled()) && ledger.isConfigured();

// GET /api/rewards/status — is the feature on? Any authenticated user may ask;
// the app uses this to decide whether to render the rewards UI at all.
const statusHandler = asyncHandler(async (req, res) => {
  res.json({ enabled: await featureLive() });
});

// GET /api/rewards/me — the current user's balance (creates their ledger
// account lazily on first read).
const myRewardsHandler = asyncHandler(async (req, res) => {
  if (!(await featureLive())) {
    return res.json({ enabled: false, points: 0, owner: null });
  }
  const user = await findUserById(req.user.id);
  const id = accountIdForUser(req.user.id);
  const account = await ledger.ensureAccount(id, (user && user.name) || id);
  res.json({
    enabled: true,
    id,
    owner: (account && account.owner) || (user && user.name) || null,
    points: Number(account && account.points) || 0,
  });
});

// GET /api/rewards/me/history — the tamper-evident on-chain audit trail.
const myHistoryHandler = asyncHandler(async (req, res) => {
  if (!(await featureLive())) {
    return res.json({ enabled: false, history: [] });
  }
  const user = await findUserById(req.user.id);
  const id = accountIdForUser(req.user.id);
  // Ensure the account exists so a brand-new user's history read doesn't 500.
  await ledger.ensureAccount(id, (user && user.name) || id);
  const raw = await ledger.getHistory(id);
  const history = (Array.isArray(raw) ? raw : []).map((e) => ({
    txId: e.txId,
    timestamp:
      e.timestamp && e.timestamp.seconds
        ? new Date(e.timestamp.seconds * 1000).toISOString()
        : null,
    points: Number(e.value && e.value.AppraisedValue) || 0,
    owner: (e.value && e.value.Owner) || null,
  }));
  res.json({ enabled: true, history });
});

module.exports = { statusHandler, myRewardsHandler, myHistoryHandler };
