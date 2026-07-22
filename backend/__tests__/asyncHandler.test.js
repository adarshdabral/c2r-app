const asyncHandler = require('../utils/asyncHandler');

describe('asyncHandler', () => {
  test('invokes the wrapped handler and does not call next on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const next = jest.fn();
    await asyncHandler(fn)({ a: 1 }, { b: 2 }, next);
    expect(fn).toHaveBeenCalledWith({ a: 1 }, { b: 2 }, next);
    expect(next).not.toHaveBeenCalled();
  });

  test('forwards a rejected promise to next()', async () => {
    const error = new Error('async boom');
    const next = jest.fn();
    await asyncHandler(async () => { throw error; })({}, {}, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  test('handles a non-promise return value without calling next', async () => {
    const fn = jest.fn().mockReturnValue('plain value');
    const next = jest.fn();
    await asyncHandler(fn)({}, {}, next);
    expect(next).not.toHaveBeenCalled();
  });
});
