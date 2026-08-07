const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const drives = require('../models/collectionDriveModel');
const driveReportService = require('../services/driveReportService');
const driveReportModel = require('../models/collectionDriveReportModel');
const rewardEngine = require('../services/rewardEngine');
const notificationService = require('../services/notificationService');
const attendance = require('../models/driveAttendanceModel');
const { makeToken, verifyToken } = require('../utils/driveQr');
const QRCode = require('qrcode');

const parseId = (raw, label = 'drive id') => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest(`Valid ${label} is required`);
  return id;
};

// Host = the drive's creator, or any admin.
const assertHost = async (id, user) => {
  const raw = await drives.getRaw(id);
  if (!raw) throw ApiError.notFound('Drive not found');
  if (user.role !== 'admin' && raw.host_id !== user.id) {
    throw ApiError.forbidden('You are not the host of this drive');
  }
  return raw;
};

// POST /api/collection-drives  (recycler | admin)
const create = asyncHandler(async (req, res) => {
  const id = await drives.createDrive(req.user.id, req.user.role, req.body);
  res.status(201).json({ message: 'Drive created', drive: await drives.getById(id, req.user.id) });
});

// GET /api/collection-drives?status=&lat=&lng=  (any authenticated)
const list = asyncHandler(async (req, res) => {
  const { status, lat, lng } = req.query;
  res.json({ drives: await drives.listForUser(req.user.id, { status, lat, lng }) });
});

// GET /api/collection-drives/mine  (user's RSVPs)
const mine = asyncHandler(async (req, res) => {
  res.json({ drives: await drives.myDrives(req.user.id) });
});

// GET /api/collection-drives/hosting  (recycler | admin)
const hosting = asyncHandler(async (req, res) => {
  res.json({ drives: await drives.listForHost(req.user.id) });
});

// GET /api/collection-drives/:id
const getOne = asyncHandler(async (req, res) => {
  const drive = await drives.getById(parseId(req.params.id), req.user.id);
  if (!drive) throw ApiError.notFound('Drive not found');
  res.json(drive);
});

// PATCH /api/collection-drives/:id/status  (host | admin)
const setStatus = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await assertHost(id, req.user);
  const status = String(req.body.status || '').toUpperCase();
  if (!drives.DRIVE_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${drives.DRIVE_STATUSES.join(', ')}`);
  }
  await drives.updateStatus(id, status);
  // On completion, generate the drive report (best-effort — never blocks).
  if (status === 'COMPLETED') driveReportService.generateSafe(id, req.user.id);
  res.json(await drives.getById(id, req.user.id));
});

const reportToApi = (r) =>
  r && {
    id: r.id,
    driveId: r.drive_id,
    reportNo: r.report_no,
    attendeeCount: r.attendee_count,
    generatedAt: r.created_at,
  };

// POST /api/collection-drives/:id/report  (host | admin) — generate/regenerate.
const generateReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await assertHost(id, req.user);
  const report = await driveReportService.generate(id, req.user.id);
  if (!report) throw ApiError.notFound('Drive not found');
  res.status(201).json({ report: reportToApi(report) });
});

// GET /api/collection-drives/:id/report  (host | admin) — metadata (null if none).
const getReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await assertHost(id, req.user);
  res.json({ report: reportToApi(await driveReportModel.getByDrive(id)) });
});

// GET /api/collection-drives/:id/report/download?format=pdf|xls  (host | admin)
const downloadReport = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await assertHost(id, req.user);
  const files = await driveReportModel.getFiles(id);
  if (!files) throw ApiError.notFound('No report has been generated for this drive');
  const format = req.query.format === 'xls' || req.query.format === 'excel' ? 'xls' : 'pdf';
  if (format === 'xls') {
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="${files.report_no}.xls"`);
    return res.send(Buffer.from(files.xls_data, 'base64'));
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${files.report_no}.pdf"`);
  res.send(Buffer.from(files.pdf_data, 'base64'));
});

// POST /api/collection-drives/:id/rsvp  (user)
const rsvp = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await drives.rsvp(id, req.user.id);
  // Reward for joining a drive (idempotent per drive; best-effort).
  rewardEngine.awardSafe(req.user.id, 'drive_joined', { refType: 'drive', refId: id });
  const drive = await drives.getById(id, req.user.id);
  notificationService.notifySafe({
    userId: req.user.id,
    category: 'drive',
    type: 'drive_joined',
    title: `You're going to ${drive.title}`,
    body: drive.scheduledDate ? `On ${String(drive.scheduledDate).slice(0, 10)}${drive.timeWindow ? ` · ${drive.timeWindow}` : ''}` : null,
    data: { href: '/drives', refType: 'drive', refId: id },
  });
  res.status(201).json(drive);
});

// DELETE /api/collection-drives/:id/rsvp  (user)
const cancelRsvp = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await drives.cancelRsvp(id, req.user.id);
  res.json(await drives.getById(id, req.user.id));
});

// GET /api/collection-drives/:id/attendees  (host | admin)
const attendees = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await assertHost(id, req.user);
  res.json({ attendees: await drives.listAttendees(id) });
});

/* ============================ ATTENDANCE / QR ============================ */

// GET /:id/my-qr (user) — the attendee's stateless check-in token + a QR image.
const myQr = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const rsvp = await attendance.getRsvp(id, req.user.id);
  if (!rsvp || rsvp.status !== 'GOING') {
    throw ApiError.badRequest('RSVP to this drive before getting a check-in code');
  }
  const token = makeToken(id, req.user.id);
  const qrDataUrl = await QRCode.toDataURL(token, { margin: 1, width: 240 });
  res.json({ token, qrDataUrl, checkedIn: !!rsvp.checkedInAt });
});

// POST /:id/check-in (host | admin) — body { token } or { userId }. Marks the
// attendee checked-in.
const checkIn = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await assertHost(id, req.user);

  let userId;
  if (req.body.token) {
    const decoded = verifyToken(String(req.body.token));
    if (!decoded || decoded.driveId !== id) throw ApiError.badRequest('Invalid or mismatched check-in code');
    userId = decoded.userId;
  } else if (req.body.userId) {
    userId = Number(req.body.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw ApiError.badRequest('Valid userId is required');
  } else {
    throw ApiError.badRequest('token or userId is required');
  }

  const rsvp = await attendance.getRsvp(id, userId);
  if (!rsvp || rsvp.status !== 'GOING') throw ApiError.badRequest('That user has not RSVP\'d to this drive');

  const newly = await attendance.checkIn(id, userId);
  if (newly) {
    const drive = await drives.getById(id);
    notificationService.notifySafe({
      userId,
      category: 'drive',
      type: 'drive_checked_in',
      title: `Checked in to ${drive.title}`,
      body: 'Enjoy the drive — thanks for recycling!',
      data: { href: '/drives', refType: 'drive', refId: id },
    });
  }
  res.json({ checkedIn: true, alreadyCheckedIn: !newly });
});

// GET /:id/analytics (host | admin) — per-drive attendance analytics.
const driveAnalytics = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await assertHost(id, req.user);
  res.json({ analytics: await attendance.driveAnalytics(id) });
});

// GET /hosting/analytics (recycler | admin) — aggregate across the host's drives.
const hostingAnalytics = asyncHandler(async (req, res) => {
  res.json({ analytics: await attendance.hostingAnalytics(req.user.id) });
});

module.exports = {
  create, list, mine, hosting, getOne, setStatus, rsvp, cancelRsvp, attendees,
  generateReport, getReport, downloadReport,
  myQr, checkIn, driveAnalytics, hostingAnalytics,
};
