const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "dist", "index.html");

const title = "YoVibe | Best Nightlife Events, Parties & Venues in Uganda";
const description =
  "YoVibe helps you discover nightlife events, concerts, parties, artists, and venues across Uganda, including Kampala, Entebbe, Mukono, and Jinja.";
const keywords =
  "yovibe, yo vibe, uganda events, kampala nightlife, entebbe venues, mukono events, jinja events, ugandan artists, concerts, parties";
const canonicalUrl = "https://yovibe.net/";
const ogImage = "https://yovibe.net/assets/og-image.png";

if (!fs.existsSync(indexPath)) {
  throw new Error(`Cannot patch SEO shell; file not found: ${indexPath}`);
}

const headInjection = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${keywords}" />
    <meta name="robots" content="index, follow" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:site_name" content="YoVibe" />
    <meta property="og:locale" content="en_UG" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="canonical" href="${canonicalUrl}" />`;

const noScriptReplacement = `
    <noscript>
      <div style="padding:24px;font-family:Arial,sans-serif;line-height:1.5;color:#111;background:#fff;max-width:720px;margin:0 auto;">
        <h1 style="font-size:28px;margin-bottom:12px;">YoVibe</h1>
        <p style="margin:0 0 12px;">Discover nightlife events, concerts, parties, artists, and venues across Uganda.</p>
        <p style="margin:0 0 12px;">Browse upcoming events in Kampala, Entebbe, Mukono, and Jinja, or explore popular venues and live entertainment.</p>
        <p style="margin:0;">Visit <a href="https://yovibe.net/events">Events</a> or <a href="https://yovibe.net/venues">Venues</a>.</p>
      </div>
    </noscript>`;

let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(/<title>[\s\S]*?<\/title>/i, headInjection.trim());
html = html.replace(/<noscript>[\s\S]*?<\/noscript>/i, noScriptReplacement.trim());

fs.writeFileSync(indexPath, html, "utf8");
console.log("[patch-web-shell-seo] Patched dist/index.html with crawlable metadata and fallback copy.");
