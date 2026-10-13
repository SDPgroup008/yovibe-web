const { buildRobotsTxt, buildSitemapUrls } = require('../netlify/shared/seoIndexing');

describe('SEO crawl configuration', () => {
  test('allows crawling in production and blocks staging', () => {
    expect(buildRobotsTxt()).toContain('Allow: /');
    expect(buildRobotsTxt()).toContain('Sitemap: https://yovibe.net/sitemap.xml');
    expect(buildRobotsTxt({ isStaging: true })).toContain('Disallow: /');
  });

  test('sitemap contains only public static pages, active venues, and upcoming events', () => {
    const urls = buildSitemapUrls({
      siteUrl: 'https://yovibe.net',
      now: new Date('2026-10-13T09:00:00+03:00'),
      venues: [{ slug: 'torino-bar-restaurant', created_at: '2026-09-01T00:00:00Z' }],
      events: [
        { slug: 'future-concert', date: '2026-10-20T18:00:00+03:00', event_status: 'scheduled' },
        { slug: 'past-concert', date: '2026-10-11T18:00:00+03:00', event_status: 'scheduled' },
        { slug: 'cancelled-concert', date: '2026-10-20T18:00:00+03:00', event_status: 'cancelled' },
      ],
    }).map(({ loc }) => loc);

    expect(urls).toEqual(expect.arrayContaining([
      'https://yovibe.net/',
      'https://yovibe.net/events',
      'https://yovibe.net/venues/torino-bar-restaurant',
      'https://yovibe.net/events/future-concert',
    ]));
    expect(urls).not.toEqual(expect.arrayContaining([
      'https://yovibe.net/events/kampala',
      'https://yovibe.net/events/past-concert',
      'https://yovibe.net/events/cancelled-concert',
    ]));
  });
});
