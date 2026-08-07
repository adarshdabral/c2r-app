const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const imgModel = require('../models/requestImageModel');
const pickupModel = require('../models/pickupRequestModel');
const dropoffModel = require('../models/dropOffRequestModel');

const MAX_IMAGES_PER_SIDE = 8;
const MAX_BYTES = 3 * 1024 * 1024; // ~3MB per image (decoded). Clients compress.

const parseType = (t) => (t === 'pickup' || t === 'dropoff' ? t : null);
const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid request id');
  return id;
};

// The request's owner + assigned recycler, normalised across both flows.
async function loadParties(type, id) {
  if (type === 'pickup') {
    const r = await pickupModel.getRawRequest(id);
    return r ? { userId: r.user_id, recyclerId: r.assigned_recycler_id } : null;
  }
  const r = await dropoffModel.getRawRequest(id);
  return r ? { userId: r.user_id, recyclerId: r.recycler_id } : null;
}

// Normalise one incoming image (data URL, or { data, mimeType }, or raw base64).
function normalizeImage(im) {
  let mime = 'image/jpeg';
  let data = typeof im === 'string' ? im : im?.data;
  if (im && typeof im === 'object' && im.mimeType) mime = im.mimeType;
  if (typeof data === 'string' && data.startsWith('data:')) {
    const m = data.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) {
      mime = m[1];
      data = m[2];
    }
  }
  if (!data || typeof data !== 'string') throw ApiError.badRequest('Invalid image data');
  if (!/^image\//.test(mime)) throw ApiError.badRequest('Only image files are allowed');
  if (data.length * 0.75 > MAX_BYTES) {
    throw ApiError.badRequest('Each image must be under 3MB — please compress before uploading');
  }
  return { mimeType: mime, data };
}

// POST /api/images/:type/:id  — body { images: [dataUrl | { data, mimeType }] }.
// Role decides the side: user → "user" set, recycler → "recycler" set.
const upload = asyncHandler(async (req, res) => {
  const type = parseType(req.params.type);
  if (!type) throw ApiError.badRequest('type must be "pickup" or "dropoff"');
  const id = parseId(req.params.id);

  const parties = await loadParties(type, id);
  if (!parties) throw ApiError.notFound('Request not found');

  const { role, id: uid } = req.user;
  let uploadedBy;
  if (role === 'user') {
    if (parties.userId !== uid) throw ApiError.forbidden('This is not your request');
    uploadedBy = 'user';
  } else if (role === 'recycler') {
    if (parties.recyclerId !== uid) throw ApiError.forbidden('You are not assigned to this request');
    uploadedBy = 'recycler';
  } else {
    throw ApiError.forbidden('Only the user or the assigned recycler can upload images');
  }

  const images = Array.isArray(req.body.images) ? req.body.images : [];
  if (images.length === 0) throw ApiError.badRequest('No images provided');

  const existing = await imgModel.countImages(type, id, uploadedBy);
  if (existing + images.length > MAX_IMAGES_PER_SIDE) {
    throw ApiError.badRequest(`You can upload at most ${MAX_IMAGES_PER_SIDE} images`);
  }

  const normalized = images.map(normalizeImage);
  await imgModel.addImages(type, id, uploadedBy, uid, normalized);
  res.status(201).json(await imgModel.getGrouped(type, id));
});

// GET /api/images/:type/:id — both sets. Owner user, assigned recycler, or admin.
const list = asyncHandler(async (req, res) => {
  const type = parseType(req.params.type);
  if (!type) throw ApiError.badRequest('type must be "pickup" or "dropoff"');
  const id = parseId(req.params.id);

  const parties = await loadParties(type, id);
  if (!parties) throw ApiError.notFound('Request not found');

  const { role, id: uid } = req.user;
  const allowed = role === 'admin' || parties.userId === uid || parties.recyclerId === uid;
  if (!allowed) throw ApiError.forbidden('You cannot view these images');

  res.json(await imgModel.getGrouped(type, id));
});

// DELETE /api/images/:type/:id/:imageId — remove one of your own uploads.
const remove = asyncHandler(async (req, res) => {
  const type = parseType(req.params.type);
  if (!type) throw ApiError.badRequest('type must be "pickup" or "dropoff"');
  const id = parseId(req.params.id);
  const imageId = parseId(req.params.imageId);

  const parties = await loadParties(type, id);
  if (!parties) throw ApiError.notFound('Request not found');

  const { role, id: uid } = req.user;
  let side;
  if (role === 'user' && parties.userId === uid) side = 'user';
  else if (role === 'recycler' && parties.recyclerId === uid) side = 'recycler';
  else throw ApiError.forbidden('You can only remove your own images');

  const ok = await imgModel.deleteImage(imageId, type, id, side);
  if (!ok) throw ApiError.notFound('Image not found');
  res.json(await imgModel.getGrouped(type, id));
});

module.exports = { upload, list, remove };
