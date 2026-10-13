const KAMPALA_TIME_ZONE = 'Africa/Kampala';

const INDEXABLE_STATIC_PATHS = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/events', changefreq: 'daily', priority: '0.95' },
  { path: '/venues', changefreq: 'daily', priority: '0.95' },
  { path: '/calendar', changefreq: 'daily', priority: '0.9' },
  { path: '/map', changefreq: 'weekly', priority: '0.85' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.6' },
];

function buildRobotsTxt({ isStaging = false } = {}) {
  if (isStaging) {
    return '# Staging is intentionally excluded from search engines.\nUser-agent: *\nDisallow: /\n';
  }

  return 'User-agent: *\nAllow: /\n\nSitemap: https://yovibe.net/sitemap.xml\n';
}

function dateOnlyInKampala(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KAMPALA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function todayInKampala(now = new Date()) {
  return dateOnlyInKampala(now);
}

function isPastEvent(event, now = new Date()) {
  const eventDay = dateOnlyInKampala(event?.date);
  const today = todayInKampala(now);
  return Boolean(eventDay && today && eventDay < today);
}

function isIndexableEvent(event, now = new Date()) {
  const status = String(event?.event_status || '').toLowerCase();
  const eventDay = dateOnlyInKampala(event?.date);
  const today = todayInKampala(now);
  return Boolean(eventDay && today && eventDay >= today && status !== 'cancelled');
}

function validSlug(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeLastMod(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function buildSitemapUrls({ siteUrl, venues = [], events = [], now = new Date() }) {
  const origin = String(siteUrl || 'https://yovibe.net').replace(/\/$/, '');
  const staticUrls = INDEXABLE_STATIC_PATHS.map(({ path, changefreq, priority }) => ({
    loc: `${origin}${path}`,
    changefreq,
    priority,
  }));
  const venueUrls = venues
    .filter((venue) => validSlug(venue?.slug))
    .map((venue) => ({
      loc: `${origin}/venues/${encodeURIComponent(venue.slug.trim())}`,
      changefreq: 'daily',
      priority: '0.8',
      lastmod: normalizeLastMod(venue.created_at),
    }));
  const eventUrls = events
    .filter((event) => validSlug(event?.slug) && isIndexableEvent(event, now))
    .map((event) => ({
      loc: `${origin}/events/${encodeURIComponent(event.slug.trim())}`,
      changefreq: 'daily',
      priority: '0.8',
      lastmod: normalizeLastMod(event.created_at),
    }));

  return [...staticUrls, ...venueUrls, ...eventUrls];
}

module.exports = {
  buildRobotsTxt,
  buildSitemapUrls,
  isIndexableEvent,
  isPastEvent,
};
