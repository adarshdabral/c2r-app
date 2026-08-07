const asyncHandler = require('../utils/asyncHandler');
const analyticsService = require('../services/analyticsService');

// GET /api/admin/analytics/dashboard — the full analytics bundle.
const dashboard = asyncHandler(async (_req, res) => {
  res.json(await analyticsService.dashboard());
});

// GET /api/admin/analytics/export — headline metrics as CSV.
const exportCsv = asyncHandler(async (_req, res) => {
  const csv = await analyticsService.exportCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="platform-analytics.csv"');
  res.send(csv);
});

module.exports = { dashboard, exportCsv };
