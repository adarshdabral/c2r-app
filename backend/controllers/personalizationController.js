const asyncHandler = require('../utils/asyncHandler');
const personalizationService = require('../services/personalizationService');

/**
 * GET /api/personalization/home — the role-aware personalized bundle for the
 * authenticated user (dashboard recommendations, suggested actions, drive
 * reminders, history-derived insights). Router is gated by
 * requireFeature('personalization'), so a disabled feature returns 403.
 */
const getHome = asyncHandler(async (req, res) => {
  res.json(await personalizationService.getHome(req.user));
});

module.exports = { getHome };
