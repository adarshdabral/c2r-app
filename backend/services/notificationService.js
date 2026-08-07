/**
 * Centralized notification service. Every part of the platform emits through
 * here so delivery is uniform and gated by the `notifications` feature flag.
 *
 * Channels: in-app is delivered now (DB row). Email and push are architected as
 * dispatch extension points — wire real senders in dispatchEmail/dispatchPush
 * without touching call sites. All sends are best-effort and never throw into
 * the caller's request path.
 */
const notificationModel = require('../models/notificationModel');
const { isEnabled } = require('./featureService');
const logger = require('../utils/logger');

// Known categories (for validation + analytics grouping).
const CATEGORIES = ['reward', 'pickup', 'dropoff', 'drive', 'chatbot', 'admin', 'feature', 'system'];

// --- Channel dispatchers (extension points) ---
// eslint-disable-next-line no-unused-vars
async function dispatchEmail(userId, payload) {
  // Email-ready: hook a real transporter here (reuse utils/sendEmail). Intentional
  // no-op today so the architecture is in place without changing send behaviour.
}
// eslint-disable-next-line no-unused-vars
async function dispatchPush(userId, payload) {
  // Push-ready: hook Expo push / FCM here when device tokens are stored.
}

/**
 * Emit a notification to one user. Returns the created id (or null when the
 * feature is off / on failure). `channels` defaults to in-app.
 */
async function notify({ userId, category, type, title, body, data, channels = ['in_app'] }) {
  if (!(await isEnabled('notifications'))) return null;
  if (!userId || !category || !type || !title) return null;
  const id = await notificationModel.create({
    userId,
    category,
    type,
    title,
    body,
    data,
    channel: channels[0] || 'in_app',
  });
  if (channels.includes('email')) dispatchEmail(userId, { title, body, data }).catch(() => {});
  if (channels.includes('push')) dispatchPush(userId, { title, body, data }).catch(() => {});
  return id;
}

/** Fire-and-forget wrapper for the request path. Never throws. */
function notifySafe(payload) {
  return notify(payload).catch((err) => {
    logger.warn('notification emit failed (ignored)', { error: err.message, type: payload && payload.type });
    return null;
  });
}

/** Broadcast one payload to many users (admin). Returns count delivered. */
async function broadcast(userIds, payload) {
  if (!(await isEnabled('notifications'))) return 0;
  return notificationModel.createMany(userIds, payload);
}

module.exports = { notify, notifySafe, broadcast, CATEGORIES };
