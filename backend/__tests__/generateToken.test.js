const jwt = require('jsonwebtoken');
const generateToken = require('../utils/generateToken');
const { generateOTP } = require('../utils/generateToken');

describe('generateToken', () => {
  test('signs a verifiable JWT carrying id and role', () => {
    const token = generateToken(42, 'recycler');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.id).toBe(42);
    expect(decoded.role).toBe('recycler');
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  test('default export and named export are the same function', () => {
    expect(generateToken).toBe(require('../utils/generateToken').generateToken);
  });

  test('token is rejected under a different secret', () => {
    const token = generateToken(1, 'user');
    expect(() => jwt.verify(token, 'a-different-secret')).toThrow();
  });
});

describe('generateOTP', () => {
  test('default length is 6 numeric digits', () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });

  test('respects a custom length and never starts with 0', () => {
    for (let i = 0; i < 200; i++) {
      const otp = generateOTP(4);
      expect(otp).toMatch(/^\d{4}$/);
      expect(otp[0]).not.toBe('0');
    }
  });

  test('stays within the expected numeric range', () => {
    for (let i = 0; i < 200; i++) {
      const n = Number(generateOTP(6));
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });
});
