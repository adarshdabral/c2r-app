const { createDispute, listForRaiser, getDisputeById } = require('../models/disputeModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

const parseId = (raw, label = 'id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest(`Valid ${label} is required`);
  return id;
};

/* ================= RAISE DISPUTE (user or recycler) ================= */
const raiseDispute = asyncHandler(async (req, res) => {
  const { requestType, requestId, reason } = req.body;
  const id = await createDispute({
    requestType,
    requestId: Number(requestId),
    raisedBy: req.user.id,
    raisedByRole: req.user.role === 'recycler' ? 'recycler' : 'user',
    reason
  });
  return res.status(201).json({ id, message: 'Dispute submitted. An admin will review it.' });
});

/* ================= MY DISPUTES ================= */
const myDisputes = asyncHandler(async (req, res) => {
  const rows = await listForRaiser(req.user.id);
  return res.status(200).json(rows);
});

/* ================= GET ONE (raiser or admin) ================= */
const getDispute = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'dispute id');
  const dispute = await getDisputeById(id);
  if (!dispute) throw ApiError.notFound('Dispute not found');
  if (req.user.role !== 'admin' && dispute.raisedBy !== req.user.id) {
    throw ApiError.forbidden('You do not have access to this dispute');
  }
  return res.status(200).json(dispute);
});

module.exports = { raiseDispute, myDisputes, getDispute };
