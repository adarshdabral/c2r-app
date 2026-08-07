const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isEnabled } = require('../services/featureService');

/**
 * Route/router guard: block access when a feature is disabled. Returns 404 (not
 * 403) so a disabled feature's endpoints look absent rather than forbidden —
 * clients can't probe for gated functionality. Compose ahead of a router:
 *
 *   app.use('/api/rewards', requireFeature('rewards'), rewardRoutes);
 */
const requireFeature = (key) =>
  asyncHandler(async (req, res, next) => {
    if (!(await isEnabled(key))) {
      throw ApiError.notFound('This feature is not available');
    }
    next();
  });

module.exports = { requireFeature };
