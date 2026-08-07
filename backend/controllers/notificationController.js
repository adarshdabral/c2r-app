const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const notificationModel = require('../models/notificationModel');
const notificationService = require('../services/notificationService');
const { parsePagination, buildMeta, setPaginationHeaders } = require('../utils/query');

// GET /api/notifications — the caller's notifications (paginated) + unread count.
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20 });
  const category = req.query.category ? String(req.query.category) : undefined;
  const unreadOnly = req.query.unread === 'true';
  const { rows, total } = await notificationModel.listForUser(req.user.id, {
    limit,
    offset,
    category,
    unreadOnly,
  });
  const unread = await notificationModel.unreadCount(req.user.id);
  setPaginationHeaders(res, buildMeta(total, page, limit));
  res.json({ notifications: rows, unread, meta: buildMeta(total, page, limit) });
});

// GET /api/notifications/unread-count
const unreadCount = asyncHandler(async (req, res) => {
  res.json({ unread: await notificationModel.unreadCount(req.user.id) });
});

// PATCH /api/notifications/:id/read
const markRead = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Valid id is required');
  await notificationModel.markRead(id, req.user.id);
  res.json({ unread: await notificationModel.unreadCount(req.user.id) });
});

// POST /api/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
  const updated = await notificationModel.markAllRead(req.user.id);
  res.json({ updated, unread: 0 });
});

// POST /api/notifications/admin/broadcast — admin sends to all (or one role).
const broadcast = asyncHandler(async (req, res) => {
  const { title, body, role, data } = req.body;
  if (!title || !String(title).trim()) throw ApiError.badRequest('title is required');
  if (role && !['user', 'recycler', 'admin'].includes(role)) {
    throw ApiError.badRequest('role must be user, recycler, or admin');
  }
  const ids = await notificationModel.recipientIds(role);
  const delivered = await notificationService.broadcast(ids, {
    category: 'admin',
    type: 'broadcast',
    title: String(title).trim(),
    body: body ? String(body).trim() : null,
    data: data || null,
  });
  res.status(201).json({ delivered });
});

module.exports = { list, unreadCount, markRead, markAllRead, broadcast };
