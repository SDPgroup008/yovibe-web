const {
  buildFcmMessage,
  buildSummaryPayload,
  getSummaryWindow,
} = require('../netlify/shared/eventSummaryBroadcast');

describe('event summary broadcasts', () => {
  beforeAll(() => {
    process.env.SITE_URL = 'https://yovibe.net';
  });

  test('uses Kampala day boundaries', () => {
    const range = getSummaryWindow('today', new Date('2026-09-30T20:59:59.000Z'));
    expect(range.start).toBe('2026-09-29T21:00:00.000Z');
    expect(range.end).toBe('2026-09-30T21:00:00.000Z');
  });

  test('returns at most three public event previews', async () => {
    const rows = [1, 2, 3, 4].map((id) => ({
      slug: `event-${id}`,
      name: `Event ${id}`,
      date: `2026-09-30T${String(8 + id).padStart(2, '0')}:00:00Z`,
      poster_image_url: id === 3 ? 'https://cdn.example.com/poster.jpg?token=private' : `https://cdn.example.com/${id}.jpg`,
    }));
    const query = {
      select() { return this; },
      eq() { return this; },
      gte() { return this; },
      lt() { return this; },
      order() { return Promise.resolve({ data: rows, error: null }); },
    };

    const summary = await buildSummaryPayload({
      supabase: { from: () => query },
      mode: 'today',
      now: new Date('2026-09-30T12:00:00.000Z'),
    });

    expect(summary.events).toHaveLength(4);
    expect(summary.previews).toHaveLength(3);
    expect(summary.previews[0].posterUrl).toBe('https://cdn.example.com/1.jpg');
    expect(summary.previews[2].posterUrl).toBeUndefined();
    expect(summary.deepLink).toBe('https://yovibe.net/events');
  });

  test('keeps the push payload compact', () => {
    const summary = {
      mode: 'today',
      title: 'Events happening today: 3',
      body: 'A • B • C. See more events in YoVibe.',
      imageUrl: 'https://cdn.example.com/poster.jpg',
      deepLink: 'https://yovibe.net/events',
      range: { start: '2026-09-29T21:00:00.000Z', end: '2026-09-30T21:00:00.000Z' },
      events: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }],
      previews: [
        { slug: 'a', name: 'A', posterUrl: 'https://cdn.example.com/a.jpg' },
        { slug: 'b', name: 'B', posterUrl: 'https://cdn.example.com/b.jpg' },
        { slug: 'c', name: 'C', posterUrl: 'https://cdn.example.com/c.jpg' },
      ],
    };
    const message = buildFcmMessage(summary, 'notification-id', 'today:2026-09-30:09');
    expect(Buffer.byteLength(JSON.stringify(message), 'utf8')).toBeLessThan(4096);
    expect(message.message.webpush.fcm_options.link).toBe('https://yovibe.net/events');
    expect(message.message.notification.image).toBe('https://cdn.example.com/poster.jpg');
  });
});
