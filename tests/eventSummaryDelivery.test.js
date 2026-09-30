jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((credentials) => credentials),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn((options) => options),
}));

const mockSendEachForMulticast = jest.fn(async ({ tokens }) => ({
  responses: tokens.map(() => ({ success: true })),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ sendEachForMulticast: mockSendEachForMulticast })),
}));

const {
  buildMulticastMessage,
  sendToActiveTokens,
} = require('../netlify/shared/eventSummaryBroadcast');

function createSupabase(tokens) {
  const updates = [];
  return {
    updates,
    from(table) {
      if (table !== 'notification_tokens') throw new Error(`Unexpected table: ${table}`);
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        range(_from, _to) {
          return Promise.resolve({ data: tokens, error: null });
        },
        update(values) {
          updates.push(values);
          return this;
        },
        in() {
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

describe('event summary multicast delivery', () => {
  beforeEach(() => {
    mockSendEachForMulticast.mockClear();
    process.env.FIREBASE_PROJECT_ID = 'test-project';
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'test-project',
      client_email: 'test@example.com',
      private_key: 'test-key',
    });
  });

  test('builds a token-targeted message without a topic', () => {
    const message = buildMulticastMessage({
      mode: 'today',
      title: 'Events happening today: 1',
      body: 'One event. See more events in YoVibe.',
      imageUrl: 'https://cdn.example.com/poster.jpg',
      deepLink: 'https://yovibe.net/events',
      range: { start: '2026-09-29T21:00:00.000Z', end: '2026-09-30T21:00:00.000Z' },
      events: [{ slug: 'one' }],
      previews: [{ slug: 'one', name: 'One', posterUrl: 'https://cdn.example.com/poster.jpg' }],
    }, 'notification-id', 'today:2026-09-30:09');

    expect(message.topic).toBeUndefined();
    expect(message.notification.image).toBe('https://cdn.example.com/poster.jpg');
    expect(message.webpush.fcmOptions.link).toBe('https://yovibe.net/events');
  });

  test('chunks active tokens into Firebase multicast batches of 500', async () => {
    const tokens = Array.from({ length: 501 }, (_, index) => ({ token: `token-${index}` }));
    const supabase = createSupabase(tokens);
    const result = await sendToActiveTokens({
      supabase,
      message: { notification: { title: 'Test', body: 'Test' }, data: {} },
    });

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(mockSendEachForMulticast.mock.calls[0][0].tokens).toHaveLength(500);
    expect(mockSendEachForMulticast.mock.calls[1][0].tokens).toHaveLength(1);
    expect(result).toEqual({ targeted: 501, successful: 501, failed: 0, stale: 0 });
  });

  test('deactivates registration tokens rejected as stale', async () => {
    mockSendEachForMulticast.mockResolvedValueOnce({
      responses: [{ success: false, error: { code: 'messaging/registration-token-not-registered' } }],
    });
    const supabase = createSupabase([{ token: 'expired-token' }]);
    const result = await sendToActiveTokens({
      supabase,
      message: { notification: { title: 'Test', body: 'Test' }, data: {} },
    });

    expect(result).toEqual({ targeted: 1, successful: 0, failed: 1, stale: 1 });
    expect(supabase.updates[0].is_active).toBe(false);
  });
});
