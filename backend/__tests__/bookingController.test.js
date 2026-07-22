// Unit tests for the booking controller's branching logic. The data layer is
// fully mocked, so these exercise validation + the status state machine without
// any database.

jest.mock('../models/bookingModel', () => ({
  createBooking: jest.fn(),
  createStoreBooking: jest.fn(),
  getBookingById: jest.fn(),
  getBookingsByUser: jest.fn(),
  getAllBookings: jest.fn(),
  getBookingsForRecycler: jest.fn(),
  updateBookingStatus: jest.fn(),
  assignRecycler: jest.fn(),
  deleteBookingById: jest.fn(),
}));
jest.mock('../models/storeModel', () => ({ releaseCapacity: jest.fn() }));

const bookingModel = require('../models/bookingModel');
const storeModel = require('../models/storeModel');
const {
  createBooking,
  updateBookingStatus,
  deleteBooking,
  getUserBookings,
} = require('../controllers/bookingController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
};
const lastError = (next) => next.mock.calls[0][0];

beforeEach(() => jest.resetAllMocks());

describe('createBooking', () => {
  const validBody = {
    store_id: 3,
    latitude: 12.9,
    longitude: 77.6,
    address: '123 Main Street',
    estimated_weight_kg: 5,
    waste_type: 'Laptop Scrap',
  };

  test('creates a booking and returns 201 with the new id', async () => {
    bookingModel.createStoreBooking.mockResolvedValue(99);
    const res = mockRes();
    const next = jest.fn();
    await createBooking({ body: validBody, user: { id: 10 } }, res, next);

    expect(bookingModel.createStoreBooking).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, storeId: 3, estimatedWeightKg: 5, address: '123 Main Street' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }));
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    ['missing required fields', {}],
    ['non-numeric coordinates', { ...validBody, latitude: 'north' }],
    ['too-short address', { ...validBody, address: 'ab' }],
    ['non-positive weight', { ...validBody, estimated_weight_kg: 0 }],
  ])('400 on %s', async (_label, body) => {
    const next = jest.fn();
    await createBooking({ body, user: { id: 10 } }, mockRes(), next);
    expect(lastError(next).statusCode).toBe(400);
    expect(bookingModel.createStoreBooking).not.toHaveBeenCalled();
  });
});

describe('updateBookingStatus (state machine)', () => {
  const baseReq = (over = {}) => ({
    params: { id: '5' },
    body: { status: 'accepted' },
    user: { id: 1, role: 'admin' },
    ...over,
  });

  test('admin advances pending -> accepted', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'pending', user_id: 1 });
    bookingModel.updateBookingStatus.mockResolvedValue();
    const res = mockRes();
    const next = jest.fn();
    await updateBookingStatus(baseReq(), res, next);

    expect(bookingModel.updateBookingStatus).toHaveBeenCalledWith(5, 'accepted');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an illegal transition (pending -> completed)', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'pending' });
    const next = jest.fn();
    await updateBookingStatus(baseReq({ body: { status: 'completed' } }), mockRes(), next);
    expect(lastError(next).statusCode).toBe(400);
    expect(bookingModel.updateBookingStatus).not.toHaveBeenCalled();
  });

  test('404 when the booking does not exist', async () => {
    bookingModel.getBookingById.mockResolvedValue(null);
    const next = jest.fn();
    await updateBookingStatus(baseReq(), mockRes(), next);
    expect(lastError(next).statusCode).toBe(404);
  });

  test('400 when status is missing', async () => {
    const next = jest.fn();
    await updateBookingStatus(baseReq({ body: {} }), mockRes(), next);
    expect(lastError(next).statusCode).toBe(400);
  });

  test('recycler may claim and advance an unassigned booking', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'pending' });
    bookingModel.assignRecycler.mockResolvedValue(true);
    bookingModel.updateBookingStatus.mockResolvedValue();
    const res = mockRes();
    const next = jest.fn();
    await updateBookingStatus(baseReq({ user: { id: 7, role: 'recycler' } }), res, next);

    expect(bookingModel.assignRecycler).toHaveBeenCalledWith(5, 7);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('403 when the booking is already claimed by another recycler', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'pending' });
    bookingModel.assignRecycler.mockResolvedValue(false);
    const next = jest.fn();
    await updateBookingStatus(baseReq({ user: { id: 7, role: 'recycler' } }), mockRes(), next);
    expect(lastError(next).statusCode).toBe(403);
    expect(bookingModel.updateBookingStatus).not.toHaveBeenCalled();
  });

  test('403 when a plain user tries to transition a booking', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'pending' });
    const next = jest.fn();
    await updateBookingStatus(baseReq({ user: { id: 3, role: 'user' } }), mockRes(), next);
    expect(lastError(next).statusCode).toBe(403);
  });
});

describe('deleteBooking', () => {
  test('owner cancels a pending booking and frees store capacity', async () => {
    bookingModel.getBookingById.mockResolvedValue({
      id: 5, status: 'pending', user_id: 10, store_id: 2, estimated_weight_kg: 8,
    });
    bookingModel.deleteBookingById.mockResolvedValue();
    storeModel.releaseCapacity.mockResolvedValue();
    const res = mockRes();
    const next = jest.fn();
    await deleteBooking({ params: { id: '5' }, user: { id: 10, role: 'user' } }, res, next);

    expect(bookingModel.deleteBookingById).toHaveBeenCalledWith(5);
    expect(storeModel.releaseCapacity).toHaveBeenCalledWith(2, 8);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('owner cannot cancel a non-pending booking', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'accepted', user_id: 10 });
    const next = jest.fn();
    await deleteBooking({ params: { id: '5' }, user: { id: 10, role: 'user' } }, mockRes(), next);
    expect(lastError(next).statusCode).toBe(400);
    expect(bookingModel.deleteBookingById).not.toHaveBeenCalled();
  });

  test('a non-owner non-admin cannot delete', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'pending', user_id: 10 });
    const next = jest.fn();
    await deleteBooking({ params: { id: '5' }, user: { id: 99, role: 'user' } }, mockRes(), next);
    expect(lastError(next).statusCode).toBe(403);
  });

  test('admin can delete any booking', async () => {
    bookingModel.getBookingById.mockResolvedValue({ id: 5, status: 'accepted', user_id: 10, store_id: null });
    bookingModel.deleteBookingById.mockResolvedValue();
    const res = mockRes();
    const next = jest.fn();
    await deleteBooking({ params: { id: '5' }, user: { id: 1, role: 'admin' } }, res, next);
    expect(bookingModel.deleteBookingById).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('404 when deleting a missing booking', async () => {
    bookingModel.getBookingById.mockResolvedValue(null);
    const next = jest.fn();
    await deleteBooking({ params: { id: '5' }, user: { id: 1, role: 'admin' } }, mockRes(), next);
    expect(lastError(next).statusCode).toBe(404);
  });
});

describe('getUserBookings (pagination wiring)', () => {
  test('passes parsed paging to the model and sets headers', async () => {
    bookingModel.getBookingsByUser.mockResolvedValue({ rows: [{ id: 1 }], total: 1 });
    const res = mockRes();
    const next = jest.fn();
    await getUserBookings({ query: { page: '1', limit: '10' }, user: { id: 10 } }, res, next);

    expect(bookingModel.getBookingsByUser).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ limit: 10, offset: 0 })
    );
    expect(res.set).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });
});
