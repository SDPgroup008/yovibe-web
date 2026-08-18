// netlify/functions/geocode-venues.js
//
// Geocodes venues that are missing usable coordinates and saves the result
// back to Supabase (venues.latitude / venues.longitude) using the
// SERVICE_ROLE key (bypasses RLS — server-side only).
//
// Geocoder: Nominatim (OpenStreetMap) — free, no API key. Limited to
// ~1 request/second, so this function throttles to 1.15s between calls.
//
// Invocation (admin-triggered):
//   GET  /.netlify/functions/geocode-venues?limit=5            → sync batch
//   GET  /.netlify/functions/geocode-venues?dryRun=1           → report only
//   GET  /.netlify/functions/geocode-venues?token=<secret>     → if GEOCODE_ADMIN_SECRET is set
//
// For large backfills use Netlify BACKGROUND mode (up to ~15 min runtime),
// e.g. from an external scheduler / curl with the header:
//   x-nf-async: true
//   GET /.netlify/functions/geocode-venues?limit=500
//
// Env vars (set in Netlify dashboard):
//   SUPABASE_SERVICE_ROLE_KEY  (required — secret, never in the frontend)
//   SUPABASE_URL               (optional; falls back to the YoVibe URL)
//   GEOCODE_ADMIN_SECRET       (optional; requires ?token= or x-admin-token header)
//
// Optional query params:
//   dryRun=1   — report what would be geocoded, do NOT write anything
//   limit=N    — cap how many venues this invocation processes

const { createClient } = require("@supabase/supabase-js");

const FALLBACK_SUPABASE_URL = "https://uqukizjohackrcwrtefk.supabase.co";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "YoVibeVenueGeocoder/1.0 (https://yovibe.net)";
const THROTTLE_MS = 1150; // Nominatim allows ~1 request/second
const DEFAULT_SYNC_LIMIT = 4; // keeps a synchronous run inside the ~10s timeout
const MAX_SYNC_LIMIT = 8;
const BACKGROUND_LIMIT = 500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isMissingCoords = (v) =>
  !v.latitude || !v.longitude || Number(v.latitude) === 0 || Number(v.longitude) === 0;

const toCoord = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Try a few query variants: "name, location" → "location" → "location, Uganda".
async function geocodeVenue(venue) {
  const queries = [
    [venue.name, venue.location].filter(Boolean).join(", "),
    venue.location,
    venue.location ? `${venue.location}, Uganda` : "",
  ].filter(Boolean);

  for (const q of queries) {
    const params = new URLSearchParams({ format: "jsonv2", q, limit: "1" });
    let response;
    try {
      response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
        headers: { "User-Agent": USER_AGENT, Referer: "https://yovibe.net/" },
      });
    } catch {
      continue; // network error — try the next query variant
    }
    if (response.status === 429) {
      await delay(THROTTLE_MS); // rate limited — back off, try next variant
      continue;
    }
    if (!response.ok) continue;
    const results = await response.json();
    if (Array.isArray(results) && results.length > 0) {
      const lat = toCoord(results[0].lat);
      const lon = toCoord(results[0].lon);
      if (lat !== null && lon !== null) return { lat, lon };
    }
  }
  return null;
}

function adminTokenOk(event) {
  const secret = process.env.GEOCODE_ADMIN_SECRET;
  if (!secret) return true;
  const query = new URLSearchParams((event.rawUrl || event.url || "").split("?")[1] || "");
  const fromQuery = query.get("token");
  const fromHeader = (event.headers && event.headers["x-admin-token"]) || "";
  return fromQuery === secret || fromHeader === secret;
}

exports.handler = async (event) => {
  if (!adminTokenOk(event)) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  const query = new URLSearchParams((event.rawUrl || event.url || "").split("?")[1] || "");
  const dryRun = query.get("dryRun") === "1";
  const isBackground =
    event.headers && (event.headers["x-nf-async"] === "true" || event.headers["x-nf-async"] === "1");

  const requestedLimit = Number(query.get("limit"));
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, isBackground ? BACKGROUND_LIMIT : MAX_SYNC_LIMIT)
    : (isBackground ? BACKGROUND_LIMIT : DEFAULT_SYNC_LIMIT);

  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const admin = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: venues, error } = await admin
      .from("venues")
      .select("slug,name,location,latitude,longitude")
      .eq("is_deleted", false)
      .order("name", { ascending: true });

    if (error) throw error;

    const missing = (venues || []).filter(isMissingCoords);
    const toGeocode = missing.slice(0, limit);

    const stats = {
      scanned: (venues || []).length,
      missing: missing.length,
      attempted: 0,
      geocoded: 0,
      failed: [],
    };

    for (const venue of toGeocode) {
      stats.attempted++;
      const result = await geocodeVenue(venue);
      await delay(THROTTLE_MS);

      if (!result) {
        stats.failed.push(venue.slug);
        continue;
      }

      stats.geocoded++;
      if (!dryRun) {
        const { error: updateError } = await admin
          .from("venues")
          .update({ latitude: result.lat, longitude: result.lon })
          .eq("slug", venue.slug);
        if (updateError) {
          stats.geocoded--;
          stats.failed.push(`${venue.slug} (save: ${updateError.message})`);
        }
      }
    }

    const remaining = Math.max(0, stats.missing - stats.attempted);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        dryRun,
        mode: isBackground ? "background" : "sync",
        limit,
        ...stats,
        remaining,
        tip:
          remaining > 0
            ? `Call again (or use background mode: header 'x-nf-async: true') to geocode the remaining ${remaining} venues.`
            : "All venues currently missing coordinates were processed.",
      }),
    };
  } catch (error) {
    console.error("[geocode-venues] Failed:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Unknown error" }),
    };
  }
};
