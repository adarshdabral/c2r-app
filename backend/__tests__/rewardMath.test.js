const {
  LEVEL_THRESHOLDS,
  levelForPoints,
  nextLevelInfo,
  pointsForRule,
  nextStreak,
} = require('../utils/rewardMath');

describe('levelForPoints', () => {
  test.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [299, 2],
    [300, 3],
    [1500, 5],
    [20000, LEVEL_THRESHOLDS.length],
    [999999, LEVEL_THRESHOLDS.length],
  ])('%i points → level %i', (points, level) => {
    expect(levelForPoints(points)).toBe(level);
  });

  test('negative / garbage points floor at level 1', () => {
    expect(levelForPoints(-50)).toBe(1);
    expect(levelForPoints(NaN)).toBe(1);
    expect(levelForPoints('abc')).toBe(1);
  });
});

describe('nextLevelInfo', () => {
  test('mid-level reports remaining points + fractional progress', () => {
    const info = nextLevelInfo(150); // level 2 (100..300)
    expect(info.level).toBe(2);
    expect(info.nextThreshold).toBe(300);
    expect(info.toNext).toBe(150);
    expect(info.progress).toBeCloseTo((150 - 100) / (300 - 100), 5);
  });

  test('max level → progress 1, toNext 0, nextThreshold null', () => {
    const info = nextLevelInfo(999999);
    expect(info.progress).toBe(1);
    expect(info.toNext).toBe(0);
    expect(info.nextThreshold).toBeNull();
  });
});

describe('pointsForRule', () => {
  test('flat rule returns its points', () => {
    expect(pointsForRule({ enabled: true, points: 50, per_kg: false })).toBe(50);
  });

  test('per_kg rule scales by quantity (rounded)', () => {
    expect(pointsForRule({ enabled: true, points: 10, per_kg: true }, 4.5)).toBe(45);
    expect(pointsForRule({ enabled: true, points: 10, per_kg: true }, 0)).toBe(0);
  });

  test('disabled or missing rule awards nothing', () => {
    expect(pointsForRule({ enabled: false, points: 50 })).toBe(0);
    expect(pointsForRule(null)).toBe(0);
  });

  test('never negative', () => {
    expect(pointsForRule({ enabled: true, points: -10, per_kg: false })).toBe(0);
    expect(pointsForRule({ enabled: true, points: 10, per_kg: true }, -3)).toBe(0);
  });
});

describe('nextStreak', () => {
  test('no prior earn → streak starts at 1', () => {
    expect(nextStreak(0, null, '2026-08-08')).toBe(1);
  });
  test('same day → unchanged', () => {
    expect(nextStreak(4, '2026-08-08', '2026-08-08')).toBe(4);
  });
  test('consecutive day → +1', () => {
    expect(nextStreak(4, '2026-08-07', '2026-08-08')).toBe(5);
  });
  test('gap → reset to 1', () => {
    expect(nextStreak(9, '2026-08-01', '2026-08-08')).toBe(1);
  });
});
