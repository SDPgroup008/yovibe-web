import { buildEventSharePayload } from '../src/utils/eventShare';

describe('event sharing payloads', () => {
  const input = { title: 'Kampala Night Live', description: 'Live music and DJs.', url: 'https://yovibe.net/events/kampala-night-live' };

  test.each(['web', 'ios'])('%s keeps the canonical URL in the native URL field', (platform) => {
    const payload = buildEventSharePayload({ ...input, platform });
    expect(payload.url).toBe(input.url);
    expect(payload.message).not.toContain(input.url);
    expect(payload.message).toContain(input.description);
  });

  test('android includes the one canonical URL in its message', () => {
    const payload = buildEventSharePayload({ ...input, platform: 'android' });
    expect(payload).not.toHaveProperty('url');
    expect(payload.message.match(new RegExp(input.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
  });
});
