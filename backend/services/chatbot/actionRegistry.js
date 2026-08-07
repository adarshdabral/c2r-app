/**
 * Action registry — aggregates every chatbot action handler and provides
 * role-scoped lookup + intent matching. Adding a capability is just adding a
 * handler to one of the action modules (extensible, loosely coupled).
 */
const consumerActions = require('./actions/consumerActions');
const staffActions = require('./actions/staffActions');

const ALL = [...consumerActions, ...staffActions];

const KEYWORD_WEIGHT = 1;
const PATTERN_WEIGHT = 3;
const THRESHOLD = 2; // require a pattern hit or two keyword hits (conservative)

const scoreHandler = (handler, text) => {
  let s = 0;
  for (const k of handler.keywords || []) if (text.includes(k)) s += KEYWORD_WEIGHT;
  for (const re of handler.patterns || []) if (re.test(text)) s += PATTERN_WEIGHT;
  return s;
};

const permittedFor = (role) => ALL.filter((h) => h.roles.includes(role));

// Best-matching permitted action for a message, or null (falls back to info).
const findMatch = (message, role) => {
  const text = String(message || '').toLowerCase();
  if (!text) return null;
  let best = null;
  let bestScore = 0;
  for (const h of permittedFor(role)) {
    const s = scoreHandler(h, text);
    if (s > bestScore) {
      best = h;
      bestScore = s;
    }
  }
  return bestScore >= THRESHOLD ? best : null;
};

const getById = (id, role) => permittedFor(role).find((h) => h.id === id) || null;

const listForRole = (role) =>
  permittedFor(role).map((h) => ({ id: h.id, title: h.title, confirm: !!h.confirm }));

module.exports = { findMatch, getById, listForRole, permittedFor };
