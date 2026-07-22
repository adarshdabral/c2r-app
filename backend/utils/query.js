// Shared parsers for list endpoints: pagination, sorting, and search.
// All output is whitelisted/clamped so values are safe to interpolate into SQL
// ORDER BY clauses (column names cannot be parameterized) while LIMIT/OFFSET
// remain bound parameters.

const parsePagination = (query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  let page = Number.parseInt(query.page, 10);
  let limit = Number.parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, offset: (page - 1) * limit };
};

// `allowed` maps an external sort key -> a trusted SQL column expression.
const parseSort = (query = {}, allowed = {}, defaultKey, defaultOrder = 'DESC') => {
  const requestedKey = typeof query.sortBy === 'string' ? query.sortBy : defaultKey;
  const key = Object.prototype.hasOwnProperty.call(allowed, requestedKey) ? requestedKey : defaultKey;

  const requestedOrder = String(query.order ?? query.sortOrder ?? defaultOrder).toUpperCase();
  const order = requestedOrder === 'ASC' ? 'ASC' : 'DESC';

  return { column: allowed[key], order };
};

const parseSearch = (query = {}) => {
  const raw = typeof query.search === 'string' ? query.search.trim() : '';
  return raw.length ? raw : null;
};

// Standard pagination envelope, also surfaced via response headers so existing
// array-returning endpoints stay backward compatible.
const buildMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1
});

const setPaginationHeaders = (res, meta) => {
  res.set({
    'X-Total-Count': String(meta.total),
    'X-Page': String(meta.page),
    'X-Limit': String(meta.limit),
    'X-Total-Pages': String(meta.totalPages)
  });
};

module.exports = { parsePagination, parseSort, parseSearch, buildMeta, setPaginationHeaders };
