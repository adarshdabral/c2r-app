// Integration tests: real Express app + real MySQL via supertest.
// Only the outbound email/SMTP boundary is mocked.
jest.mock('../../utils/sendEmail', () => ({
  sendOTP: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
  sendPickupRequestNotification: jest.fn().mockResolvedValue(undefined),
  sendPickupOTP: jest.fn().mockResolvedValue(undefined),
  sendDropOffRequestNotification: jest.fn().mockResolvedValue(undefined),
  sendDropOffApproved: jest.fn().mockResolvedValue(undefined),
  sendDropOffOTP: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const { app } = require('../../server');
const db = require('../../config/db');

let seq = 0;
const uniqueEmail = () => `itest_${Date.now()}_${seq++}@example.com`;
const PASSWORD = 'secret123';

// Register a user, read its OTP straight from the DB, verify it, and return the
// auth token + email — the reusable "logged-in user" helper.
async function registerAndVerify(overrides = {}) {
  const email = uniqueEmail();
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Itest', email, password: PASSWORD, ...overrides });
  const [[row]] = await db.query('SELECT otp FROM users WHERE email = ?', [email]);
  const res = await request(app).post('/api/auth/verify-otp').send({ email, otp: row.otp });
  return { email, token: res.body.token, verifyRes: res };
}

// Close this runtime's connection pool so Jest exits cleanly.
afterAll(async () => {
  await db.end();
});

describe('infrastructure', () => {
  test('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/running/i);
  });

  test('unknown route returns 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route not found');
  });
});

describe('auth lifecycle (register → verify → login → profile)', () => {
  test('a user can register, verify, log in and read their profile', async () => {
    const email = uniqueEmail();

    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha', email, password: PASSWORD });
    expect(reg.status).toBe(201);

    const [[row]] = await db.query('SELECT otp, is_verified FROM users WHERE email = ?', [email]);
    expect(row.otp).toMatch(/^\d{6}$/);
    expect(Boolean(row.is_verified)).toBe(false);

    const verify = await request(app).post('/api/auth/verify-otp').send({ email, otp: row.otp });
    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();

    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ role: 'user' });

    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.email).toBe(email);
  });

  test('login is blocked until the email is verified (403)', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ name: 'Unv', email, password: PASSWORD });
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  test('wrong OTP is rejected (400)', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ name: 'Otp', email, password: PASSWORD });
    const res = await request(app).post('/api/auth/verify-otp').send({ email, otp: '000000' });
    expect(res.status).toBe(400);
  });
});

describe('auth validation', () => {
  test('missing fields → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@y.com' });
    expect(res.status).toBe(400);
  });

  test('short password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Short', email: uniqueEmail(), password: '123' });
    expect(res.status).toBe(400);
  });

  test('duplicate email → 409', async () => {
    const email = uniqueEmail();
    await request(app).post('/api/auth/register').send({ name: 'Dup', email, password: PASSWORD });
    const dup = await request(app).post('/api/auth/register').send({ name: 'Dup', email, password: PASSWORD });
    expect(dup.status).toBe(409);
  });

  test('wrong password on a verified account → 401', async () => {
    const { email } = await registerAndVerify();
    const res = await request(app).post('/api/auth/login').send({ email, password: 'not-the-password' });
    expect(res.status).toBe(401);
  });
});

describe('authorization on protected routes', () => {
  let token;
  beforeAll(async () => {
    ({ token } = await registerAndVerify());
  });

  test('protected route without a token → 401', async () => {
    const res = await request(app).get('/api/bookings/user');
    expect(res.status).toBe(401);
  });

  test('an invalid token → 401', async () => {
    const res = await request(app).get('/api/bookings/user').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  test('a user can list their own bookings → 200 (array)', async () => {
    const res = await request(app).get('/api/bookings/user').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('requireRole: a user cannot list ALL bookings → 403', async () => {
    const res = await request(app).get('/api/bookings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('createBooking validation flows through HTTP → 400 on empty body', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
