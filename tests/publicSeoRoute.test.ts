import { canonicalHostRedirect } from '../netlify/edge-functions/canonical-host';
import { buildEventDocument, buildFeaturedEventsMarkup, eventIsGone, featuredEvents, injectEventDocumentHtml, injectFeaturedEventsHtml, parsePublicEntityPath, publicEntityStatus } from '../netlify/edge-functions/public-seo-status';
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

  test('builds accurate, offer-level Event JSON-LD without user-agent branches', () => {
    const paid = buildEventDocument({
      slug: 'kampala-night-live',
      name: 'Kampala Night Live',
      description: 'Live music and DJs.',
      date: '2030-12-20T18:00:00+03:00',
      time: '6:00 PM - 11:00 PM',
      venue_name: 'YoVibe Arena',
      venue_slug: 'yovibe-arena',
      location: 'Kampala',
      artists: ['Artist One', 'Artist Two'],
      poster_image_url: 'https://images.example.com/night-live.jpg',
      entry_fees: [{ name: 'Standard', amount: '25,000', maxTickets: 100 }, { name: 'VIP', amount: '80,000' }],
    }, 'https://yovibe.net/events/kampala-night-live');
    const free = buildEventDocument({
      slug: 'free-sunday-session',
      name: 'Free Sunday Session',
      date: '2030-12-21T18:00:00+03:00',
      venue_name: 'YoVibe Arena',
      is_free_entry: true,
    }, 'https://yovibe.net/events/free-sunday-session');

    expect(paid?.head).toContain('"@type":"Event"');
    expect(paid?.head).toContain('"price":"25000"');
    expect(paid?.head).toContain('"price":"80000"');
    expect(paid?.head).toContain('"@type":"BreadcrumbList"');
    expect(paid?.head).toContain('"name":"Artist One"');
    expect(paid?.head).not.toContain('InStock');
    expect(paid?.head).not.toContain('"organizer"');
    expect(paid?.head).toContain('https://yovibe.net/events/kampala-night-live');
    expect(paid?.summary).toContain('/events/tickets/kampala-night-live');
    expect(paid?.summary).toContain('/venues/yovibe-arena');
    expect(paid?.summary).toContain('capacity: 100');
    expect(free?.head).toContain('"price":"0"');
    const rendered = injectEventDocumentHtml('<html><head><title>YoVibe</title><link rel="canonical" href="https://yovibe.net/"></head><body><div id="root"></div></body></html>', paid!);
    expect(rendered).toContain('yovibe-event-summary');
    expect(rendered).not.toContain('<title>YoVibe</title>');
    expect((rendered.match(/rel="canonical"/g) || [])).toHaveLength(1);

    const source = fs.readFileSync(path.join(__dirname, '../netlify/edge-functions/public-seo-status.ts'), 'utf8');
    expect(source).not.toMatch(/user-agent/i);
  });

  test('does not create Event markup for past, cancelled, or incomplete events', () => {
    expect(buildEventDocument({ slug: 'past', name: 'Past', date: '2020-01-01T18:00:00+03:00' }, 'https://yovibe.net/events/past')).toBeNull();
    expect(buildEventDocument({ slug: 'cancelled', name: 'Cancelled', date: '2030-01-01T18:00:00+03:00', event_status: 'cancelled' }, 'https://yovibe.net/events/cancelled')).toBeNull();
    expect(buildEventDocument({ slug: 'no-date', name: 'No date' }, 'https://yovibe.net/events/no-date')).toBeNull();
  });

  test('publishes at most six upcoming featured events as crawlable canonical links', () => {
    const now = new Date('2030-01-01T09:00:00+03:00');
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      slug: `featured-${index + 1}`,
      name: `Featured ${index + 1}`,
      date: `2030-01-${String(index + 2).padStart(2, '0')}T18:00:00+03:00`,
      venue_name: 'YoVibe Arena',
      is_featured: true,
    }));
    const selected = featuredEvents([
      ...candidates,
      { slug: 'not-featured', name: 'Not featured', date: '2030-01-02T18:00:00+03:00', is_featured: false },
      { slug: 'past-featured', name: 'Past featured', date: '2029-12-31T18:00:00+03:00', is_featured: true },
      { slug: 'cancelled-featured', name: 'Cancelled featured', date: '2030-01-02T18:00:00+03:00', event_status: 'cancelled', is_featured: true },
    ], now);
    expect(selected).toHaveLength(6);
    expect(selected.map((event) => event.slug)).toEqual(candidates.slice(0, 6).map((event) => event.slug));

    const markup = buildFeaturedEventsMarkup([...candidates, { slug: 'past-featured', name: 'Past featured', date: '2020-12-31T18:00:00+03:00', is_featured: true }], 'https://yovibe.net');
    expect(markup).toContain('id="yovibe-hot-picks"');
    expect(markup).toContain('data-yovibe-seo-fallback="true" hidden aria-hidden="true"');
    expect(markup).toContain('Hot Pick');
    expect(markup).toContain('href="https://yovibe.net/events/featured-1"');
    expect(markup).not.toContain('past-featured');
    expect((markup.match(/href="https:\/\/yovibe\.net\/events\//g) || [])).toHaveLength(6);
    expect(injectFeaturedEventsHtml('<html><body><div id="root"></div></body></html>', markup)).toContain('yovibe-hot-picks');
  });

  test('serves the right robots directives for production and staging', () => {
    expect(robotsBody('production')).toContain('Allow: /');
    expect(robotsBody('production')).toContain('Sitemap: https://yovibe.net/sitemap.xml');
    expect(robotsBody('staging')).toContain('Disallow: /');
  });
});
