const logger = require('../utils/logger');

// Logs one structured line per completed request with method, path, status,
// duration, and the authenticated user id when present.
const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id ?? null
    });
  });

  next();
};

module.exports = requestLogger;
