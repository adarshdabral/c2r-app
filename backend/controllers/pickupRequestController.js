const {
  createPickupRequest,
  broadcastRequest,
  acceptRequest,
  rejectRequest,
  transitionStatus,
  startVerification,
  armForCollection,
  collect,
  cancelRequest,
  processExpirations,
  getRequestById,
  getRawRequest,
  listForUser,
  listForRecycler,
  PICKUP_STATUSES,
  ACCEPTANCE_TIMEOUT_SECONDS
} = require('../models/pickupRequestModel');
const { verifyOtp, getHistory } = require('../models/otpVerificationModel');
const { awardForCompletion } = require('../services/rewardsService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { sendPickupRequestNotification, sendPickupOTP } = require('../utils/sendEmail');
const { parsePagination, buildMeta, setPaginationHeaders } = require('../utils/query');

const RECYCLER_STATUS_ACTIONS = { EN_ROUTE: 'EN_ROUTE', ARRIVED: 'ARRIVED' };
const expiresInMinutes = Math.max(1, Math.round(ACCEPTANCE_TIMEOUT_SECONDS / 60));

const parseId = (raw, label = 'id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`Valid ${label} is required`);
  }
  return id;
};

// Fire-and-forget broadcast emails. Never await/throw into the request path — a
// mail outage must not stop a pickup from being broadcast (the recycler still
// sees it in their inbox). Failures are logged at warn.
const notifyCandidates = (request, candidates) => {
  for (const c of candidates) {
    if (!c.recyclerEmail) continue;
    sendPickupRequestNotification({
      to: c.recyclerEmail,
      username: c.recyclerName || 'Recycler',
      details: {
        storeName: c.storeName,
        wasteCategory: request.wasteCategory,
        wasteQuantity: request.wasteQuantity,
        pickupAddress: request.pickupAddress,
        distanceKm: c.distanceKm,
        expiresInMinutes
      }
    }).catch((err) => logger.warn('pickup notification failed', { recyclerId: c.recyclerId, error: err.message }));
  }
};

/* ================= CREATE + BROADCAST (user) ================= */
const createHandler = asyncHandler(async (req, res) => {
  const {
    wasteCategory, wasteCategories, wasteQuantity, pickupAddress,
    pickupLatitude, pickupLongitude, preferredTimeSlot
  } = req.body;

  const id = await createPickupRequest({
    userId: req.user.id,
    wasteCategory,
    wasteCategories,
    wasteQuantity,
    pickupAddress,
    pickupLatitude,
    pickupLongitude,
    preferredTimeSlot
  });

  // Round 1 broadcast to the nearest eligible stores.
  const request = await getRequestById(id);
  const result = await broadcastRequest(request);
  if (result.broadcasted > 0) {
    notifyCandidates(request, result.candidates);
  }

  const fresh = await getRequestById(id);
  return res.status(201).json({
    message:
      result.broadcasted > 0
        ? `Pickup request broadcast to ${result.broadcasted} nearby store(s)`
        : 'Pickup request created, but no eligible stores were available yet',
    request: fresh
  });
});

/* ================= MY REQUESTS (user) ================= */
const myRequestsHandler = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 10 });
  let status;
  if (req.query.status) {
    status = String(req.query.status).toUpperCase();
    if (!PICKUP_STATUSES.includes(status)) {
      throw ApiError.badRequest(`status must be one of: ${PICKUP_STATUSES.join(', ')}`);
    }
  }
  const { rows, total } = await listForUser(req.user.id, { status, limit, offset });
  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= RECYCLER INBOX ================= */
const recyclerInboxHandler = asyncHandler(async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'active';
  const rows = await listForRecycler(req.user.id, { scope });
  return res.status(200).json(rows);
});

/* ================= GET ONE (owner / assigned recycler / candidate / admin) ================= */
const getOneHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  const request = await getRequestById(id);
  if (!request) throw ApiError.notFound('Pickup request not found');

  const { id: uid, role } = req.user;
  const isOwner = request.userId === uid;
  const isAssignee = request.assignedRecyclerId === uid;
  const isCandidate =
    role === 'recycler' && (request.candidates || []).some((c) => c.recyclerId === uid);

  if (role !== 'admin' && !isOwner && !isAssignee && !isCandidate) {
    throw ApiError.forbidden('You do not have access to this request');
  }
  return res.status(200).json(request);
});

/* ================= CANCEL (user) ================= */
const cancelHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  await cancelRequest(id, req.user.id);
  return res.status(200).json({ message: 'Pickup request cancelled' });
});

/* ================= ACCEPT (recycler — first wins) ================= */
// On accept, a user OTP is generated immediately and the request moves to
// OTP_PENDING so the code appears on the user's dashboard right away. The
// recycler later enters that OTP + the actual collected quantity to complete.
const acceptHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  await acceptRequest(id, req.user.id);
  await armForCollection(id);
  const request = await getRequestById(id);
  return res.status(200).json({
    message: 'Pickup accepted. Ask the customer for the OTP shown on their dashboard to complete collection.',
    request
  });
});

/* ================= COLLECT (recycler enters OTP + logs actual quantity) ================= */
const collectHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  const { otp, actualQuantityKg } = req.body;
  if (!otp) throw ApiError.badRequest('otp is required');
  if (actualQuantityKg === undefined || actualQuantityKg === null || actualQuantityKg === '') {
    throw ApiError.badRequest('actualQuantityKg is required');
  }
  const request = await collect(id, req.user.id, { otp, actualQuantityKg });
  // Award reward points for the completed recycle — best-effort, fire-and-forget
  // (a no-op when the feature is off / ledger unconfigured; never blocks the
  // response or affects the completion).
  awardForCompletion(request, 'pickup');
  return res.status(200).json({ message: 'Pickup completed', request });
});

/* ================= REJECT (recycler) ================= */
const rejectHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  await rejectRequest(id, req.user.id);
  return res.status(200).json({ message: 'Pickup request declined' });
});

/* ================= STATUS (recycler): EN_ROUTE / ARRIVED ================= */
const statusHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  const toStatus = String(req.body.status || '').toUpperCase();
  if (!RECYCLER_STATUS_ACTIONS[toStatus]) {
    throw ApiError.badRequest('status must be one of: EN_ROUTE, ARRIVED');
  }
  const request = await transitionStatus(id, req.user.id, toStatus);
  return res.status(200).json({ message: `Marked ${toStatus}`, request });
});

/* ================= START OTP VERIFICATION (recycler): ARRIVED -> OTP_PENDING ================= */
const startVerificationHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  const { otpUser, otpRecycler, userName, userEmail } = await startVerification(id, req.user.id);

  // Email the user's OTP to them (best-effort). The recycler-held code is
  // returned so the recycler can display it to the user for mutual verification.
  if (userEmail) {
    const request = await getRequestById(id);
    sendPickupOTP({
      to: userEmail,
      username: userName,
      otp: otpUser,
      context: { storeName: request.storeName, recyclerName: request.recyclerName }
    }).catch((err) => logger.warn('pickup OTP email failed', { requestId: id, error: err.message }));
  }

  return res.status(200).json({
    message: 'OTP sent to the user. Ask them for their code to complete the pickup.',
    otpRecycler
  });
});

/* ================= VERIFY USER OTP (recycler enters the user's code) ================= */
// One side of the mutual handshake. Completes the pickup only once the user has
// also verified the recycler's code (two-sided — prevents one-sided completion).
const verifyUserOtpHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  const { otp } = req.body;
  if (!otp) throw ApiError.badRequest('otp is required');
  const result = await verifyOtp({
    requestType: 'pickup',
    requestId: id,
    actor: 'recycler',
    actorUserId: req.user.id,
    code: otp
  });
  const request = await getRequestById(id);
  return res.status(200).json({
    message: result.completed ? 'Pickup completed' : 'Customer OTP verified. Waiting for the customer to confirm your code.',
    ...result,
    request
  });
});

/* ================= VERIFY RECYCLER OTP (user enters the recycler's code) ================= */
const verifyRecyclerOtpHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  const { otp } = req.body;
  if (!otp) throw ApiError.badRequest('otp is required');
  const result = await verifyOtp({
    requestType: 'pickup',
    requestId: id,
    actor: 'user',
    actorUserId: req.user.id,
    code: otp
  });
  const request = await getRequestById(id);
  return res.status(200).json({
    message: result.completed ? 'Pickup completed' : "Recycler's code verified. Waiting for the recycler to confirm your code.",
    ...result,
    request
  });
});

/* ================= OTP VERIFICATION HISTORY (audit) ================= */
// Visible to the owner, the assigned recycler, or an admin.
const otpHistoryHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'pickup request id');
  const request = await getRawRequest(id);
  if (!request) throw ApiError.notFound('Pickup request not found');
  const { id: uid, role } = req.user;
  if (role !== 'admin' && request.user_id !== uid && request.assigned_recycler_id !== uid) {
    throw ApiError.forbidden('You do not have access to this request');
  }
  const history = await getHistory('pickup', id);
  return res.status(200).json(history);
});

/* ================= EXPIRY/RETRY SWEEP (called by server interval) ================= */
// Exported so server.js can run it on a timer. Each rebroadcast round's new
// candidates are emailed here (the model returns them).
const runPickupSweep = async () => {
  const { expired, rebroadcast } = await processExpirations();
  for (const r of rebroadcast) {
    const request = await getRequestById(r.requestId);
    if (request) notifyCandidates(request, r.candidates);
  }
  if (expired || rebroadcast.length) {
    logger.info('pickup sweep', { expired, rebroadcast: rebroadcast.length });
  }
  return { expired, rebroadcast: rebroadcast.length };
};

module.exports = {
  create: createHandler,
  myRequests: myRequestsHandler,
  recyclerInbox: recyclerInboxHandler,
  getOne: getOneHandler,
  cancel: cancelHandler,
  accept: acceptHandler,
  collect: collectHandler,
  reject: rejectHandler,
  status: statusHandler,
  startVerification: startVerificationHandler,
  verifyUserOtp: verifyUserOtpHandler,
  verifyRecyclerOtp: verifyRecyclerOtpHandler,
  otpHistory: otpHistoryHandler,
  runPickupSweep
};
