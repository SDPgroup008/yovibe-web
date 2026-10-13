const { buildRobotsTxt, buildSitemapUrls } = require('../netlify/shared/seoIndexing');
const fs = require('fs');
const path = require('path');

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
      'https://yovibe.net/about',
      'https://yovibe.net/contact',
      'https://yovibe.net/venues/torino-bar-restaurant',
      'https://yovibe.net/events/future-concert',
    ]));
    expect(urls).not.toEqual(expect.arrayContaining([
      'https://yovibe.net/events/kampala',
      'https://yovibe.net/events/past-concert',
      'https://yovibe.net/events/cancelled-concert',
    ]));
  });

  test('sitemap queries only columns available on each table', () => {
    const source = fs.readFileSync(path.join(__dirname, '../netlify/functions/sitemap.js'), 'utf8');
    expect(source).toMatch(/table:\s*["']venues["'][\s\S]{0,120}select:\s*["']slug,created_at["']/);
    expect(source).toMatch(/table:\s*["']events["'][\s\S]{0,120}select:\s*["']slug,created_at,date,event_status["']/);
  });
});
