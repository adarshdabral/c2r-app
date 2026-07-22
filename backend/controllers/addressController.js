const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  listAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress
} = require('../models/addressModel');

const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid address id');
  return id;
};

// Validates + normalises an address payload. `lat`/`lng` must be real coords so
// the saved address can seed a pickup request without re-geocoding.
const parseBody = (body = {}) => {
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (!label) throw ApiError.badRequest('A label (e.g. Home, Work) is required');
  if (label.length > 60) throw ApiError.badRequest('Label is too long');
  if (!address) throw ApiError.badRequest('Address is required');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw ApiError.badRequest('A valid map location (latitude/longitude) is required');
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw ApiError.badRequest('Coordinates are out of range');
  }
  return { label, address, latitude, longitude, isDefault: !!body.isDefault };
};

const list = asyncHandler(async (req, res) => {
  res.json(await listAddresses(req.user.id));
});

const create = asyncHandler(async (req, res) => {
  const address = await createAddress(req.user.id, parseBody(req.body));
  res.status(201).json(address);
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const updated = await updateAddress(id, req.user.id, parseBody(req.body));
  if (!updated) throw ApiError.notFound('Address not found');
  res.json(updated);
});

const makeDefault = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const updated = await setDefaultAddress(id, req.user.id);
  if (!updated) throw ApiError.notFound('Address not found');
  res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const ok = await deleteAddress(id, req.user.id);
  if (!ok) throw ApiError.notFound('Address not found');
  res.status(204).end();
});

module.exports = { list, create, update, makeDefault, remove };
