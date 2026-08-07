const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { answer, starterSuggestions } = require('../services/assistantService');

const MAX_MESSAGE_LEN = 500;

// POST /api/assistant/query  { message }
const query = asyncHandler(async (req, res) => {
  const raw = req.body?.message;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw ApiError.badRequest('message is required');
  }
  const message = raw.slice(0, MAX_MESSAGE_LEN);
  const result = await answer(message, req.user);
  res.json(result);
});

// GET /api/assistant/suggestions — starter prompts (role-aware).
const suggestions = asyncHandler(async (req, res) => {
  res.json({
    greeting:
      "Hi! I'm the Connect2Recycle assistant. Ask me about pickups, drop-offs, accepted e-waste, OTPs, rewards, drives, or reports.",
    suggestions: starterSuggestions(req.user.role)
  });
});

module.exports = { query, suggestions };
