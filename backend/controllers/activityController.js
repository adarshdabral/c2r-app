const asyncHandler = require('../utils/asyncHandler');
const activityModel = require('../models/activityModel');
const { parsePagination, buildMeta, setPaginationHeaders } = require('../utils/query');

// GET /api/activity?source=&search=&page=&limit=
// A paginated, filterable, searchable timeline of the user's activity.
const timeline = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 20 });
  const source = req.query.source ? String(req.query.source) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const { rows, total } = await activityModel.timeline(req.user.id, { source, search, limit, offset });
  setPaginationHeaders(res, buildMeta(total, page, limit));
  res.json({ activity: rows, sources: activityModel.SOURCES, meta: buildMeta(total, page, limit) });
});

module.exports = { timeline };
