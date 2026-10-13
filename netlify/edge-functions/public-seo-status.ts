type EdgeRuntimeGlobals = typeof globalThis & {
  Netlify?: { env?: { get(name: string): string | undefined } };
  Deno?: { env?: { get(name: string): string | undefined } };
};

type PublicEntity = 'events' | 'venues';
type PublicEntityPath = { entity: PublicEntity; slug: string } | null;
export type PublicEvent = {
  slug?: string;
  name?: string;
  description?: string;
  poster_image_url?: string;
  date?: string;
  time?: string;
  event_status?: string;
  venue_name?: string;
  location?: string;
  is_free_entry?: boolean;
  entry_fees?: unknown;
};

type EventDocument = { head: string; summary: string };

const RESERVED_EVENT_SLUGS = new Set(['add', 'ticket-contacts', 'payment-callback']);
const RESERVED_VENUE_SLUGS = new Set(['add-event', 'ticket-contacts']);
const EVENT_SELECT = 'slug,name,description,poster_image_url,date,time,event_status,venue_name,location,is_free_entry,entry_fees';

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

function eventPrice(event: PublicEvent): string | null {
  if (event.is_free_entry) return '0';
  let fees = event.entry_fees;
  if (typeof fees === 'string') {
    try { fees = JSON.parse(fees); } catch { return null; }
  }
  const candidate = Array.isArray(fees) ? fees[0] : fees;
  const amount = candidate && typeof candidate === 'object'
    ? (candidate as { amount?: unknown; price?: unknown }).amount ?? (candidate as { price?: unknown }).price
    : candidate;
  const match = String(amount ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

/** Build truthful event metadata used by people, Google, and social crawlers alike. */
export function buildEventDocument(event: PublicEvent, canonicalUrl: string): EventDocument | null {
  if (eventIsGone(event)) return null;
  const start = new Date(String(event.date || ''));
  const name = textValue(event.name, 180);
  if (!name || Number.isNaN(start.getTime())) return null;

  const origin = new URL(canonicalUrl).origin;
  const description = textValue(event.description, 1000) || `Discover ${name} on YoVibe.`;
  const image = publicImage(event.poster_image_url);
  const venueName = textValue(event.venue_name, 180);
  const locality = textValue(event.location, 180);
  const price = eventPrice(event);
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    description,
    startDate: start.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: canonicalUrl,
    organizer: { '@type': 'Organization', name: 'YoVibe', url: `${origin}/` },
  };
  if (venueName) {
    schema.location = {
      '@type': 'Place',
      name: venueName,
      address: { '@type': 'PostalAddress', addressLocality: locality || 'Kampala', addressCountry: 'UG' },
    };
  }
  if (image) schema.image = [image];
  if (price !== null) schema.offers = { '@type': 'Offer', url: canonicalUrl, price, priceCurrency: 'UGX' };

  const socialImage = image || `${origin}/assets/icon.png`;
  const summary = `<main id="yovibe-event-summary"><article><h1>${htmlEscape(name)}</h1><p>${htmlEscape(description)}</p><p><strong>Date:</strong> ${htmlEscape(start.toISOString())}</p>${venueName ? `<p><strong>Venue:</strong> ${htmlEscape(venueName)}${locality ? `, ${htmlEscape(locality)}` : ''}</p>` : ''}<p><a href="${htmlEscape(canonicalUrl)}">View ${htmlEscape(name)} on YoVibe</a></p></article></main>`;
  const head = `<title>${htmlEscape(name)} | YoVibe</title><meta name="description" content="${htmlEscape(description.slice(0, 160))}"><link rel="canonical" href="${htmlEscape(canonicalUrl)}"><meta property="og:type" content="website"><meta property="og:url" content="${htmlEscape(canonicalUrl)}"><meta property="og:title" content="${htmlEscape(name)} | YoVibe"><meta property="og:description" content="${htmlEscape(description.slice(0, 160))}"><meta property="og:image" content="${htmlEscape(socialImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${htmlEscape(name)} | YoVibe"><meta name="twitter:description" content="${htmlEscape(description.slice(0, 160))}"><meta name="twitter:image" content="${htmlEscape(socialImage)}"><script id="yovibe-event-jsonld" type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
  return { head, summary };
}

export function injectEventDocumentHtml(html: string, document: EventDocument): string {
  // The static SPA shell has site-wide values. Replace them, rather than leave
  // competing titles/canonicals for an individual event URL.
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

export function publicEntityStatus(entity: PublicEntity, row: PublicEvent | Record<string, unknown> | null): 200 | 404 | 410 {
  if (!row) return 404;
  return entity === 'events' && eventIsGone(row as PublicEvent) ? 410 : 200;
}

export default async (request: Request, context: any) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();
  const url = new URL(request.url);
  const entityPath = parsePublicEntityPath(url.pathname);
  if (!entityPath) return context.next();

  try {
    const row = await fetchPublicEntity(entityPath.entity, entityPath.slug);
    if (row === undefined) return context.next();
    const status = publicEntityStatus(entityPath.entity, row);
    if (status !== 200) return brandedErrorPage(status, url.pathname);

    const upstream = await context.next();
    if (entityPath.entity !== 'events' || request.method === 'HEAD' || String(getEdgeEnv('APP_ENV')).toLowerCase() === 'staging') return upstream;
    const document = buildEventDocument(row as PublicEvent, `${url.origin}${url.pathname}`);
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
