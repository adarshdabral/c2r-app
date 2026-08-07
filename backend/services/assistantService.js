const { INTENTS, FALLBACK, starterSuggestions } = require('../config/assistantKnowledge');
const { listForUser } = require('../models/pickupRequestModel');
const userModel = require('../models/userModel');

/**
 * Rule/intent engine (no LLM). Scores the message against every intent's
 * keywords/patterns and returns the best match's reply, personalising a few
 * intents with live data via lazy loaders on `ctx.data`.
 */

const KEYWORD_WEIGHT = 1;
const PATTERN_WEIGHT = 3;

const normalize = (s) => String(s || '').toLowerCase().trim();

// Score one intent against the normalised message.
const scoreIntent = (intent, text) => {
  let score = 0;
  for (const kw of intent.keywords || []) {
    if (text.includes(kw)) score += KEYWORD_WEIGHT;
  }
  for (const re of intent.patterns || []) {
    if (re.test(text)) score += PATTERN_WEIGHT;
  }
  return score;
};

// Pick the highest-scoring intent available to this role. Ties break toward the
// earlier (higher-priority) intent in the catalogue.
const classify = (message, role) => {
  const text = normalize(message);
  if (!text) return { intent: FALLBACK, score: 0 };
  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    if (intent.roles && role && !intent.roles.includes(role)) continue;
    const score = scoreIntent(intent, text);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return best ? { intent: best, score: bestScore } : { intent: FALLBACK, score: 0 };
};

// Lazy, memoised live-data loaders. Only hit the DB when an intent actually
// asks for them, and never let a data failure break the reply.
const makeData = (user) => {
  let pickupPromise;
  return {
    latestPickup: () => {
      if (!pickupPromise) {
        pickupPromise = listForUser(user.id, { limit: 5 })
          .then(({ rows }) => {
            const active = (rows || []).filter(
              (r) => !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(r.status)
            );
            return active[0] || rows?.[0] || null;
          })
          .catch(() => null);
      }
      return pickupPromise;
    }
  };
};

// Answer a single message. Returns { intent, reply, suggestions, action }.
const answer = async (message, user) => {
  const { intent } = classify(message, user.role);

  // protect() only carries { id, role }; fetch the profile row best-effort for
  // user_type (report gating) and a friendly first name (greeting).
  let userType = null;
  let name = user.name || null;
  try {
    const row = await userModel.findUserById(user.id);
    userType = row?.user_type || null;
    if (!name && row?.name) name = String(row.name).trim().split(/\s+/)[0];
  } catch {
    /* non-critical */
  }

  const ctx = {
    id: user.id,
    role: user.role,
    userType,
    name,
    data: makeData(user)
  };

  let reply = intent.reply;
  if (typeof reply === 'function') {
    reply = await reply(ctx);
  }

  return {
    intent: intent.id,
    reply,
    suggestions: intent.suggestions || FALLBACK.suggestions,
    action: intent.action || null
  };
};

module.exports = { classify, answer, starterSuggestions };
