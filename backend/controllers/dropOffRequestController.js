const {
  createDropOffRequest,
  approveDropOff,
  rejectDropOff,
  checkIn,
  startVerification,
  armForCollection,
  collect,
  cancelDropOff,
  getRequestById,
  getRawRequest,
  listForUser,
  listForRecycler,
  DROPOFF_STATUSES
} = require('../models/dropOffRequestModel');
const { verifyOtp, getHistory } = require('../models/otpVerificationModel');
const { awardForCompletion } = require('../services/rewardsService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const {
  sendDropOffRequestNotification,
  sendDropOffApproved,
  sendDropOffOTP
} = require('../utils/sendEmail');
const { parsePagination, buildMeta, setPaginationHeaders } = require('../utils/query');

const parseId = (raw, label = 'id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.badRequest(`Valid ${label} is required`);
  }
  return id;
};

const parseStatusFilter = (value) => {
  if (!value) return undefined;
  const status = String(value).toUpperCase();
  if (!DROPOFF_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${DROPOFF_STATUSES.join(', ')}`);
  }
  return status;
};

// Best-effort email — never await into the request path / never throw.
const fireEmail = (promise, ctx) =>
  promise.catch((err) => logger.warn('drop-off email failed', { ...ctx, error: err.message }));

/* ================= CREATE (user) ================= */
const createHandler = asyncHandler(async (req, res) => {
  const { storeId, wasteCategory, wasteCategories, wasteQuantity, scheduledDate, timeSlot } = req.body;

  const id = await createDropOffRequest({
    userId: req.user.id,
    storeId,
    wasteCategory,
    wasteCategories,
    wasteQuantity,
    scheduledDate,
    timeSlot
  });

  const request = await getRequestById(id);

  // Notify the store's recycler that a drop-off was requested.
  if (request.recyclerEmail) {
    fireEmail(
      sendDropOffRequestNotification({
        to: request.recyclerEmail,
        username: request.recyclerName,
        details: {
          userName: request.userName,
          wasteCategory: request.wasteCategory,
          wasteQuantity: request.wasteQuantity,
          scheduledDate: request.scheduledDate,
          timeSlot: request.timeSlot,
          storeName: request.storeName
        }
      }),
      { dropOffId: id }
    );
  }

  return res.status(201).json({ message: 'Drop-off requested. Awaiting store approval.', request });
});

/* ================= MY REQUESTS (user) ================= */
const myRequestsHandler = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 10 });
  const status = parseStatusFilter(req.query.status);
  const { rows, total } = await listForUser(req.user.id, { status, limit, offset });
  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= STORE INCOMING (recycler) ================= */
const incomingHandler = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 50 });
  const status = parseStatusFilter(req.query.status);
  const { rows, total } = await listForRecycler(req.user.id, { status, limit, offset });
  setPaginationHeaders(res, buildMeta(total, page, limit));
  return res.status(200).json(rows);
});

/* ================= GET ONE (owner / recycler / admin) ================= */
const getOneHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const request = await getRequestById(id);
  if (!request) throw ApiError.notFound('Drop-off request not found');

  const { id: uid, role } = req.user;
  if (role !== 'admin' && request.userId !== uid && request.recyclerId !== uid) {
    throw ApiError.forbidden('You do not have access to this request');
  }
  return res.status(200).json(request);
});

/* ================= CANCEL (user) ================= */
const cancelHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  await cancelDropOff(id, req.user.id);
  return res.status(200).json({ message: 'Drop-off cancelled' });
});

/* ================= APPROVE (recycler) ================= */
const approveHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const request = await approveDropOff(id, req.user.id);

  // Booking confirmation to the user.
  if (request.userEmail) {
    fireEmail(
      sendDropOffApproved({
        to: request.userEmail,
        username: request.userName,
        details: {
          storeName: request.storeName,
          wasteCategory: request.wasteCategory,
          wasteQuantity: request.wasteQuantity,
          scheduledDate: request.scheduledDate,
          timeSlot: request.timeSlot
        }
      }),
      { dropOffId: id }
    );
  }

  // Arm the user OTP immediately on approval so it shows on the user's dashboard;
  // the recycler later enters it + the actual collected quantity to complete.
  await armForCollection(id);
  const armed = await getRequestById(id);
  return res.status(200).json({
    message: 'Drop-off approved. Ask the customer for the OTP shown on their dashboard to complete collection.',
    request: armed
  });
});

/* ================= COLLECT (recycler enters OTP + logs actual quantity) ================= */
const collectHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const { otp, actualQuantityKg } = req.body;
  if (!otp) throw ApiError.badRequest('otp is required');
  if (actualQuantityKg === undefined || actualQuantityKg === null || actualQuantityKg === '') {
    throw ApiError.badRequest('actualQuantityKg is required');
  }
  const request = await collect(id, req.user.id, { otp, actualQuantityKg });
  // Award reward points for the completed recycle — best-effort, fire-and-forget
  // (a no-op when the feature is off / ledger unconfigured; never blocks the
  // response or affects the completion).
  awardForCompletion(request, 'dropoff');
  return res.status(200).json({ message: 'Drop-off completed', request });
});

/* ================= REJECT (recycler) ================= */
const rejectHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const request = await rejectDropOff(id, req.user.id);
  return res.status(200).json({ message: 'Drop-off rejected', request });
});

/* ================= CHECK-IN (recycler) ================= */
const checkInHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const request = await checkIn(id, req.user.id);
  return res.status(200).json({ message: 'Customer checked in', request });
});

/* ================= START OTP VERIFICATION (recycler) ================= */
const startVerificationHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const { otpUser, otpRecycler, userName, userEmail } = await startVerification(id, req.user.id);

  if (userEmail) {
    const request = await getRequestById(id);
    fireEmail(
      sendDropOffOTP({
        to: userEmail,
        username: userName,
        otp: otpUser,
        context: { storeName: request.storeName }
      }),
      { dropOffId: id }
    );
  }

  return res.status(200).json({
    message: 'OTP sent to the customer. Ask them for their code to complete the drop-off.',
    otpRecycler
  });
});

/* ================= VERIFY USER OTP (recycler enters the user's code) ================= */
// Mutual handshake — completes only once the user has also verified the
// recycler's code (prevents one-sided completion).
const verifyUserOtpHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const { otp } = req.body;
  if (!otp) throw ApiError.badRequest('otp is required');
  const result = await verifyOtp({
    requestType: 'dropoff',
    requestId: id,
    actor: 'recycler',
    actorUserId: req.user.id,
    code: otp
  });
  const request = await getRequestById(id);
  return res.status(200).json({
    message: result.completed ? 'Drop-off completed' : 'Customer OTP verified. Waiting for the customer to confirm your code.',
    ...result,
    request
  });
});

/* ================= VERIFY RECYCLER OTP (user enters the recycler's code) ================= */
const verifyRecyclerOtpHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const { otp } = req.body;
  if (!otp) throw ApiError.badRequest('otp is required');
  const result = await verifyOtp({
    requestType: 'dropoff',
    requestId: id,
    actor: 'user',
    actorUserId: req.user.id,
    code: otp
  });
  const request = await getRequestById(id);
  return res.status(200).json({
    message: result.completed ? 'Drop-off completed' : "Recycler's code verified. Waiting for the recycler to confirm your code.",
    ...result,
    request
  });
});

/* ================= OTP VERIFICATION HISTORY (audit) ================= */
const otpHistoryHandler = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'drop-off request id');
  const request = await getRawRequest(id);
  if (!request) throw ApiError.notFound('Drop-off request not found');
  const { id: uid, role } = req.user;
  if (role !== 'admin' && request.user_id !== uid && request.recycler_id !== uid) {
    throw ApiError.forbidden('You do not have access to this request');
  }
  const history = await getHistory('dropoff', id);
  return res.status(200).json(history);
});

module.exports = {
  create: createHandler,
  myRequests: myRequestsHandler,
  incoming: incomingHandler,
  getOne: getOneHandler,
  cancel: cancelHandler,
  approve: approveHandler,
  reject: rejectHandler,
  checkIn: checkInHandler,
  collect: collectHandler,
  startVerification: startVerificationHandler,
  verifyUserOtp: verifyUserOtpHandler,
  verifyRecyclerOtp: verifyRecyclerOtpHandler,
  otpHistory: otpHistoryHandler
};
