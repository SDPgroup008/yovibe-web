jest.mock('../netlify/shared/supabaseAdmin', () => ({
  requireUser: jest.fn(),
  json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
}));
const { requireUser } = require('../netlify/shared/supabaseAdmin');
const { handler, getTokenAnalytics, getBroadcastAnalytics, kampalaDate } = require('../netlify/functions/admin-notification-analytics');

function clientFor(rows) {
  return { from: (table) => ({
    select() { return this; }, is() { return this; }, gte() { return this; }, lt() { return this; }, order() { return this; },
    range(from, to) { return Promise.resolve({ data: (rows[table] || []).slice(from, to + 1), error: null }); },
  }) };
}

test('token counts paginate and Kampala dates cross UTC midnight correctly', async () => {
  const tokens = Array.from({ length: 1001 }, (_, id) => ({ id, is_active: id !== 0, is_authenticated: id % 2 === 0, subscribed_at: '2026-10-18T22:00:00Z' }));
  const result = await getTokenAnalytics(clientFor({ notification_tokens: tokens }), new Date('2026-10-19T06:00:00Z'));
  expect(kampalaDate('2026-10-18T22:00:00Z')).toBe('2026-10-19');
  expect(result).toMatchObject({ total: 1001, active: 1000, inactive: 1, authenticated: 501, guest: 500 });
  expect(result.daily[6]).toEqual({ date: '2026-10-19', count: 1001 });
});

test('broadcast metrics include known FCM counts without inventing missing delivery or opens', async () => {
  const rows = [
    { id: '1', created_at: '2026-10-19T06:00:00Z', data: { summaryMode: 'today', delivery: { targeted: 10, successful: 7, failed: 3, stale: 2 } } },
    { id: '2', created_at: '2026-10-19T07:00:00Z', data: { summaryMode: 'week' } },
    { id: '3', created_at: '2026-10-19T07:00:00Z', data: { kind: 'other' } },
  ];
  const result = await getBroadcastAnalytics(clientFor({ notifications: rows }), new Date('2026-10-19T10:00:00Z'));
  expect(result).toMatchObject({ broadcasts: 2, withDeliveryData: 1, targeted: 10, accepted: 7, failed: 3, invalid: 2, recordedOpens: 0 });
  expect(result.daily[6].count).toBe(7);
});

test('only authenticated administrators can access analytics', async () => {
  requireUser.mockResolvedValueOnce({ profile: { user_type: 'regular_user' } });
  expect((await handler({ httpMethod: 'POST', body: '{"tab":"tokens"}' })).statusCode).toBe(403);
  requireUser.mockRejectedValueOnce(Object.assign(new Error('Authentication required'), { statusCode: 401 }));
  expect((await handler({ httpMethod: 'POST', body: '{"tab":"tokens"}' })).statusCode).toBe(401);
  requireUser.mockResolvedValueOnce({ profile: { user_type: 'admin' }, admin: clientFor({ notification_tokens: [] }) });
  const response = await handler({ httpMethod: 'POST', body: '{"tab":"tokens"}' });
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body).data.total).toBe(0);
});

test('a missing optional opens table reports unavailable instead of zero', async () => {
  const client = clientFor({ notifications: [{ id: '1', created_at: '2026-10-19T06:00:00Z', data: { summaryMode: 'today' } }] });
  const originalFrom = client.from;
  client.from = (table) => table === 'notification_installation_opens'
    ? { select() { return this; }, gte() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: null, error: { code: '42P01' } }); } }
    : originalFrom(table);
  const result = await getBroadcastAnalytics(client, new Date('2026-10-19T10:00:00Z'));
  expect(result.recordedOpens).toBeNull();
});
