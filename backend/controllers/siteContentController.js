const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const model = require('../models/siteContentModel');

// Base64 payload ceiling. Hero video is the outlier, so it gets a larger cap
// than images. Clients compress before upload.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // ~3MB
// Base64 inflates by ~1.33x; the JSON body limit is 25mb, so keep the decoded
// video ceiling at 15MB (~20MB encoded) to stay comfortably under it.
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid id');
  return id;
};

// Accept a data URL, { data, mimeType }, or raw base64 + explicit mimeType.
// Returns { data (base64, no prefix), mimeType } or null when no media supplied.
const normalizeMedia = (raw, { kind = 'image' } = {}) => {
  if (raw === undefined || raw === null || raw === '') return null;
  let mime = null;
  let data = typeof raw === 'string' ? raw : raw?.data;
  if (raw && typeof raw === 'object' && raw.mimeType) mime = raw.mimeType;
  if (typeof data === 'string' && data.startsWith('data:')) {
    const m = data.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) {
      mime = m[1];
      data = m[2];
    }
  }
  if (!data || typeof data !== 'string') throw ApiError.badRequest('Invalid media data');
  if (!mime) throw ApiError.badRequest('mediaType is required for uploads');

  if (kind === 'image' && !/^image\//.test(mime)) {
    throw ApiError.badRequest('Only image files are allowed here');
  }
  if (kind === 'video' && !/^video\//.test(mime)) {
    throw ApiError.badRequest('Only video files are allowed here');
  }
  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (data.length * 0.75 > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    throw ApiError.badRequest(`Media must be under ${mb}MB — please compress before uploading`);
  }
  return { data, mimeType: mime };
};

// Serve base64 media as bytes with the right content type. Shared by the two
// public media routes.
const serveMedia = (res, media, cache = true) => {
  if (!media) throw ApiError.notFound('Media not found');
  res.setHeader('Content-Type', media.mediaType || 'application/octet-stream');
  if (cache) res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(Buffer.from(media.mediaData, 'base64'));
};

/* ============================= PUBLIC READ ============================= */

// GET /api/site-content — the whole published surface in one call: settings
// (keyed) + active carousel + active faq_gallery. Media bytes are referenced by
// URL, never inlined.
const getPublicContent = asyncHandler(async (_req, res) => {
  const [settings, carousel, faqGallery] = await Promise.all([
    model.getAllSettings(),
    model.listItems('carousel', { activeOnly: true }),
    model.listItems('faq_gallery', { activeOnly: true })
  ]);

  const settingsByKey = {};
  for (const s of settings) {
    settingsByKey[s.key] = {
      text: s.text,
      hasMedia: s.hasMedia,
      mediaType: s.mediaType,
      mediaUrl: s.hasMedia ? `/api/site-content/media/${s.key}` : null,
      updatedAt: s.updatedAt
    };
  }
  const withUrls = (items) =>
    items.map((it) => ({
      ...it,
      mediaUrl: it.hasMedia ? `/api/site-content/items/${it.id}/media` : null
    }));

  res.json({
    settings: settingsByKey,
    carousel: withUrls(carousel),
    faqGallery: withUrls(faqGallery)
  });
});

// GET /api/site-content/media/:key — bytes for a singleton (hero video, impact image).
const getSettingMedia = asyncHandler(async (req, res) => {
  const key = String(req.params.key);
  if (!model.isSettingKey(key)) throw ApiError.notFound('Media not found');
  serveMedia(res, await model.getSettingMedia(key));
});

// GET /api/site-content/items/:id/media — bytes for a collection item.
const getItemMedia = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  serveMedia(res, await model.getItemMedia(id));
});

/* ============================= ADMIN: settings ============================= */

// PUT /api/site-content/settings/:key — upsert a singleton. Body: { text?, media? }.
const putSetting = asyncHandler(async (req, res) => {
  const key = String(req.params.key);
  if (!model.isSettingKey(key)) {
    throw ApiError.badRequest(`Unknown setting. Allowed: ${model.SETTING_KEYS.join(', ')}`);
  }
  const kind = key === 'hero_video' ? 'video' : 'image';
  const media = normalizeMedia(req.body.media, { kind });
  const saved = await model.upsertSetting(key, {
    text: req.body.text,
    mediaData: media?.data,
    mediaType: media?.mimeType,
    updatedBy: req.user.id
  });
  res.json({ setting: saved });
});

/* ============================= ADMIN: collections ============================= */

// GET /api/site-content/admin/items/:collection — full list incl. inactive.
const listItemsAdmin = asyncHandler(async (req, res) => {
  const collection = String(req.params.collection);
  if (!model.isCollection(collection)) {
    throw ApiError.badRequest(`Unknown collection. Allowed: ${model.COLLECTIONS.join(', ')}`);
  }
  res.json({ items: await model.listItems(collection) });
});

// POST /api/site-content/admin/items/:collection — create an item.
const createItem = asyncHandler(async (req, res) => {
  const collection = String(req.params.collection);
  if (!model.isCollection(collection)) {
    throw ApiError.badRequest(`Unknown collection. Allowed: ${model.COLLECTIONS.join(', ')}`);
  }
  const media = normalizeMedia(req.body.media, { kind: 'image' });
  const item = await model.createItem({
    collection,
    title: req.body.title,
    body: req.body.body,
    mediaData: media?.data,
    mediaType: media?.mimeType,
    linkUrl: req.body.linkUrl,
    sortOrder: Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0,
    isActive: req.body.isActive === undefined ? true : !!req.body.isActive,
    createdBy: req.user.id
  });
  res.status(201).json({ item });
});

// PATCH /api/site-content/admin/items/:id — partial update.
const updateItem = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const existing = await model.getItem(id);
  if (!existing) throw ApiError.notFound('Item not found');

  const patch = {};
  if (req.body.title !== undefined) patch.title = req.body.title;
  if (req.body.body !== undefined) patch.body = req.body.body;
  if (req.body.linkUrl !== undefined) patch.linkUrl = req.body.linkUrl;
  if (req.body.sortOrder !== undefined) patch.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) patch.isActive = !!req.body.isActive;
  if (req.body.media !== undefined) {
    const media = normalizeMedia(req.body.media, { kind: 'image' });
    if (media) {
      patch.mediaData = media.data;
      patch.mediaType = media.mimeType;
    }
  }
  res.json({ item: await model.updateItem(id, patch) });
});

// DELETE /api/site-content/admin/items/:id
const deleteItem = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const ok = await model.deleteItem(id);
  if (!ok) throw ApiError.notFound('Item not found');
  res.json({ message: 'Item deleted' });
});

module.exports = {
  getPublicContent,
  getSettingMedia,
  getItemMedia,
  putSetting,
  listItemsAdmin,
  createItem,
  updateItem,
  deleteItem
};
