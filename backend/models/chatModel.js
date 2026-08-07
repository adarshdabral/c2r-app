const db = require('../config/db');

/** Chatbot conversation memory — conversations + messages. */

const mapMessage = (r) => ({
  id: r.id,
  role: r.role,
  content: r.content,
  intent: r.intent,
  action: r.action,
  meta: r.meta || null,
  createdAt: r.created_at,
});

// The user's current (most recent) conversation, or a new one.
const ensureConversation = async (userId) => {
  const [rows] = await db.query(
    'SELECT id FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [userId]
  );
  if (rows[0]) return rows[0].id;
  const [res] = await db.execute('INSERT INTO chat_conversations (user_id) VALUES (?)', [userId]);
  return res.insertId;
};

const touchConversation = async (id) => {
  await db.execute('UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?', [id]);
};

const addMessage = async ({ conversationId, userId, role, content, intent, action, meta }) => {
  const [res] = await db.execute(
    `INSERT INTO chat_messages (conversation_id, user_id, role, content, intent, action, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [conversationId, userId, role, content, intent ?? null, action ?? null, meta ? JSON.stringify(meta) : null]
  );
  await touchConversation(conversationId);
  return res.insertId;
};

// Recent messages in a conversation (chronological), for memory/context.
const listMessages = async (conversationId, userId, { limit = 50 } = {}) => {
  const [rows] = await db.query(
    `SELECT * FROM chat_messages WHERE conversation_id = ? AND user_id = ?
      ORDER BY created_at ASC, id ASC LIMIT ?`,
    [conversationId, userId, Number(limit)]
  );
  return rows.map(mapMessage);
};

// Verify a conversation belongs to the user (authorization for history reads).
const ownsConversation = async (conversationId, userId) => {
  const [rows] = await db.query(
    'SELECT id FROM chat_conversations WHERE id = ? AND user_id = ? LIMIT 1',
    [conversationId, userId]
  );
  return rows.length > 0;
};

// Count of messages the user has sent — for analytics (chatbot usage).
const countUserMessages = async () => {
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM chat_messages WHERE role = 'user'");
  return n;
};

module.exports = {
  ensureConversation,
  addMessage,
  listMessages,
  ownsConversation,
  countUserMessages,
};
