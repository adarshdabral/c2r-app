const {
  parsePagination,
  parseSort,
  parseSearch,
  buildMeta,
  setPaginationHeaders,
} = require('../utils/query');

describe('parsePagination', () => {
  test('defaults when no query', () => {
    expect(parsePagination()).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  test('honours custom defaultLimit', () => {
    expect(parsePagination({}, { defaultLimit: 10 })).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  test('computes offset from page and limit', () => {
    expect(parsePagination({ page: '3', limit: '15' })).toEqual({ page: 3, limit: 15, offset: 30 });
  });

  test('clamps limit to maxLimit', () => {
    expect(parsePagination({ limit: '5000' }, { maxLimit: 100 }).limit).toBe(100);
  });

  test('falls back to defaults for invalid / negative input', () => {
    expect(parsePagination({ page: '-2', limit: 'abc' })).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(parsePagination({ page: '0', limit: '0' }).page).toBe(1);
  });
});

describe('parseSort', () => {
  const allowed = { created_at: 'created_at', name: 'store_name' };

  test('maps an allowed key to its trusted column', () => {
    expect(parseSort({ sortBy: 'name' }, allowed, 'created_at')).toEqual({
      column: 'store_name',
      order: 'DESC',
    });
  });

  test('rejects unknown / injection keys and uses the default', () => {
    const out = parseSort({ sortBy: 'id; DROP TABLE users' }, allowed, 'created_at');
    expect(out.column).toBe('created_at');
  });

  test('accepts ASC, defaults everything else to DESC', () => {
    expect(parseSort({ order: 'asc' }, allowed, 'created_at').order).toBe('ASC');
    expect(parseSort({ order: 'sideways' }, allowed, 'created_at').order).toBe('DESC');
    expect(parseSort({ sortOrder: 'ASC' }, allowed, 'created_at').order).toBe('ASC');
  });
});

describe('parseSearch', () => {
  test('trims and returns the term', () => {
    expect(parseSearch({ search: '  hello  ' })).toBe('hello');
  });
  test('returns null for empty / missing / non-string', () => {
    expect(parseSearch({ search: '   ' })).toBeNull();
    expect(parseSearch({})).toBeNull();
    expect(parseSearch({ search: 123 })).toBeNull();
  });
});

describe('buildMeta', () => {
  test('computes pagination envelope', () => {
    expect(buildMeta(45, 2, 20)).toEqual({
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  test('edge: first/last page flags and minimum one page', () => {
    expect(buildMeta(0, 1, 20)).toMatchObject({ totalPages: 1, hasNext: false, hasPrev: false });
    expect(buildMeta(20, 1, 20)).toMatchObject({ hasNext: false });
  });
});

describe('setPaginationHeaders', () => {
  test('writes the X-* headers', () => {
    const res = { set: jest.fn() };
    setPaginationHeaders(res, buildMeta(45, 2, 20));
    expect(res.set).toHaveBeenCalledWith({
      'X-Total-Count': '45',
      'X-Page': '2',
      'X-Limit': '20',
      'X-Total-Pages': '3',
    });
  });
});
