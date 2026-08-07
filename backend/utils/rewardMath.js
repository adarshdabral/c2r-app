/**
 * Pure reward math — no DB, no side effects, fully unit-testable. Levels are
 * derived from lifetime points (never stored authoritatively), and points for a
 * rule are computed from its config + an optional quantity.
 */

// Lifetime-point threshold to REACH each level. Level 1 = 0 pts. Index i is the
// floor for level i+1.
const LEVEL_THRESHOLDS = [0, 100, 300, 700, 1500, 3000, 5000, 8000, 12000, 20000];

function levelForPoints(lifetime) {
  const p = Math.max(0, Math.trunc(Number(lifetime) || 0));
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (p >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

// Progress toward the next level: { level, toNext, progress (0..1), nextThreshold }.
function nextLevelInfo(lifetime) {
  const p = Math.max(0, Math.trunc(Number(lifetime) || 0));
  const level = levelForPoints(p);
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? null; // threshold for level+1
  const curThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  if (nextThreshold == null) return { level, toNext: 0, progress: 1, nextThreshold: null };
  const span = nextThreshold - curThreshold || 1;
  const progress = Math.max(0, Math.min(1, (p - curThreshold) / span));
  return { level, toNext: Math.max(0, nextThreshold - p), progress, nextThreshold };
}

// Points a rule awards. `per_kg` rules scale by quantity; flat rules are constant.
// A disabled rule (or missing) awards nothing.
function pointsForRule(rule, quantityKg = 0) {
  if (!rule || !rule.enabled) return 0;
  const base = Math.max(0, Math.trunc(Number(rule.points) || 0));
  if (rule.per_kg) {
    return Math.max(0, Math.round(base * Math.max(0, Number(quantityKg) || 0)));
  }
  return base;
}

// Given the last earn date and "today" (both YYYY-MM-DD), the next streak count:
// same day → unchanged; consecutive day → +1; gap → reset to 1.
function nextStreak(prevStreak, lastEarnDate, today) {
  if (!lastEarnDate) return 1;
  if (lastEarnDate === today) return Math.max(1, Number(prevStreak) || 1);
  const prev = new Date(lastEarnDate + 'T00:00:00Z');
  const cur = new Date(today + 'T00:00:00Z');
  const days = Math.round((cur - prev) / 86400000);
  if (days === 1) return (Number(prevStreak) || 0) + 1;
  return 1;
}

module.exports = { LEVEL_THRESHOLDS, levelForPoints, nextLevelInfo, pointsForRule, nextStreak };
