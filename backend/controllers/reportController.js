const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const reportModel = require('../models/reportModel');
const reportService = require('../services/reportService');
const { findUserById } = require('../models/userModel');

const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid report id');
  return id;
};

async function assertBulkOrAdmin(user) {
  if (user.role === 'admin') return;
  const u = await findUserById(user.id);
  if (u?.user_type !== 'bulk_producer') {
    throw ApiError.forbidden('Reports are available to bulk-producer accounts');
  }
}

// GET /api/reports — own reports (bulk producer) or all (admin).
const list = asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json({ reports: await reportModel.listAll({}) });
  }
  await assertBulkOrAdmin(req.user);
  res.json({ reports: await reportModel.listForUser(req.user.id) });
});

// POST /api/reports/summary  { type: monthly|quarterly|annual }
const generateSummary = asyncHandler(async (req, res) => {
  await assertBulkOrAdmin(req.user);
  const report = await reportService.generateSummary(req.user.id, String(req.body.type || ''));
  res.status(201).json({ report });
});

const authorizeView = async (report, user) => {
  if (!report) throw ApiError.notFound('Report not found');
  if (user.role !== 'admin' && report.userId !== user.id) {
    throw ApiError.forbidden('You cannot access this report');
  }
};

// GET /api/reports/:id
const getOne = asyncHandler(async (req, res) => {
  const report = await reportModel.getById(parseId(req.params.id));
  await authorizeView(report, req.user);
  res.json({ report });
});

// GET /api/reports/:id/download — the PDF.
const download = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const row = await reportModel.getPdf(id);
  if (!row) throw ApiError.notFound('Report not found');
  if (req.user.role !== 'admin' && row.user_id !== req.user.id) {
    throw ApiError.forbidden('You cannot access this report');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${row.report_no}.pdf"`);
  res.send(Buffer.from(row.pdf_data, 'base64'));
});

module.exports = { list, generateSummary, getOne, download };
