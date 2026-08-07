const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const chatbot = require('../services/chatbotService');

const MAX_MESSAGE_LEN = 500;

const parseConversationId = (raw) => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid conversationId');
  return id;
};

// POST /api/assistant/query  { message, conversationId? }
// Returns a typed response: info | action | confirm.
const query = asyncHandler(async (req, res) => {
  const raw = req.body?.message;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw ApiError.badRequest('message is required');
  }
  const message = raw.slice(0, MAX_MESSAGE_LEN);
  const conversationId = parseConversationId(req.body?.conversationId);
  res.json(await chatbot.handleMessage(req.user, message, conversationId));
});

// POST /api/assistant/execute  { actionId, params?, conversationId? }
// Runs a confirmed action. Re-verifies role permission server-side.
const execute = asyncHandler(async (req, res) => {
  const actionId = req.body?.actionId;
  if (typeof actionId !== 'string' || !actionId.trim()) {
    throw ApiError.badRequest('actionId is required');
  }
  const params = req.body?.params && typeof req.body.params === 'object' ? req.body.params : {};
  const conversationId = parseConversationId(req.body?.conversationId);
  res.json(await chatbot.executeAction(req.user, actionId, params, conversationId));
});

// GET /api/assistant/history?conversationId=
const history = asyncHandler(async (req, res) => {
  const conversationId = parseConversationId(req.query?.conversationId);
  res.json(await chatbot.getHistory(req.user, conversationId));
});

// GET /api/assistant/suggestions — greeting + starter prompts + available actions.
const suggestions = asyncHandler(async (req, res) => {
  res.json(chatbot.intro(req.user));
});

module.exports = { query, execute, history, suggestions };
