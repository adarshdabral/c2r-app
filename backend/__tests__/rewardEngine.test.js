// Unit-test the engine's decision logic with every dependency mocked (no DB).
jest.mock('../services/featureService', () => ({ isEnabled: jest.fn() }));
jest.mock('../models/settingsModel', () => ({ isRewardsEnabled: jest.fn() }));
jest.mock('../models/rewardRuleModel', () => ({ getRule: jest.fn() }));
jest.mock('../models/rewardModel', () => ({
  ensureAccount: jest.fn(),
  getAccount: jest.fn(),
  countEventToday: jest.fn(),
  secondsSinceLast: jest.fn(),
  appendTransaction: jest.fn(),
}));
jest.mock('../models/badgeModel', () => ({ listBadges: jest.fn(), awardBadge: jest.fn(), eventCount: jest.fn() }));
jest.mock('../models/rewardCatalogModel', () => ({ getCatalogItem: jest.fn(), decrementStock: jest.fn(), createRedemption: jest.fn() }));
jest.mock('../services/rewardsLedger', () => ({ isConfigured: () => false }));
jest.mock('../models/userModel', () => ({ findUserById: jest.fn() }));

const featureService = require('../services/featureService');
const settings = require('../models/settingsModel');
const ruleModel = require('../models/rewardRuleModel');
const rewardModel = require('../models/rewardModel');
const badgeModel = require('../models/badgeModel');
const engine = require('../services/rewardEngine');

const activate = (on = true) => {
  featureService.isEnabled.mockResolvedValue(on);
  settings.isRewardsEnabled.mockResolvedValue(on);
};

beforeEach(() => {
  jest.clearAllMocks();
  badgeModel.listBadges.mockResolvedValue([]);
  rewardModel.appendTransaction.mockResolvedValue({
    applied: true,
    delta: 50,
    balanceAfter: 50,
    lifetime: 50,
    level: 1,
  });
});

describe('award gating', () => {
  test('no-op when the feature is off', async () => {
    activate(false);
    const r = await engine.award(1, 'drive_joined', {});
    expect(r).toMatchObject({ awarded: 0, reason: 'feature_off' });
    expect(rewardModel.appendTransaction).not.toHaveBeenCalled();
  });

  test('no-op when the rule is disabled/missing', async () => {
    activate();
    ruleModel.getRule.mockResolvedValue({ enabled: false, points: 50 });
    const r = await engine.award(1, 'drive_joined', {});
    expect(r).toMatchObject({ awarded: 0, reason: 'rule_disabled' });
  });

  test('respects the daily cap', async () => {
    activate();
    ruleModel.getRule.mockResolvedValue({ enabled: true, points: 20, per_kg: false, dailyCap: 3 });
    rewardModel.countEventToday.mockResolvedValue(3);
    const r = await engine.award(1, 'pickup_scheduled', {});
    expect(r).toMatchObject({ awarded: 0, reason: 'daily_cap' });
  });

  test('respects the cooldown', async () => {
    activate();
    ruleModel.getRule.mockResolvedValue({ enabled: true, points: 20, per_kg: false, cooldownSeconds: 3600 });
    rewardModel.secondsSinceLast.mockResolvedValue(600);
    const r = await engine.award(1, 'pickup_scheduled', {});
    expect(r).toMatchObject({ awarded: 0, reason: 'cooldown' });
  });

  test('duplicate ref → not applied', async () => {
    activate();
    ruleModel.getRule.mockResolvedValue({ enabled: true, points: 50, per_kg: false });
    rewardModel.appendTransaction.mockResolvedValue({ applied: false, reason: 'duplicate' });
    const r = await engine.award(1, 'drive_joined', { refType: 'drive', refId: 7 });
    expect(r).toMatchObject({ awarded: 0, reason: 'duplicate' });
  });

  test('happy path awards points and evaluates badges', async () => {
    activate();
    ruleModel.getRule.mockResolvedValue({ enabled: true, points: 50, per_kg: false });
    const r = await engine.award(1, 'drive_joined', { refType: 'drive', refId: 8 });
    expect(r).toMatchObject({ awarded: 50, applied: true, reason: 'ok' });
    expect(rewardModel.appendTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('evaluateBadges', () => {
  test('awards a lifetime-points badge when the threshold is met', async () => {
    rewardModel.getAccount.mockResolvedValue({ lifetimePoints: 500, streakCount: 0, level: 3 });
    badgeModel.listBadges.mockResolvedValue([
      { code: 'eco_warrior', criteriaType: 'lifetime_points', threshold: 500 },
      { code: 'planet_hero', criteriaType: 'lifetime_points', threshold: 5000 },
    ]);
    badgeModel.awardBadge.mockImplementation(async (_u, code) => code === 'eco_warrior');
    const newly = await engine.evaluateBadges(1);
    expect(newly).toEqual(['eco_warrior']);
  });
});
