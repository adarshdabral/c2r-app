const asyncHandler = require('../utils/asyncHandler');
const { getFlags } = require('../services/featureService');

/**
 * GET /api/features — the resolved flag map. Public (no auth): the client reads
 * it at boot to hide UI, skip nav entries, and avoid calling disabled APIs.
 */
const getFeatures = asyncHandler(async (_req, res) => {
  res.json({ features: await getFlags() });
});

module.exports = { getFeatures };
