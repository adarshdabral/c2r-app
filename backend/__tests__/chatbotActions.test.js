const registry = require('../services/chatbot/actionRegistry');

describe('chatbot action registry', () => {
  test('matches a consumer read action', () => {
    const m = registry.findMatch('track my pickup', 'user');
    expect(m && m.id).toBe('track_pickup');
  });

  test('matches a consumer write action (cancel)', () => {
    const m = registry.findMatch('cancel my pickup', 'user');
    expect(m && m.id).toBe('cancel_pickup');
    expect(m.confirm).toBe(true);
  });

  test('role scoping: a user cannot match an admin action', () => {
    expect(registry.findMatch('platform health', 'user')).toBeNull();
    const asAdmin = registry.findMatch('platform health', 'admin');
    expect(asAdmin && asAdmin.id).toBe('platform_health');
  });

  test('role scoping: a recycler cannot match consumer-only actions', () => {
    // "cancel my pickup" is a consumer action; a recycler shouldn't match it.
    expect(registry.findMatch('cancel my pickup', 'recycler')).toBeNull();
  });

  test('unrelated text returns null (falls back to info engine)', () => {
    expect(registry.findMatch('what is the weather', 'user')).toBeNull();
  });

  test('getById enforces role permission', () => {
    expect(registry.getById('platform_health', 'user')).toBeNull();
    expect(registry.getById('platform_health', 'admin')).not.toBeNull();
    expect(registry.getById('cancel_pickup', 'user')).not.toBeNull();
  });

  test('listForRole returns titled, confirm-flagged actions', () => {
    const list = registry.listForRole('user');
    expect(list.length).toBeGreaterThan(0);
    const cancel = list.find((a) => a.id === 'cancel_pickup');
    expect(cancel).toMatchObject({ confirm: true });
  });

  test('every handler declares required fields', () => {
    for (const role of ['user', 'recycler', 'admin']) {
      for (const h of registry.permittedFor(role)) {
        expect(typeof h.id).toBe('string');
        expect(Array.isArray(h.roles)).toBe(true);
        expect(typeof h.execute).toBe('function');
      }
    }
  });
});
