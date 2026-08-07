jest.mock('../services/featureService', () => ({ isEnabled: jest.fn() }));
jest.mock('../models/notificationModel', () => ({
  create: jest.fn(),
  createMany: jest.fn(),
}));
const featureService = require('../services/featureService');
const model = require('../models/notificationModel');
const service = require('../services/notificationService');

beforeEach(() => jest.clearAllMocks());

describe('notificationService.notify', () => {
  test('no-ops when the notifications feature is disabled', async () => {
    featureService.isEnabled.mockResolvedValue(false);
    const id = await service.notify({ userId: 1, category: 'pickup', type: 't', title: 'Hi' });
    expect(id).toBeNull();
    expect(model.create).not.toHaveBeenCalled();
  });

  test('creates an in-app notification when enabled', async () => {
    featureService.isEnabled.mockResolvedValue(true);
    model.create.mockResolvedValue(42);
    const id = await service.notify({ userId: 1, category: 'pickup', type: 'pickup_completed', title: 'Done' });
    expect(id).toBe(42);
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, category: 'pickup', type: 'pickup_completed', title: 'Done', channel: 'in_app' })
    );
  });

  test('ignores calls missing required fields', async () => {
    featureService.isEnabled.mockResolvedValue(true);
    expect(await service.notify({ userId: 1, category: 'pickup', type: 't' })).toBeNull(); // no title
    expect(model.create).not.toHaveBeenCalled();
  });

  test('notifySafe never throws', async () => {
    featureService.isEnabled.mockRejectedValue(new Error('boom'));
    await expect(service.notifySafe({ userId: 1, category: 'pickup', type: 't', title: 'x' })).resolves.toBeNull();
  });

  test('broadcast no-ops when disabled, delivers when enabled', async () => {
    featureService.isEnabled.mockResolvedValue(false);
    expect(await service.broadcast([1, 2], { category: 'admin', type: 'b', title: 'Hi' })).toBe(0);

    featureService.isEnabled.mockResolvedValue(true);
    model.createMany.mockResolvedValue(2);
    expect(await service.broadcast([1, 2], { category: 'admin', type: 'b', title: 'Hi' })).toBe(2);
  });
});
