const SOCIAL_CRAWLER = /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|skypeuripreview|pinterestbot|googlebot/i;
const DESCRIPTION_LIMIT = 160;

type PublicEvent = {
  name?: unknown;
  description?: unknown;
  poster_image_url?: unknown;
};

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function socialDescription(description: unknown, eventName: string): string {
  const normalized = String(description || '').replace(/\s+/g, ' ').trim();
  const value = normalized || `Discover ${eventName} on YoVibe.`;
  return value.length > DESCRIPTION_LIMIT ? `${value.slice(0, DESCRIPTION_LIMIT - 3).trimEnd()}...` : value;
}

function publicImageUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const image = new URL(value);
    return image.protocol === 'https:' ? image.toString() : fallback;
  } catch {
    return fallback;
  }
}

function eventSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/events\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function fetchPublicEvent(slug: string): Promise<PublicEvent | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
    Deno.env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !publishableKey) return null;

  const endpoint = new URL('/rest/v1/events', supabaseUrl);
  endpoint.searchParams.set('select', 'slug,name,description,poster_image_url');
  endpoint.searchParams.set('slug', `eq.${slug}`);
  endpoint.searchParams.set('is_deleted', 'eq.false');
  endpoint.searchParams.set('limit', '1');
  const response = await fetch(endpoint, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] as PublicEvent : null;
}

function previewHtml({ canonicalUrl, title, description, imageUrl }: {
  canonicalUrl: string;
  title: string;
  description: string;
  imageUrl: string;
}): string {
  const escapedTitle = htmlEscape(title);
  const escapedDescription = htmlEscape(description);
  const escapedCanonical = htmlEscape(canonicalUrl);
  const escapedImage = htmlEscape(imageUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title><link rel="canonical" href="${escapedCanonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="YoVibe"><meta property="og:locale" content="en_UG">
<meta property="og:url" content="${escapedCanonical}"><meta property="og:title" content="${escapedTitle}"><meta property="og:description" content="${escapedDescription}">
<meta property="og:image" content="${escapedImage}"><meta property="og:image:secure_url" content="${escapedImage}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:url" content="${escapedCanonical}"><meta name="twitter:title" content="${escapedTitle}">
<meta name="twitter:description" content="${escapedDescription}"><meta name="twitter:image" content="${escapedImage}">
</head><body><a href="${escapedCanonical}">${escapedTitle}</a></body></html>`;
}

export default async (request: Request, context: any) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next();
  if (!SOCIAL_CRAWLER.test(request.headers.get('user-agent') || '')) return context.next();

  const requestUrl = new URL(request.url);
  const slug = eventSlugFromPath(requestUrl.pathname);
  if (!slug) return context.next();

  try {
    const event = await fetchPublicEvent(slug);
    if (!event || typeof event.name !== 'string' || !event.name.trim()) return context.next();

    const canonicalUrl = new URL(requestUrl.pathname, requestUrl.origin).toString();
    const title = `${event.name.trim()} | YoVibe`;
    const description = socialDescription(event.description, event.name.trim());
    const imageUrl = publicImageUrl(event.poster_image_url, new URL('/assets/icon.png', requestUrl.origin).toString());
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300',
      'Vary': 'User-Agent',
      'X-Content-Type-Options': 'nosniff',
    };
    return request.method === 'HEAD'
      ? new Response(null, { status: 200, headers })
      : new Response(previewHtml({ canonicalUrl, title, description, imageUrl }), { status: 200, headers });
  } catch {
    return context.next();
  }
};
