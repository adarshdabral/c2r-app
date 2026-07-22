const ApiError = require('../utils/ApiError');

describe('ApiError', () => {
  test('carries statusCode, message and operational flag', () => {
    const err = new ApiError(418, "I'm a teapot");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("I'm a teapot");
    expect(err.isOperational).toBe(true);
  });

  test.each([
    ['badRequest', 400],
    ['unauthorized', 401],
    ['forbidden', 403],
    ['notFound', 404],
    ['conflict', 409],
  ])('static %s() => %i', (factory, code) => {
    const err = ApiError[factory]('boom');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(code);
    expect(err.message).toBe('boom');
  });

  test('factories provide default messages', () => {
    expect(ApiError.notFound().message).toBe('Not found');
    expect(ApiError.badRequest().message).toBe('Bad request');
  });
});
