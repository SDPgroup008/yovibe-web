const { requiredEnv, assertSupabaseUrl, getSiteUrl } = require('../shared/runtimeConfig');
const { buildSitemapUrls } = require('../shared/seoIndexing');
const PAGE_SIZE = 1000;
const SITEMAP_FUNCTION_VERSION = "2026-10-12-1";

const xmlEscape = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeLastMod = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const toUrlNode = ({ loc, lastmod, changefreq, priority }) => `
  <url>
    <loc>${xmlEscape(loc)}</loc>
    ${normalizeLastMod(lastmod) ? `<lastmod>${normalizeLastMod(lastmod)}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const fetchSupabaseRows = async ({ supabaseUrl, supabaseAnonKey, table, select, filters }) => {
  const rows = [];
  let offset = 0;

  while (true) {
    const query = new URLSearchParams({
      select,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      ...filters,
    });

    const endpoint = `${supabaseUrl}/rest/v1/${table}?${query.toString()}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase ${table} query failed (${response.status}): ${body}`);
    }

    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;

    offset += PAGE_SIZE;
  }

  return rows;
};

export async function handler() {
  const siteUrl = getSiteUrl();
  const supabaseUrl = assertSupabaseUrl(requiredEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'));
  const supabaseAnonKey = requiredEnv('SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');

  try {
    /* console.log(`[sitemap] Function version ${SITEMAP_FUNCTION_VERSION}`); */

    const [venues, events] = await Promise.all([
      fetchSupabaseRows({
        supabaseUrl,
        supabaseAnonKey,
        table: "venues",
        select: "slug,created_at,date,event_status",
        filters: {
          is_deleted: "eq.false",
          slug: "not.is.null",
        },
      }),
      fetchSupabaseRows({
        supabaseUrl,
        supabaseAnonKey,
        table: "events",
        select: "slug,created_at",
        filters: {
          is_deleted: "eq.false",
          slug: "not.is.null",
        },
      }),
    ]);

    const allUrls = buildSitemapUrls({ siteUrl, venues, events });
    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${allUrls
      .map(toUrlNode)
      .join("")}
</urlset>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Sitemap-Version": SITEMAP_FUNCTION_VERSION,
      },
      body: xmlBody,
    };
  } catch (error) {
    console.error("[sitemap] Failed to generate sitemap:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: `Failed to generate sitemap: ${error?.message || "Unknown error"}`,
    };
  }
}
