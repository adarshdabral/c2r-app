const jwt = require('jsonwebtoken');
const { protect, requireRole } = require('../middleware/authMiddleware');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET);

describe('protect', () => {
  test('401 when no token present', async () => {
    const res = mockRes();
    const next = jest.fn();
    await protect({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a Bearer token and sets req.user', async () => {
    const token = sign({ id: 7, role: 'admin' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 7, role: 'admin' });
    expect(res.status).not.toHaveBeenCalled();
  });

  test('accepts a token from the cookie header', async () => {
    const token = sign({ id: 9, role: 'user' });
    const req = { headers: { cookie: `foo=bar; token=${token}; baz=qux` } };
    const res = mockRes();
    const next = jest.fn();
    await protect(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 9, role: 'user' });
  });

  test('prefers the Authorization header over the cookie', async () => {
    const req = {
      headers: {
        authorization: `Bearer ${sign({ id: 1, role: 'admin' })}`,
        cookie: `token=${sign({ id: 2, role: 'user' })}`,
      },
    };
    const next = jest.fn();
    await protect(req, mockRes(), next);
    expect(req.user).toEqual({ id: 1, role: 'admin' });
  });

  test('401 on an invalid / tampered token', async () => {
    const res = mockRes();
    const next = jest.fn();
    await protect({ headers: { authorization: 'Bearer not.a.jwt' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  test('calls next when the user role is allowed', () => {
    const next = jest.fn();
    requireRole('admin', 'recycler')({ user: { role: 'recycler' } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('403 when the role is not allowed', () => {
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'user' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when there is no authenticated user', () => {
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')({}, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
