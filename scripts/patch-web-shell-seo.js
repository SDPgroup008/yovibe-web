const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "dist", "index.html");
const messagingWorkerPath = path.join(__dirname, "..", "dist", "firebase-messaging-sw.js");

const title = "YoVibe | Buy Tickets, Discover Events & Venues in Uganda";
const description =
  "Buy event tickets in Uganda on YoVibe. Discover events, concerts, parties, and venues in Kampala, Entebbe, Jinja and many other parts of Uganda.";
const keywords =
  "yovibe, yo vibe, vibe, uganda events, kampala nightlife, entebbe venues, mukono events, jinja events, ugandan artists, concerts, parties";
const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.EXPO_PUBLIC_SITE_URL || '').replace(/\/$/, '');
if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL is required to patch the web shell');
const canonicalUrl = `${siteUrl}/`;
const ogImage = `${siteUrl}/assets/og-image.png`;
const robots = String(process.env.APP_ENV || '').toLowerCase() === 'staging'
  ? 'noindex, nofollow, noarchive'
  : 'index, follow';

if (!fs.existsSync(indexPath)) {
  throw new Error(`Cannot patch SEO shell; file not found: ${indexPath}`);
}

const headInjection = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${keywords}" />
    <meta name="robots" content="${robots}" />
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
        <p style="margin:0;">Visit <a href="${siteUrl}/events">Events</a> or <a href="${siteUrl}/venues">Venues</a>.</p>
      </div>
    </noscript>`;

let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(/<title>[\s\S]*?<\/title>/i, headInjection.trim());
html = html.replace(/<noscript>[\s\S]*?<\/noscript>/i, noScriptReplacement.trim());

fs.writeFileSync(indexPath, html, "utf8");

if (fs.existsSync(messagingWorkerPath)) {
  const notificationsEnabled = String(process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED || 'true').toLowerCase() === 'true';
  let worker = fs.readFileSync(messagingWorkerPath, 'utf8');

  if (!notificationsEnabled) {
    worker = worker.replace(
      /\/\/ Firebase Cloud Messaging support for background notifications\.[\s\S]*?(?=self\.addEventListener\("notificationclick")/,
      '// Push notifications are disabled for this deployment.\n\n'
    );
    fs.writeFileSync(messagingWorkerPath, worker, 'utf8');
  } else {
    const firebaseVariables = {
      __FIREBASE_API_KEY__: 'NEXT_PUBLIC_FIREBASE_API_KEY',
      __FIREBASE_AUTH_DOMAIN__: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
      __FIREBASE_PROJECT_ID__: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      __FIREBASE_STORAGE_BUCKET__: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
      __FIREBASE_MESSAGING_SENDER_ID__: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      __FIREBASE_APP_ID__: 'NEXT_PUBLIC_FIREBASE_APP_ID',
      __FIREBASE_MEASUREMENT_ID__: 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
    };
    for (const [placeholder, envName] of Object.entries(firebaseVariables)) {
      const value = process.env[envName];
      if (!value) throw new Error(`${envName} is required to configure the messaging worker`);
      worker = worker.replaceAll(placeholder, value);
    }
    fs.writeFileSync(messagingWorkerPath, worker, 'utf8');
  }
}
/* console.log("[patch-web-shell-seo] Patched dist/index.html with crawlable metadata and fallback copy."); */
