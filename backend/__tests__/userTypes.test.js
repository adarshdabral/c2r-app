const { USER_TYPES, DEFAULT_USER_TYPE, isValidUserType } = require('../config/userTypes');

describe('userTypes config', () => {
  test('default type is part of the allowed set', () => {
    expect(USER_TYPES).toContain(DEFAULT_USER_TYPE);
  });

  test('isValidUserType accepts known types', () => {
    for (const t of USER_TYPES) expect(isValidUserType(t)).toBe(true);
  });

  test('isValidUserType rejects unknown / malformed values', () => {
    expect(isValidUserType('enterprise')).toBe(false);
    expect(isValidUserType('')).toBe(false);
    expect(isValidUserType(undefined)).toBe(false);
    expect(isValidUserType(null)).toBe(false);
  });
});
