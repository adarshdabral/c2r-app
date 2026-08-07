const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isEnabled } = require('../services/featureService');

/**
 * Route/router guard: block access when a feature is disabled. Composes ahead of
 * a router:  app.use('/api/rewards', requireFeature('rewards'), rewardRoutes)
 *
 * A disabled feature returns a meaningful 403 with a machine-readable code so
 * clients can show a "Feature unavailable" state (rather than a bare 404).
 */
const requireFeature = (key) =>
  asyncHandler(async (req, res, next) => {
    if (!(await isEnabled(key))) {
      const err = ApiError.forbidden(`The "${key}" feature is currently disabled`);
      err.code = 'FEATURE_DISABLED';
      err.feature = key;
      throw err;
    }
    next();
  });

module.exports = { requireFeature };
