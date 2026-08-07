/**
 * Rewards endpoints (mounted at /api/rewards, structurally gated by
 * requireFeature('rewards')). The `enabled` field in responses reflects the
 * admin *operational* toggle (rewards_enabled) so the existing client keeps
 * working: it hides the UI on enabled:false. When off, reads return empty,
 * zeroed shapes and writes are refused.
 *
 * Points/badges/redemptions are served from the local reward store (system of
 * record); the blockchain ledger is a best-effort mirror maintained by the
 * engine.
 */
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const engine = require('../services/rewardEngine');
const rewardModel = require('../models/rewardModel');
const ruleModel = require('../models/rewardRuleModel');
const badgeModel = require('../models/badgeModel');
const catalogModel = require('../models/rewardCatalogModel');
const { isRewardsEnabled } = require('../models/settingsModel');
const { findUserById } = require('../models/userModel');

const operationallyLive = async () => isRewardsEnabled();

/* ============================== USER ============================== */

// GET /status — is the programme active? (structural gate already passed).
const statusHandler = asyncHandler(async (_req, res) => {
  res.json({ enabled: await operationallyLive() });
});

// GET /me — balance, level, streak, badges (+ backward-compatible points/owner/id).
const myRewardsHandler = asyncHandler(async (req, res) => {
  if (!(await operationallyLive())) {
    return res.json({ enabled: false, points: 0, owner: null });
  }
  const profile = await engine.getProfile(req.user.id);
  const user = await findUserById(req.user.id);
  res.json({
    enabled: true,
    id: engine.accountIdForUser(req.user.id),
    owner: (user && user.name) || null,
    points: profile.pointsBalance, // backward-compat alias
    ...profile,
  });
});

// GET /me/history — the local ledger (append-only transaction trail).
const myHistoryHandler = asyncHandler(async (req, res) => {
  if (!(await operationallyLive())) {
    return res.json({ enabled: false, history: [] });
  }
  const history = await rewardModel.listLedger(req.user.id, { limit: 100 });
  res.json({ enabled: true, history });
});

// GET /me/badges — all badge definitions with an `earned` flag.
const myBadgesHandler = asyncHandler(async (req, res) => {
  const [defs, mine] = await Promise.all([
    badgeModel.listBadges(),
    badgeModel.listUserBadges(req.user.id),
  ]);
  const earned = new Map(mine.map((b) => [b.code, b.awardedAt]));
  res.json({
    badges: defs.map((b) => ({
      ...b,
      earned: earned.has(b.code),
      awardedAt: earned.get(b.code) || null,
    })),
  });
});

// GET /catalog — redeemable items + the caller's balance.
const catalogHandler = asyncHandler(async (req, res) => {
  const [catalog, account] = await Promise.all([
    catalogModel.listCatalog(),
    rewardModel.ensureAccount(req.user.id),
  ]);
  res.json({ catalog, balance: account.pointsBalance });
});

// POST /redeem { code } — spend points on a catalog item.
const redeemHandler = asyncHandler(async (req, res) => {
  if (!(await operationallyLive())) throw ApiError.badRequest('Rewards are not active right now');
  const code = String(req.body.code || '');
  if (!code) throw ApiError.badRequest('code is required');
  const redemption = await engine.redeem(req.user.id, code);
  res.status(201).json({ redemption });
});

// GET /me/redemptions — the caller's redemption history.
const myRedemptionsHandler = asyncHandler(async (req, res) => {
  res.json({ redemptions: await catalogModel.listRedemptions(req.user.id) });
});

// GET /leaderboard — top earners + the caller's rank.
const leaderboardHandler = asyncHandler(async (req, res) => {
  const leaderboard = await rewardModel.leaderboard(20);
  const meRow = leaderboard.find((r) => r.userId === req.user.id) || null;
  res.json({ leaderboard, me: meRow });
});

/* ============================== ADMIN ============================== */

// GET /admin/rules
const adminListRules = asyncHandler(async (_req, res) => {
  res.json({ rules: await ruleModel.listRules() });
});

// PATCH /admin/rules/:eventType
const adminUpdateRule = asyncHandler(async (req, res) => {
  const existing = await ruleModel.getRule(req.params.eventType);
  if (!existing) throw ApiError.notFound('Unknown reward rule');
  const patch = {};
  for (const k of ['points', 'perKg', 'enabled', 'dailyCap', 'cooldownSeconds', 'expiresDays', 'description']) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  res.json({ rule: await ruleModel.updateRule(req.params.eventType, patch) });
});

const parseTargetUser = async (raw) => {
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) throw ApiError.badRequest('Valid userId is required');
  const user = await findUserById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return userId;
};

// POST /admin/grant { userId, points, reason }
const adminGrant = asyncHandler(async (req, res) => {
  const userId = await parseTargetUser(req.body.userId);
  const result = await engine.grant(userId, req.body.points, {
    reason: req.body.reason,
    adminId: req.user.id,
  });
  res.status(201).json({ result });
});

// POST /admin/deduct { userId, points, reason }
const adminDeduct = asyncHandler(async (req, res) => {
  const userId = await parseTargetUser(req.body.userId);
  const result = await engine.deduct(userId, req.body.points, {
    reason: req.body.reason,
    adminId: req.user.id,
  });
  res.status(201).json({ result });
});

// GET /admin/analytics
const adminAnalytics = asyncHandler(async (_req, res) => {
  res.json({ analytics: await rewardModel.analytics() });
});

// GET /admin/export — CSV of the full ledger.
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const adminExport = asyncHandler(async (_req, res) => {
  const rows = await rewardModel.exportRows();
  const header = ['created_at', 'user_id', 'name', 'event_type', 'delta', 'balance_after', 'reason', 'ref_type', 'ref_id', 'expired'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const created = r.created_at && r.created_at.toISOString ? r.created_at.toISOString() : r.created_at;
    lines.push(
      [created, r.user_id, r.name, r.event_type, r.delta, r.balance_after, r.reason, r.ref_type, r.ref_id, r.expired]
        .map(csvCell)
        .join(',')
    );
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reward-ledger.csv"');
  res.send(lines.join('\n'));
});

module.exports = {
  statusHandler,
  myRewardsHandler,
  myHistoryHandler,
  myBadgesHandler,
  catalogHandler,
  redeemHandler,
  myRedemptionsHandler,
  leaderboardHandler,
  adminListRules,
  adminUpdateRule,
  adminGrant,
  adminDeduct,
  adminAnalytics,
  adminExport,
};
