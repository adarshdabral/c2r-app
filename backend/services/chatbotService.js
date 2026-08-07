/**
 * Chatbot orchestrator. Turns a message into either:
 *  - an ACTION result (read action executed immediately),
 *  - a CONFIRM prompt (write action awaiting user confirmation), or
 *  - an INFO reply (falls back to the existing rule/intent engine).
 *
 * Persists conversation memory (chat_messages) and executes confirmed actions.
 * Role-aware and permission-checked via the action registry. Reuses existing
 * models/services — no business logic is duplicated here.
 */
const registry = require('./chatbot/actionRegistry');
const chatModel = require('../models/chatModel');
const assistant = require('./assistantService');
const { findUserById } = require('../models/userModel');
const { starterSuggestions } = require('./assistantService');
const logger = require('../utils/logger');

async function buildCtx(user) {
  let userType = null;
  let name = null;
  try {
    const row = await findUserById(user.id);
    userType = row?.user_type || null;
    name = row?.name || null;
  } catch {
    /* non-critical */
  }
  return { user: { id: user.id, role: user.role, userType, name } };
}

// Handle a free-text message from the user.
async function handleMessage(user, message, conversationId) {
  const convId = conversationId || (await chatModel.ensureConversation(user.id));
  await chatModel.addMessage({ conversationId: convId, userId: user.id, role: 'user', content: message });

  const ctx = await buildCtx(user);
  const match = registry.findMatch(message, user.role);
  let response;

  if (match && match.confirm) {
    // Write action → resolve a concrete target + confirmation prompt.
    const prep = match.prepare ? await match.prepare(ctx) : { ok: true, params: {}, confirmText: `Confirm: ${match.title}?` };
    if (!prep.ok) {
      response = { type: 'info', reply: prep.reply, intent: match.id, suggestions: prep.suggestions };
    } else {
      response = {
        type: 'confirm',
        actionId: match.id,
        params: prep.params,
        reply: prep.confirmText,
        quickReplies: ['Yes, do it', 'Cancel'],
        intent: match.id,
      };
    }
  } else if (match) {
    // Read action → execute immediately.
    try {
      const res = await match.execute(ctx);
      response = { type: 'action', actionId: match.id, reply: res.reply, data: res.data, action: res.action, suggestions: res.suggestions, intent: match.id };
    } catch (err) {
      logger.warn('chatbot action failed', { actionId: match.id, error: err.message });
      response = { type: 'info', reply: 'Sorry, I couldn\'t do that just now. Please try again.', intent: match.id };
    }
  } else {
    // Informational fallback (existing rule/intent engine).
    const info = await assistant.answer(message, user);
    response = { type: 'info', reply: info.reply, intent: info.intent, suggestions: info.suggestions, action: info.action };
  }

  await chatModel.addMessage({
    conversationId: convId,
    userId: user.id,
    role: 'assistant',
    content: response.reply,
    intent: response.intent,
    action: response.actionId || null,
    meta: { type: response.type, params: response.params || null },
  });

  return { conversationId: convId, ...response };
}

// Execute a previously-confirmed action.
async function executeAction(user, actionId, params, conversationId) {
  const handler = registry.getById(actionId, user.role);
  if (!handler) {
    const e = new Error('Unknown action or not permitted for your role');
    e.statusCode = 403;
    throw e;
  }
  const ctx = await buildCtx(user);
  const res = await handler.execute(ctx, params || {});
  const convId = conversationId || (await chatModel.ensureConversation(user.id));
  await chatModel.addMessage({
    conversationId: convId,
    userId: user.id,
    role: 'assistant',
    content: res.reply,
    action: actionId,
    meta: { type: 'executed' },
  });
  return { conversationId: convId, type: 'action', actionId, reply: res.reply, data: res.data, action: res.action, suggestions: res.suggestions };
}

// Conversation history.
async function getHistory(user, conversationId) {
  const convId = conversationId || (await chatModel.ensureConversation(user.id));
  if (conversationId && !(await chatModel.ownsConversation(convId, user.id))) {
    const e = new Error('Conversation not found');
    e.statusCode = 404;
    throw e;
  }
  const messages = await chatModel.listMessages(convId, user.id);
  return { conversationId: convId, messages };
}

// Starter greeting + role-aware suggestions + available actions.
function intro(user) {
  return {
    greeting:
      "Hi! I'm your Connect2Recycle assistant — I can answer questions and take actions like tracking or cancelling a pickup, finding recyclers, or joining a drive.",
    suggestions: starterSuggestions(user.role),
    actions: registry.listForRole(user.role),
  };
}

module.exports = { handleMessage, executeAction, getHistory, intro };
