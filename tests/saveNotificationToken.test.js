jest.mock('../netlify/shared/supabaseAdmin', () => ({ getAdminClient: jest.fn() }));
const { getAdminClient } = require('../netlify/shared/supabaseAdmin');
const { handler } = require('../netlify/functions/save-token');

function client(authResult) {
  const writes = [];
  const admin = {
    auth: { getUser: jest.fn(async () => authResult) },
    from(table) {
      if (table !== 'notification_tokens') throw new Error('Unexpected table');
      return {
        select() { return this; }, eq() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        insert(values) { writes.push(values); return this; },
        single() { return Promise.resolve({ data: { id: 'id' }, error: null }); },
      };
    },
  };
  getAdminClient.mockReturnValue(admin);
  return { admin, writes };
}

test('guest cannot choose another user ID in registration JSON', async () => {
  const { writes } = client();
  const response = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: 'token', userId: 'victim' }) });
  expect(response.statusCode).toBe(200);
  expect(writes[0]).toMatchObject({ user_id: null, is_authenticated: false });
});

test('authenticated identity is derived from the verified bearer token', async () => {
  const { writes } = client({ data: { user: { id: 'real-user' } }, error: null });
  const response = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer verified' }, body: JSON.stringify({ token: 'token', userId: 'victim' }) });
  expect(response.statusCode).toBe(200);
  expect(writes[0]).toMatchObject({ user_id: 'real-user', is_authenticated: true });
});

test('invalid bearer cannot register an authenticated token', async () => {
  const { writes } = client({ data: { user: null }, error: { message: 'invalid' } });
  const response = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer invalid' }, body: JSON.stringify({ token: 'token' }) });
  expect(response.statusCode).toBe(401);
  expect(writes).toHaveLength(0);
});
