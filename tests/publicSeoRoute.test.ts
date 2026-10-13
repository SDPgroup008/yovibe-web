import { canonicalHostRedirect } from '../netlify/edge-functions/canonical-host';
import { eventIsGone, parsePublicEntityPath, publicEntityStatus } from '../netlify/edge-functions/public-seo-status';
import { robotsBody } from '../netlify/edge-functions/robots';
import { isSocialPreviewCrawler } from '../netlify/edge-functions/event-social-preview';

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

  test('keeps one canonical host and gives Google the normal public page', () => {
    const redirect = canonicalHostRedirect(new URL('http://www.yovibe.net/events/test?ref=ad'));
    expect(redirect?.status).toBe(301);
    expect(redirect?.headers.get('location')).toBe('https://yovibe.net/events/test?ref=ad');
    expect(canonicalHostRedirect(new URL('http://yovibe.net/events/test'))?.headers.get('location')).toBe('https://yovibe.net/events/test');
    expect(canonicalHostRedirect(new URL('https://yovibe.net/events/test'))).toBeNull();
    expect(isSocialPreviewCrawler('Googlebot/2.1')).toBe(false);
    expect(isSocialPreviewCrawler('facebookexternalhit/1.1')).toBe(true);
  });

  test('serves the right robots directives for production and staging', () => {
    expect(robotsBody('production')).toContain('Allow: /');
    expect(robotsBody('production')).toContain('Sitemap: https://yovibe.net/sitemap.xml');
    expect(robotsBody('staging')).toContain('Disallow: /');
  });
});
