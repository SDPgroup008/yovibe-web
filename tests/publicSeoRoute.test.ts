import { canonicalHostRedirect } from '../netlify/edge-functions/canonical-host';
import { buildEventDocument, eventIsGone, injectEventDocumentHtml, parsePublicEntityPath, publicEntityStatus } from '../netlify/edge-functions/public-seo-status';
import { robotsBody } from '../netlify/edge-functions/robots';
import fs from 'fs';
import path from 'path';

describe('public SEO route handling', () => {
  test('recognises public detail routes but leaves app routes alone', () => {
    expect(parsePublicEntityPath('/events/future-concert')).toEqual({ entity: 'events', slug: 'future-concert' });
    expect(parsePublicEntityPath('/venues/torino-bar-restaurant/')).toEqual({ entity: 'venues', slug: 'torino-bar-restaurant' });
    expect(parsePublicEntityPath('/events/ticket-contacts')).toBeNull();
    expect(parsePublicEntityPath('/events/future-concert/tickets')).toBeNull();
  });

  test('marks unknown, past, and cancelled content correctly', () => {
    const now = new Date('2026-10-13T09:00:00+03:00');
    expect(publicEntityStatus('venues', null)).toBe(404);
    expect(eventIsGone({ date: '2026-10-11T18:00:00+03:00' }, now)).toBe(true);
    expect(eventIsGone({ date: '2026-10-20T18:00:00+03:00' }, now)).toBe(false);
    expect(publicEntityStatus('events', { date: '2026-10-11T18:00:00+03:00' })).toBe(410);
    expect(publicEntityStatus('events', { event_status: 'cancelled' })).toBe(410);
  });

  test('keeps one canonical host', () => {
    const redirect = canonicalHostRedirect(new URL('http://www.yovibe.net/events/test?ref=ad'));
    expect(redirect?.status).toBe(301);
    expect(redirect?.headers.get('location')).toBe('https://yovibe.net/events/test?ref=ad');
    expect(canonicalHostRedirect(new URL('http://yovibe.net/events/test'))?.headers.get('location')).toBe('https://yovibe.net/events/test');
    expect(canonicalHostRedirect(new URL('https://yovibe.net/events/test'))).toBeNull();
  });

  test('builds accurate Event JSON-LD and identical markup without user-agent branches', () => {
    const paid = buildEventDocument({
      name: 'Kampala Night Live',
      description: 'Live music and DJs.',
      date: '2030-12-20T18:00:00+03:00',
      venue_name: 'YoVibe Arena',
      location: 'Kampala',
      poster_image_url: 'https://images.example.com/night-live.jpg',
      entry_fees: [{ amount: '25,000' }],
    }, 'https://yovibe.net/events/kampala-night-live');
    const free = buildEventDocument({
      name: 'Free Sunday Session',
      date: '2030-12-21T18:00:00+03:00',
      venue_name: 'YoVibe Arena',
      is_free_entry: true,
    }, 'https://yovibe.net/events/free-sunday-session');

    expect(paid?.head).toContain('"@type":"Event"');
    expect(paid?.head).toContain('"price":"25000"');
    expect(paid?.head).toContain('https://yovibe.net/events/kampala-night-live');
    expect(free?.head).toContain('"price":"0"');
    const rendered = injectEventDocumentHtml('<html><head><title>YoVibe</title><link rel="canonical" href="https://yovibe.net/"></head><body><div id="root"></div></body></html>', paid!);
    expect(rendered).toContain('yovibe-event-summary');
    expect(rendered).not.toContain('<title>YoVibe</title>');
    expect((rendered.match(/rel="canonical"/g) || [])).toHaveLength(1);

    const source = fs.readFileSync(path.join(__dirname, '../netlify/edge-functions/public-seo-status.ts'), 'utf8');
    expect(source).not.toMatch(/user-agent/i);
  });

  test('does not create Event markup for past, cancelled, or incomplete events', () => {
    expect(buildEventDocument({ name: 'Past', date: '2020-01-01T18:00:00+03:00' }, 'https://yovibe.net/events/past')).toBeNull();
    expect(buildEventDocument({ name: 'Cancelled', date: '2030-01-01T18:00:00+03:00', event_status: 'cancelled' }, 'https://yovibe.net/events/cancelled')).toBeNull();
    expect(buildEventDocument({ name: 'No date' }, 'https://yovibe.net/events/no-date')).toBeNull();
  });

  test('serves the right robots directives for production and staging', () => {
    expect(robotsBody('production')).toContain('Allow: /');
    expect(robotsBody('production')).toContain('Sitemap: https://yovibe.net/sitemap.xml');
    expect(robotsBody('staging')).toContain('Disallow: /');
  });
});
