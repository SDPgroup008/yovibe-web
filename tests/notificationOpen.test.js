jest.mock('../netlify/shared/supabaseAdmin', () => ({
  getAdminClient: jest.fn(),
  json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
}));
jest.mock('../netlify/functions/notification-feed', () => ({
  optionalAuthUser: jest.fn(),
  resolveInstallation: jest.fn(),
}));
const { getAdminClient } = require('../netlify/shared/supabaseAdmin');
const { optionalAuthUser, resolveInstallation } = require('../netlify/functions/notification-feed');
const { handler } = require('../netlify/functions/notification-open');
const notificationId = 'a39bb65a-bc4e-4ec7-9e3a-c86187e63768';
const installationId = 'd39bb65a-bc4e-4ec7-9e3a-c86187e63768';

function setup(notification) {
  const writes = [];
  const admin = { from: (table) => {
    if (table === 'notifications') return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: notification, error: null }) };
    if (table === 'notification_installation_opens') return { upsert: async (values, options) => { writes.push({ values, options }); return { error: null }; } };
    throw new Error('Unexpected table');
  } };
  getAdminClient.mockReturnValue(admin);
  optionalAuthUser.mockResolvedValue(null);
  resolveInstallation.mockResolvedValue({ id: installationId, broadcasts_from: '2026-10-19T00:00:00Z' });
  const event = { httpMethod: 'POST', body: JSON.stringify({ notificationId, installationId, installationSecret: 'secret' }) };
  return { event, writes };
}

test('guest opens are written using a conflict-safe installation key', async () => {
  const { event, writes } = setup({ id: notificationId, user_id: null, created_at: '2026-10-19T01:00:00Z' });
  expect((await handler(event)).statusCode).toBe(200);
  expect((await handler(event)).statusCode).toBe(200);
  expect(writes[0]).toEqual({ values: { notification_id: notificationId, installation_id: installationId }, options: { onConflict: 'notification_id,installation_id', ignoreDuplicates: true } });
});

test('guest cannot record earlier broadcasts or another user\'s personal notification', async () => {
  const first = setup({ id: notificationId, user_id: null, created_at: '2026-10-18T23:59:59Z' });
  expect((await handler(first.event)).statusCode).toBe(404);
  expect(first.writes).toHaveLength(0);
  const second = setup({ id: notificationId, user_id: 'other', created_at: '2026-10-19T01:00:00Z' });
  expect((await handler(second.event)).statusCode).toBe(404);
  expect(second.writes).toHaveLength(0);
});

test('invalid installation proof is rejected', async () => {
  const { event, writes } = setup({ id: notificationId, user_id: null, created_at: '2026-10-19T01:00:00Z' });
  resolveInstallation.mockRejectedValueOnce(Object.assign(new Error('Not registered'), { statusCode: 403 }));
  expect((await handler(event)).statusCode).toBe(403);
  expect(writes).toHaveLength(0);
});

test('authenticated users may record only their own personal notification', async () => {
  const { event, writes } = setup({ id: notificationId, user_id: 'buyer', created_at: '2026-10-19T01:00:00Z' });
  optionalAuthUser.mockResolvedValueOnce({ id: 'buyer' });
  expect((await handler(event)).statusCode).toBe(200);
  expect(writes).toHaveLength(1);
});
