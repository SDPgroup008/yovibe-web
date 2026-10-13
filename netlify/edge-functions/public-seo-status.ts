type EdgeRuntimeGlobals = typeof globalThis & {
  Netlify?: { env?: { get(name: string): string | undefined } };
  Deno?: { env?: { get(name: string): string | undefined } };
};

type PublicEntity = 'events' | 'venues';
type PublicEntityPath = { entity: PublicEntity; slug: string } | null;
type PublicEvent = { slug?: string; date?: string; event_status?: string };

const RESERVED_EVENT_SLUGS = new Set(['add', 'ticket-contacts', 'payment-callback']);
const RESERVED_VENUE_SLUGS = new Set(['add-event', 'ticket-contacts']);

function getEdgeEnv(name: string): string | undefined {
  const runtime = globalThis as EdgeRuntimeGlobals;
  try {
    const value = runtime.Netlify?.env?.get(name);
    if (value) return value;
  } catch {
    // Use the Deno fallback in local or older Edge runtimes.
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
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

function brandedErrorPage(status: 404 | 410, pathname: string): Response {
  const title = status === 410 ? 'Event retired' : 'Page not found';
  const message = status === 410
    ? 'This event has ended and is no longer available on YoVibe.'
    : 'The YoVibe page you requested could not be found.';
  const safePath = pathname.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | YoVibe</title></head><body><main><h1>${title}</h1><p>${message}</p><p><a href="/">Return to YoVibe</a></p><small>${safePath}</small></main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

async function fetchPublicEntity(entity: PublicEntity, slug: string): Promise<PublicEvent | Record<string, unknown> | null | undefined> {
  const supabaseUrl = getEdgeEnv('SUPABASE_URL') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const apiKey = getEdgeEnv('SUPABASE_PUBLISHABLE_KEY') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || getEdgeEnv('SUPABASE_ANON_KEY') || getEdgeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !apiKey) return undefined;

  const endpoint = new URL(`/rest/v1/${entity}`, supabaseUrl);
  endpoint.searchParams.set('select', entity === 'events' ? 'slug,date,event_status' : 'slug');
  endpoint.searchParams.set('slug', `eq.${slug}`);
  endpoint.searchParams.set('is_deleted', 'eq.false');
  endpoint.searchParams.set('limit', '1');
  const response = await fetch(endpoint, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
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
    return status === 200 ? context.next() : brandedErrorPage(status, url.pathname);
  } catch (error) {
    console.error('[public-seo-status] Public entity lookup failed; passing through to avoid false errors', error);
    return context.next();
  }
};
