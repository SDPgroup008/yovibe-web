const DEFAULT_SITE_URL = "https://yovibe.net";
const FALLBACK_SUPABASE_URL = "https://uqukizjohackrcwrtefk.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "sb_publishable_P69Y2IRwywqDIjo6hXhwjw_EwbJ-qB_";
const PAGE_SIZE = 1000;
const SITEMAP_FUNCTION_VERSION = "2026-05-30-2";

const POPULAR_LOCATION_SLUGS = ["kampala", "entebbe", "entebe", "mukono", "jinja", "wakiso", "mbarara", "gulu"];
const POPULAR_ARTIST_SLUGS = [
  "king-saha",
  "jose-chameleone",
  "chameleon",
  "karole-kasita",
  "carol-kasita",
  "bobi-wine",
  "bebe-cool",
  "eddy-kenzo",
  "fik-fameica",
  "sheebah-karungi",
  "spice-diana",
  "lydia-jazmine",
  "winnie-nwagi",
  "vinka",
  "rema-namakula",
  "azawi",
  "pallaso",
  "gravity-omutujju",
  "john-blaq",
  "navio",
  "ray-g",
  "levixone",
  "juliana-kanyomozi",
  "irene-ntale",
  "a-pass",
  "ykee-benda",
  "mun-g",
  "chosen-becky",
  "david-lutalo",
  "grace-nakimera",
];

const xmlEscape = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeLastMod = (...dates) => {
  for (const dateValue of dates) {
    if (!dateValue) continue;
    const date = new Date(dateValue);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
};

const toUrlNode = ({ loc, lastmod, changefreq, priority }) => `
  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
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
        Authorization: `Bearer ${supabaseAnonKey}`,
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
  const siteUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    FALLBACK_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    FALLBACK_SUPABASE_ANON_KEY;

  try {
    console.log(`[sitemap] Function version ${SITEMAP_FUNCTION_VERSION}`);

    const [venues, events] = await Promise.all([
      fetchSupabaseRows({
        supabaseUrl,
        supabaseAnonKey,
        table: "venues",
        select: "slug,created_at",
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

    const staticUrls = [
      { loc: `${siteUrl}/`, changefreq: "daily", priority: "1.0", lastmod: normalizeLastMod() },
      { loc: `${siteUrl}/events`, changefreq: "daily", priority: "0.95", lastmod: normalizeLastMod() },
      { loc: `${siteUrl}/venues`, changefreq: "daily", priority: "0.95", lastmod: normalizeLastMod() },
      { loc: `${siteUrl}/calendar`, changefreq: "daily", priority: "0.9", lastmod: normalizeLastMod() },
      { loc: `${siteUrl}/map`, changefreq: "weekly", priority: "0.85", lastmod: normalizeLastMod() },
      ...POPULAR_LOCATION_SLUGS.map((slug) => ({
        loc: `${siteUrl}/events/${slug}`,
        changefreq: "daily",
        priority: "0.78",
        lastmod: normalizeLastMod(),
      })),
      ...POPULAR_ARTIST_SLUGS.map((slug) => ({
        loc: `${siteUrl}/events/${slug}`,
        changefreq: "daily",
        priority: "0.78",
        lastmod: normalizeLastMod(),
      })),
      ...POPULAR_LOCATION_SLUGS.map((slug) => ({
        loc: `${siteUrl}/venues/${slug}`,
        changefreq: "daily",
        priority: "0.76",
        lastmod: normalizeLastMod(),
      })),
    ];

    const venueUrls = venues
      .filter((venue) => typeof venue.slug === "string" && venue.slug.trim().length > 0)
      .map((venue) => ({
        loc: `${siteUrl}/venues/${encodeURIComponent(venue.slug.trim())}`,
        changefreq: "daily",
        priority: "0.8",
        lastmod: normalizeLastMod(venue.created_at),
      }));

    const eventUrls = events
      .filter((event) => typeof event.slug === "string" && event.slug.trim().length > 0)
      .map((event) => ({
        loc: `${siteUrl}/events/${encodeURIComponent(event.slug.trim())}`,
        changefreq: "daily",
        priority: "0.8",
        lastmod: normalizeLastMod(event.created_at),
      }));

    const allUrls = [...staticUrls, ...venueUrls, ...eventUrls];
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
