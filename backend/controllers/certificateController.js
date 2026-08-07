const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const certModel = require('../models/certificateModel');
const pickupModel = require('../models/pickupRequestModel');
const dropoffModel = require('../models/dropOffRequestModel');
const { getRequestItems } = require('../models/ewasteModel');
const { buildCertificatePdf } = require('../services/certificateService');

const parseType = (t) => (t === 'pickup' || t === 'dropoff' ? t : null);
const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid request id');
  return id;
};

const toApi = (c) =>
  c && {
    id: c.id,
    requestType: c.request_type,
    requestId: c.request_id,
    certificateNo: c.certificate_no,
    verificationId: c.verification_id,
    sanitizationMethod: c.sanitization_method,
    sanitizedOn: c.sanitized_on,
    authorisedPerson: c.authorised_person,
    designation: c.designation,
    issuedAt: c.created_at,
  };

const loadDetail = (type, id) =>
  type === 'pickup' ? pickupModel.getRequestById(id) : dropoffModel.getRequestById(id);

const recyclerOf = (type, request) =>
  type === 'pickup' ? request.assignedRecyclerId : request.recyclerId;

// POST /api/certificates/:type/:id — recycler generates the certificate.
const generate = asyncHandler(async (req, res) => {
  const type = parseType(req.params.type);
  if (!type) throw ApiError.badRequest('type must be "pickup" or "dropoff"');
  const id = parseId(req.params.id);

  const request = await loadDetail(type, id);
  if (!request) throw ApiError.notFound('Request not found');

  if (req.user.role !== 'recycler' || recyclerOf(type, request) !== req.user.id) {
    throw ApiError.forbidden('Only the assigned recycler can issue this certificate');
  }
  if (!request.sanitizationRequested) {
    throw ApiError.badRequest('This booking did not request a data sanitization certificate');
  }
  if (await certModel.getByRequest(type, id)) {
    throw ApiError.conflict('A certificate has already been issued for this booking');
  }

  const sanitizationMethod = String(req.body.sanitizationMethod || '').trim();
  const authorisedPerson = String(req.body.authorisedPerson || '').trim();
  const designation = req.body.designation ? String(req.body.designation).trim() : null;
  const sanitizedOn = String(req.body.sanitizedOn || '').trim();
  if (!sanitizationMethod || !authorisedPerson) {
    throw ApiError.badRequest('sanitizationMethod and authorisedPerson are required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sanitizedOn)) {
    throw ApiError.badRequest('sanitizedOn is required and must be YYYY-MM-DD');
  }

  const items =
    Array.isArray(request.items) && request.items.length
      ? request.items
      : await getRequestItems(type, id);

  const certificateNo = `CTR-DSC-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
  const verificationId = crypto.randomBytes(9).toString('hex').toUpperCase();
  const recyclerName = request.recyclerName || 'Recycler';
  const recyclerAddress = type === 'pickup' ? request.storeAddress : request.storeName;
  const verifyUrl = `${process.env.CLIENT_URL || 'https://connect2recycle.app'}/verify/${verificationId}`;

  const pdfData = await buildCertificatePdf({
    certificateNo,
    verificationId,
    bookingRef: `${type.toUpperCase()}-${id}`,
    userName: request.userName,
    recyclerName,
    recyclerAddress,
    deviceDetails: items,
    fallbackCategories: request.wasteCategories,
    quantity: request.wasteQuantity,
    sanitizedOn,
    method: sanitizationMethod,
    authorisedPerson,
    designation,
    verifyUrl,
  });

  await certModel.create({
    requestType: type,
    requestId: id,
    certificateNo,
    verificationId,
    recyclerId: req.user.id,
    sanitizationMethod,
    sanitizedOn,
    authorisedPerson,
    designation,
    pdfData,
  });

  res.status(201).json(toApi(await certModel.getByRequest(type, id)));
});

// Owner user, assigned recycler, or admin may view/download.
async function authorizeView(type, id, user) {
  const raw =
    type === 'pickup' ? await pickupModel.getRawRequest(id) : await dropoffModel.getRawRequest(id);
  if (!raw) throw ApiError.notFound('Request not found');
  const recyclerId = type === 'pickup' ? raw.assigned_recycler_id : raw.recycler_id;
  const allowed = user.role === 'admin' || raw.user_id === user.id || recyclerId === user.id;
  if (!allowed) throw ApiError.forbidden('You cannot access this certificate');
}

// GET /api/certificates/:type/:id — metadata (null if not issued yet).
const get = asyncHandler(async (req, res) => {
  const type = parseType(req.params.type);
  if (!type) throw ApiError.badRequest('type must be "pickup" or "dropoff"');
  const id = parseId(req.params.id);
  await authorizeView(type, id, req.user);
  res.json({ certificate: toApi(await certModel.getByRequest(type, id)) });
});

// GET /api/certificates/:type/:id/download — the PDF (application/pdf).
const download = asyncHandler(async (req, res) => {
  const type = parseType(req.params.type);
  if (!type) throw ApiError.badRequest('type must be "pickup" or "dropoff"');
  const id = parseId(req.params.id);
  await authorizeView(type, id, req.user);

  const row = await certModel.getPdf(type, id);
  if (!row) throw ApiError.notFound('No certificate has been issued for this booking');
  const buf = Buffer.from(row.pdf_data, 'base64');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${row.certificate_no}.pdf"`);
  res.send(buf);
});

// GET /api/certificates/verify/:verificationId — public verification lookup.
const verify = asyncHandler(async (req, res) => {
  const cert = await certModel.getByVerificationId(String(req.params.verificationId || ''));
  if (!cert) {
    return res.status(404).json({ valid: false, message: 'No certificate matches this verification ID' });
  }
  res.json({
    valid: true,
    certificateNo: cert.certificate_no,
    sanitizedOn: cert.sanitized_on,
    sanitizationMethod: cert.sanitization_method,
    authorisedPerson: cert.authorised_person,
    issuedAt: cert.created_at,
  });
});

module.exports = { generate, get, download, verify };
