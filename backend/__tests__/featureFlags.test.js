const { parseBool, DEFAULTS, FEATURE_KEYS } = require('../config/features');

// featureService reads/writes the feature_flags table — mock the model so these
// stay pure units.
jest.mock('../models/featureFlagModel', () => ({
  getEnabledMap: jest.fn(),
  listFlags: jest.fn(),
  setEnabled: jest.fn(),
  getFlag: jest.fn(),
  seedDefault: jest.fn(),
}));
const flagModel = require('../models/featureFlagModel');
const featureService = require('../services/featureService');
const { requireFeature } = require('../middleware/featureFlag');
const ApiError = require('../utils/ApiError');

beforeEach(() => {
  jest.clearAllMocks();
  featureService._resetCache();
});

describe('config/features parseBool', () => {
  test.each([
    ['1', true],
    ['true', true],
    ['on', true],
    ['YES', true],
    ['enabled', true],
    ['0', false],
    ['false', false],
    ['off', false],
    ['nonsense', false],
  ])('parses %s → %s', (input, expected) => {
    expect(parseBool(input, false)).toBe(expected);
  });

  test.each([undefined, null, ''])('empty (%p) → fallback', (input) => {
    expect(parseBool(input, true)).toBe(true);
    expect(parseBool(input, false)).toBe(false);
  });

  test('defaults are all booleans for every key', () => {
    for (const key of FEATURE_KEYS) {
      expect(typeof DEFAULTS[key]).toBe('boolean');
    }
  });
});

describe('featureService.getFlags (DB-backed)', () => {
  test('reads enabled state from the feature_flags table', async () => {
    flagModel.getEnabledMap.mockResolvedValue({ personalization: true, rewards: false, chatbot: true });
    const flags = await featureService.getFlags({ fresh: true });
    expect(flags.rewards).toBe(false);
    expect(flags.personalization).toBe(true);
  });

  test('a key with no DB row falls back to its seed default', async () => {
    flagModel.getEnabledMap.mockResolvedValue({}); // table empty
    const flags = await featureService.getFlags({ fresh: true });
    expect(flags).toEqual(DEFAULTS);
  });

  test('falls back to seed defaults if the DB read throws', async () => {
    flagModel.getEnabledMap.mockRejectedValue(new Error('db down'));
    const flags = await featureService.getFlags({ fresh: true });
    expect(flags).toEqual(DEFAULTS);
  });

  test('caches within the TTL (no repeat reads)', async () => {
    flagModel.getEnabledMap.mockResolvedValue({ rewards: true });
    await featureService.getFlags({ fresh: true });
    const calls = flagModel.getEnabledMap.mock.calls.length;
    await featureService.getFlags(); // cached
    expect(flagModel.getEnabledMap.mock.calls.length).toBe(calls);
  });
});

describe('featureService.setEnabled', () => {
  test('persists via the model, records updatedBy, invalidates cache', async () => {
    flagModel.getEnabledMap.mockResolvedValue({ rewards: true });
    await featureService.getFlags({ fresh: true }); // warm cache
    flagModel.setEnabled.mockResolvedValue({ key: 'rewards', enabled: false, updatedBy: 9 });

    const updated = await featureService.setEnabled('rewards', false, 9);
    expect(flagModel.setEnabled).toHaveBeenCalledWith('rewards', false, 9);
    expect(updated.enabled).toBe(false);

    // Next read re-resolves from the DB (cache cleared).
    flagModel.getEnabledMap.mockResolvedValue({ rewards: false });
    const flags = await featureService.getFlags();
    expect(flags.rewards).toBe(false);
  });

  test('rejects an unknown feature key', async () => {
    await expect(featureService.setEnabled('bogus', true, 1)).rejects.toThrow(/Unknown feature/);
  });
});

describe('requireFeature middleware', () => {
  const run = async (enabled) => {
    flagModel.getEnabledMap.mockResolvedValue({ rewards: enabled });
    featureService._resetCache();
    const next = jest.fn();
    await requireFeature('rewards')({}, {}, next);
    return next;
  };

  test('calls next() when the feature is enabled', async () => {
    const next = await run(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  test('passes a 403 FEATURE_DISABLED error to next() when disabled', async () => {
    const next = await run(false);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FEATURE_DISABLED');
    expect(err.feature).toBe('rewards');
  });
});
