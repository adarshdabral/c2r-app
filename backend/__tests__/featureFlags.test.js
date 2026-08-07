const { parseBool, DEFAULTS, FEATURE_KEYS } = require('../config/features');

// featureService talks to app_settings — mock the model so these stay pure units.
jest.mock('../models/settingsModel', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));
const settings = require('../models/settingsModel');
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

describe('featureService.getFlags', () => {
  test('with no overrides, returns the built-in defaults', async () => {
    settings.getSetting.mockResolvedValue(null);
    const flags = await featureService.getFlags({ fresh: true });
    expect(flags).toEqual(DEFAULTS);
  });

  test('an admin override wins over the default', async () => {
    // rewards overridden off, others default.
    settings.getSetting.mockImplementation(async (key) =>
      key === 'feature_rewards' ? '0' : null
    );
    const flags = await featureService.getFlags({ fresh: true });
    expect(flags.rewards).toBe(false);
    expect(flags.personalization).toBe(DEFAULTS.personalization);
  });

  test('override value "1" forces a feature on', async () => {
    settings.getSetting.mockImplementation(async (key) =>
      key === 'feature_chatbot' ? '1' : null
    );
    const flags = await featureService.getFlags({ fresh: true });
    expect(flags.chatbot).toBe(true);
  });

  test('falls back to defaults if the settings store throws', async () => {
    settings.getSetting.mockRejectedValue(new Error('db down'));
    const flags = await featureService.getFlags({ fresh: true });
    expect(flags).toEqual(DEFAULTS);
  });

  test('caches within the TTL (no repeat reads)', async () => {
    settings.getSetting.mockResolvedValue(null);
    await featureService.getFlags({ fresh: true });
    const callsAfterFirst = settings.getSetting.mock.calls.length;
    await featureService.getFlags(); // cached — no new reads
    expect(settings.getSetting.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('featureService.setOverride', () => {
  test('persists the override and invalidates the cache', async () => {
    settings.getSetting.mockResolvedValue(null);
    await featureService.getFlags({ fresh: true }); // warm cache
    await featureService.setOverride('rewards', false);
    expect(settings.setSetting).toHaveBeenCalledWith('feature_rewards', '0');
    // Next read re-resolves (cache was cleared).
    settings.getSetting.mockImplementation(async (key) => (key === 'feature_rewards' ? '0' : null));
    const flags = await featureService.getFlags();
    expect(flags.rewards).toBe(false);
  });

  test('rejects an unknown feature key', async () => {
    await expect(featureService.setOverride('bogus', true)).rejects.toThrow(/Unknown feature/);
  });
});

describe('requireFeature middleware', () => {
  const run = async (enabled) => {
    settings.getSetting.mockImplementation(async (key) =>
      key === 'feature_rewards' ? (enabled ? '1' : '0') : null
    );
    featureService._resetCache();
    const next = jest.fn();
    const mw = requireFeature('rewards');
    await mw({}, {}, next);
    return next;
  };

  test('calls next() when the feature is enabled', async () => {
    const next = await run(true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined(); // no error
  });

  test('passes a 404 ApiError to next() when disabled', async () => {
    const next = await run(false);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(404);
  });
});
