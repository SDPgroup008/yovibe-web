type EdgeRuntimeGlobals = typeof globalThis & {
  Netlify?: { env?: { get(name: string): string | undefined } };
  Deno?: { env?: { get(name: string): string | undefined } };
};

type PublicEntity = 'events' | 'venues';
type PublicEntityPath = { entity: PublicEntity; slug: string } | null;
type EntryFee = { name?: unknown; amount?: unknown; price?: unknown; maxTickets?: unknown };
export type PublicEvent = {
  slug?: string;
  name?: string;
  description?: string;
  poster_image_url?: string;
  date?: string;
  time?: string;
  event_status?: string;
  venue_slug?: string;
  venue_name?: string;
  location?: string;
  artists?: unknown;
  is_featured?: boolean;
  is_free_entry?: boolean;
  entry_fees?: unknown;
  created_at?: string;
  organizer_name?: string;
  created_by_type?: string;
};

type EventDocument = { head: string; summary: string };

const RESERVED_EVENT_SLUGS = new Set(['add', 'ticket-contacts', 'payment-callback']);
const RESERVED_VENUE_SLUGS = new Set(['add-event', 'ticket-contacts']);
const EVENT_SELECT = 'slug,name,description,poster_image_url,date,time,event_status,venue_slug,venue_name,location,artists,is_featured,is_free_entry,entry_fees,created_at,organizer_name,created_by_type';
const FEATURED_EVENT_LIMIT = 6;

function getEdgeEnv(name: string): string | undefined {
  const runtime = globalThis as EdgeRuntimeGlobals;
  try {
    const value = runtime.Netlify?.env?.get(name);
    if (value) return value;
  } catch {
    // Netlify.env is unavailable in local unit tests.
  }
  try {
    return runtime.Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}

export function parsePublicEntityPath(pathname: string): PublicEntityPath {
  const match = pathname.match(/^\/(events|venues)\/([^/]+)\/?$/);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  const entity = match[1] as PublicEntity;
  const reserved = entity === 'events' ? RESERVED_EVENT_SLUGS : RESERVED_VENUE_SLUGS;
  return !slug || reserved.has(slug) ? null : { entity, slug };
}

function isPublicEventsLanding(pathname: string): boolean {
  return pathname === '/' || pathname === '/events' || pathname === '/events/';
}

function dayInKampala(value: unknown): string | null {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function eventIsGone(event: PublicEvent, now = new Date()): boolean {
  if (String(event.event_status || '').toLowerCase() === 'cancelled') return true;
  const eventDay = dayInKampala(event.date);
  const today = dayInKampala(now);
  return Boolean(eventDay && today && eventDay < today);
}

function htmlEscape(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textValue(value: unknown, limit = 1000): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function publicImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function numericPrice(value: unknown): string | null {
  const match = String(value ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function ticketTiers(event: PublicEvent): Array<{ name: string; price: string; capacity: number | null }> {
  if (event.is_free_entry) return [{ name: 'Free entry', price: '0', capacity: null }];
  let fees = event.entry_fees;
  if (typeof fees === 'string') {
    try { fees = JSON.parse(fees); } catch { return []; }
  }
  if (!Array.isArray(fees)) return [];
  return fees.flatMap((fee, index) => {
    if (!fee || typeof fee !== 'object') return [];
    const item = fee as EntryFee;
    const price = numericPrice(item.amount ?? item.price);
    if (price === null) return [];
    const rawCapacity = Number(item.maxTickets);
    return [{
      name: textValue(item.name, 120) || `Ticket ${index + 1}`,
      price,
      capacity: Number.isInteger(rawCapacity) && rawCapacity > 0 ? rawCapacity : null,
    }];
  });
}

function performers(event: PublicEvent): string[] {
  if (!Array.isArray(event.artists)) return [];
  return [...new Set(event.artists.map((artist) => textValue(artist, 180)).filter(Boolean))].slice(0, 20);
}

function formatEventDate(date: Date, time: unknown): string {
  const dateText = new Intl.DateTimeFormat('en-UG', {
    timeZone: 'Africa/Kampala', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(date);
  const timeText = textValue(time, 120);
  return timeText ? `${dateText} · ${timeText}` : dateText;
}

function eventPurchaseUrl(canonicalUrl: string, slug: string): string {
  const origin = new URL(canonicalUrl).origin;
  return `${origin}/events/tickets/${encodeURIComponent(slug)}`;
}

type ClockTime = { hours: number; minutes: number };

/** Parse the time formats emitted by YoVibe's event form (24-hour or AM/PM). */
function parseClockTime(value: string): ClockTime | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
    if (meridiem === 'p') hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return { hours, minutes };
}

function dateAtKampalaTime(day: string, time: ClockTime): Date | null {
  const [year, month, date] = day.split('-').map(Number);
  if (![year, month, date].every(Number.isInteger)) return null;
  const value = new Date(Date.UTC(year, month - 1, date, time.hours - 3, time.minutes));
  return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Keep event dates in Kampala time and only emit an end when the stored time
 * range actually contains one. An end before the start is an overnight event.
 */
export function structuredEventTimes(event: PublicEvent): { start: Date; end?: Date } | null {
  const day = dayInKampala(event.date);
  const storedDate = new Date(String(event.date || ''));
  if (!day || Number.isNaN(storedDate.getTime())) return null;
  const range = textValue(event.time, 120).replace(/[–—]/g, '-').split(/\s+(?:to)\s+|\s*-\s*/i);
  const startClock = range[0] ? parseClockTime(range[0]) : null;
  const endClock = range.length === 2 ? parseClockTime(range[1]) : null;
  const start = startClock ? dateAtKampalaTime(day, startClock) : storedDate;
  if (!start) return null;
  const end = endClock ? dateAtKampalaTime(day, endClock) : null;
  if (end && end.getTime() <= start.getTime()) end.setUTCDate(end.getUTCDate() + 1);
  return end ? { start, end } : { start };
}

function validIsoDate(value: unknown): string | undefined {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function organizerSchema(event: PublicEvent): Record<string, string> | undefined {
  const name = textValue(event.organizer_name, 180);
  if (!name) return undefined;
  const creatorType = String(event.created_by_type || '').toLowerCase();
  const type = creatorType === 'user' || creatorType === 'regular_user'
    ? 'Person'
    : creatorType === 'club_owner' || creatorType === 'admin'
      ? 'Organization'
      : undefined;
  if (!type) return undefined;
  return {
    '@type': type,
    name,
  };
}

function offerAvailability(tier: { name: string; capacity: number | null }, soldCounts?: Record<string, number>): string | undefined {
  if (tier.capacity === null) return 'https://schema.org/InStock';
  const sold = soldCounts?.[tier.name];
  if (!Number.isInteger(sold) || sold < 0) return undefined;
  return sold >= tier.capacity ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock';
}

/** Build truthful event metadata used by people, Google, and social crawlers alike. */
export function buildEventDocument(event: PublicEvent, canonicalUrl: string, soldCounts?: Record<string, number>): EventDocument | null {
  if (eventIsGone(event)) return null;
  const eventTimes = structuredEventTimes(event);
  const name = textValue(event.name, 180);
  const slug = textValue(event.slug, 240);
  if (!name || !slug || !eventTimes) return null;
  const { start, end } = eventTimes;

  const origin = new URL(canonicalUrl).origin;
  const description = textValue(event.description, 1000) || `Discover ${name} on YoVibe.`;
  const image = publicImage(event.poster_image_url);
  const venueName = textValue(event.venue_name, 180);
  const venueSlug = textValue(event.venue_slug, 240);
  const locality = textValue(event.location, 180);
  const eventPerformers = performers(event);
  const tiers = ticketTiers(event);
  const purchaseUrl = eventPurchaseUrl(canonicalUrl, slug);
  const validFrom = validIsoDate(event.created_at);
  const offers = tiers.map((tier) => {
    const availability = offerAvailability(tier, soldCounts);
    return {
      '@type': 'Offer',
      name: tier.name,
      price: tier.price,
      priceCurrency: 'UGX',
      url: purchaseUrl,
      ...(validFrom ? { validFrom } : {}),
      ...(availability ? { availability } : {}),
    };
  });
  const eventSchema: Record<string, unknown> = {
    '@type': 'Event',
    name,
    description,
    startDate: start.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: canonicalUrl,
  };
  if (end) eventSchema.endDate = end.toISOString();
  if (venueName) {
    eventSchema.location = {
      '@type': 'Place',
      name: venueName,
      address: { '@type': 'PostalAddress', addressLocality: locality || 'Kampala', addressCountry: 'UG' },
    };
  }
  if (image) eventSchema.image = [image];
  if (eventPerformers.length) eventSchema.performer = eventPerformers.map((artist) => ({ '@type': 'PerformingGroup', name: artist }));
  const organizer = organizerSchema(event);
  if (organizer) eventSchema.organizer = organizer;
  if (offers.length) eventSchema.offers = offers;

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      eventSchema,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Events', item: `${origin}/events` },
          { '@type': 'ListItem', position: 3, name, item: canonicalUrl },
        ],
      },
    ],
  };

  const venueMarkup = venueName
    ? `<p><strong>Venue:</strong> ${venueSlug ? `<a href="${htmlEscape(`${origin}/venues/${encodeURIComponent(venueSlug)}`)}">${htmlEscape(venueName)}</a>` : htmlEscape(venueName)}${locality ? `, ${htmlEscape(locality)}` : ''}</p>`
    : '';
  const artistMarkup = eventPerformers.length
    ? `<section><h2>Artists</h2><ul>${eventPerformers.map((artist) => `<li>${htmlEscape(artist)}</li>`).join('')}</ul></section>`
    : '';
  const ticketMarkup = tiers.length
    ? `<section><h2>Tickets</h2><ul>${tiers.map((tier) => `<li><strong>${htmlEscape(tier.name)}</strong> — UGX ${htmlEscape(tier.price)}${tier.capacity ? ` (capacity: ${htmlEscape(tier.capacity)})` : ''}</li>`).join('')}</ul></section>`
    : '';
  // React replaces this server fallback with the full Event Detail screen after
  // startup. Keep it out of sight until then so visitors never see unstyled HTML.
  const summary = `<main id="yovibe-event-summary" data-yovibe-seo-fallback="true" hidden aria-hidden="true"><article>${image ? `<img src="${htmlEscape(image)}" alt="${htmlEscape(`Poster for ${name}`)}">` : ''}<h1>${htmlEscape(name)}</h1><p>${htmlEscape(description)}</p><p><strong>Date and time:</strong> <time datetime="${htmlEscape(start.toISOString())}">${htmlEscape(formatEventDate(start, event.time))}</time></p>${venueMarkup}${artistMarkup}${ticketMarkup}<p><a href="${htmlEscape(purchaseUrl)}">Buy tickets for ${htmlEscape(name)}</a></p></article></main>`;
  const socialImage = image || `${origin}/assets/icon.png`;
  const head = `<title>${htmlEscape(name)} | YoVibe</title><meta name="description" content="${htmlEscape(description.slice(0, 160))}"><link rel="canonical" href="${htmlEscape(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:url" content="${htmlEscape(canonicalUrl)}"><meta property="og:title" content="${htmlEscape(name)} | YoVibe"><meta property="og:description" content="${htmlEscape(description.slice(0, 160))}"><meta property="og:image" content="${htmlEscape(socialImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${htmlEscape(name)} | YoVibe"><meta name="twitter:description" content="${htmlEscape(description.slice(0, 160))}"><meta name="twitter:image" content="${htmlEscape(socialImage)}"><script id="yovibe-event-jsonld" type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
  return { head, summary };
}

export function featuredEvents(events: PublicEvent[], now = new Date()): PublicEvent[] {
  return events
    .filter((event) => event.is_featured === true && !eventIsGone(event, now) && String(event.event_status || '').toLowerCase() !== 'cancelled' && textValue(event.slug))
    .sort((a, b) => new Date(String(a.date || '')).getTime() - new Date(String(b.date || '')).getTime())
    .slice(0, FEATURED_EVENT_LIMIT);
}

export function buildFeaturedEventsMarkup(events: PublicEvent[], origin: string): string {
  const selected = featuredEvents(events);
  if (!selected.length) return '';
  const links = selected.map((event) => {
    const slug = textValue(event.slug, 240);
    const name = textValue(event.name, 180) || 'Featured event';
    const date = new Date(String(event.date || ''));
    const venue = textValue(event.venue_name, 180);
    const details = Number.isNaN(date.getTime()) ? venue : `${formatEventDate(date, event.time)}${venue ? ` · ${venue}` : ''}`;
    return `<li><span>Hot Pick</span> <a href="${htmlEscape(`${origin}/events/${encodeURIComponent(slug)}`)}">${htmlEscape(name)}</a>${details ? `<p>${htmlEscape(details)}</p>` : ''}</li>`;
  }).join('');
  // This is a crawlable pre-app fallback. React replaces the root with the real
  // featured carousel after it loads, so keep the fallback out of the visual and
  // accessibility trees to prevent a flash of unstyled event links.
  return `<section id="yovibe-hot-picks" data-yovibe-seo-fallback="true" hidden aria-hidden="true"><ul>${links}</ul></section>`;
}

export function injectEventDocumentHtml(html: string, document: EventDocument): string {
  const withoutSiteWideDocumentTags = html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\b[^>]*(?:name|property)=["'](?:description|og:(?:type|url|title|description|image)|twitter:(?:card|title|description|image))["'][^>]*>/gi, '');
  const withHead = withoutSiteWideDocumentTags.replace(/<\/head>/i, `${document.head}</head>`);
  if (/<div[^>]+id=["']root["'][^>]*>/i.test(withHead)) {
    return withHead.replace(/(<div[^>]+id=["']root["'][^>]*>)/i, `$1${document.summary}`);
  }
  return withHead.replace(/<body[^>]*>/i, `$&${document.summary}`);
}

export function injectFeaturedEventsHtml(html: string, markup: string): string {
  if (!markup) return html;
  if (/<div[^>]+id=["']root["'][^>]*>/i.test(html)) {
    return html.replace(/(<div[^>]+id=["']root["'][^>]*>)/i, `$1${markup}`);
  }
  return html.replace(/<body[^>]*>/i, `$&${markup}`);
}

function brandedErrorPage(status: 404 | 410, pathname: string): Response {
  const title = status === 410 ? 'Event retired' : 'Page not found';
  const message = status === 410 ? 'This event has ended and is no longer available on YoVibe.' : 'The YoVibe page you requested could not be found.';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | YoVibe</title></head><body><main><h1>${title}</h1><p>${message}</p><p><a href="/">Return to YoVibe</a></p><small>${htmlEscape(pathname)}</small></main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

async function fetchPublicEntity(entity: PublicEntity, slug: string): Promise<PublicEvent | Record<string, unknown> | null | undefined> {
  const supabaseUrl = getEdgeEnv('SUPABASE_URL') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const apiKey = getEdgeEnv('SUPABASE_PUBLISHABLE_KEY') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || getEdgeEnv('SUPABASE_ANON_KEY') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !apiKey) return undefined;
  const endpoint = new URL(`/rest/v1/${entity}`, supabaseUrl);
  endpoint.searchParams.set('select', entity === 'events' ? EVENT_SELECT : 'slug');
  endpoint.searchParams.set('slug', `eq.${slug}`);
  endpoint.searchParams.set('is_deleted', 'eq.false');
  endpoint.searchParams.set('limit', '1');
  const response = await fetch(endpoint, { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Public ${entity} lookup failed (${response.status})`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchFeaturedEvents(): Promise<PublicEvent[] | undefined> {
  const supabaseUrl = getEdgeEnv('SUPABASE_URL') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const apiKey = getEdgeEnv('SUPABASE_PUBLISHABLE_KEY') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || getEdgeEnv('SUPABASE_ANON_KEY') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !apiKey) return undefined;
  const endpoint = new URL('/rest/v1/events', supabaseUrl);
  endpoint.searchParams.set('select', EVENT_SELECT);
  endpoint.searchParams.set('is_deleted', 'eq.false');
  endpoint.searchParams.set('is_featured', 'eq.true');
  endpoint.searchParams.set('event_status', 'neq.cancelled');
  endpoint.searchParams.set('order', 'date.asc');
  endpoint.searchParams.set('limit', String(FEATURED_EVENT_LIMIT));
  const response = await fetch(endpoint, { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Featured events lookup failed (${response.status})`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows as PublicEvent[] : [];
}

/**
 * The public inventory function exposes only aggregate counts for named ticket
 * tiers. Never make structured data claim stock when that source is unavailable.
 */
async function fetchTicketAvailability(origin: string, event: PublicEvent): Promise<Record<string, number> | undefined> {
  const slug = textValue(event.slug, 240);
  const cappedFeeTypes = ticketTiers(event)
    .filter((tier) => tier.capacity !== null)
    .map((tier) => tier.name);
  if (!slug || !cappedFeeTypes.length) return {};
  try {
    const response = await fetch(new URL('/.netlify/functions/ticket-availability', origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ eventSlug: slug, feeTypes: cappedFeeTypes }),
    });
    if (!response.ok) return undefined;
    const data = await response.json();
    if (!data || typeof data !== 'object' || !data.soldCounts || typeof data.soldCounts !== 'object') return undefined;
    const soldCounts: Record<string, number> = {};
    for (const name of cappedFeeTypes) {
      const count = (data.soldCounts as Record<string, unknown>)[name];
      if (Number.isInteger(count) && Number(count) >= 0) soldCounts[name] = Number(count);
    }
    return soldCounts;
  } catch {
    return undefined;
  }
}

export function publicEntityStatus(entity: PublicEntity, row: PublicEvent | Record<string, unknown> | null): 200 | 404 | 410 {
  if (!row) return 404;
  return entity === 'events' && eventIsGone(row as PublicEvent) ? 410 : 200;
}

export default async (request: Request, context: any) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();
  const url = new URL(request.url);
  const entityPath = parsePublicEntityPath(url.pathname);
  const landingPage = isPublicEventsLanding(url.pathname);
  if (!entityPath && !landingPage) return context.next();

  try {
    if (landingPage) {
      const featured = await fetchFeaturedEvents();
      const upstream = await context.next();
      if (!featured || request.method === 'HEAD' || String(getEdgeEnv('APP_ENV')).toLowerCase() === 'staging' || !String(upstream.headers.get('content-type') || '').includes('text/html')) return upstream;
      const markup = buildFeaturedEventsMarkup(featured, url.origin);
      if (!markup) return upstream;
      const headers = new Headers(upstream.headers);
      headers.delete('content-length');
      headers.delete('etag');
      headers.set('Cache-Control', 'public, max-age=0, s-maxage=300');
      return new Response(injectFeaturedEventsHtml(await upstream.text(), markup), { status: upstream.status, statusText: upstream.statusText, headers });
    }

    const row = await fetchPublicEntity(entityPath!.entity, entityPath!.slug);
    if (row === undefined) return context.next();
    const status = publicEntityStatus(entityPath!.entity, row);
    if (status !== 200) return brandedErrorPage(status, url.pathname);

    const upstream = await context.next();
    if (entityPath!.entity !== 'events' || request.method === 'HEAD' || String(getEdgeEnv('APP_ENV')).toLowerCase() === 'staging') return upstream;
    const event = row as PublicEvent;
    const soldCounts = await fetchTicketAvailability(url.origin, event);
    const document = buildEventDocument(event, `${url.origin}${url.pathname}`, soldCounts);
    if (!document || !String(upstream.headers.get('content-type') || '').includes('text/html')) return upstream;
    const headers = new Headers(upstream.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    return new Response(injectEventDocumentHtml(await upstream.text(), document), { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (error) {
    console.error('[public-seo-status] Public entity lookup failed; passing through to avoid false errors', error);
    return context.next();
  }
};
