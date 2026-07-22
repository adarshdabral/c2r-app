// Minimal dependency-free structured logger.
// Levels are gated by LOG_LEVEL (default 'info'); output is single-line JSON-ish
// so it stays greppable in production log aggregators.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const activeLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const emit = (level, message, meta) => {
  if (LEVELS[level] > activeLevel) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    message
  };
  if (meta !== undefined) entry.meta = meta instanceof Error
    ? { name: meta.name, message: meta.message, stack: meta.stack }
    : meta;

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(JSON.stringify(entry));
};

module.exports = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta)
};
