const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const CARDS = {
  home: {
    eyebrow: 'UGANDA EVENT DISCOVERY',
    title: 'Find your next vibe.',
    subtitle: 'Discover venues, upcoming events, and tickets on YoVibe.',
  },
  events: {
    eyebrow: 'YO VIBE EVENTS',
    title: 'The right event is waiting.',
    subtitle: 'Browse concerts, parties, nightlife, and more across Uganda.',
  },
  venues: {
    eyebrow: 'YO VIBE VENUES',
    title: 'Discover where the vibe lives.',
    subtitle: 'Explore venues, clubs, bars, and places worth showing up for.',
  },
  calendar: {
    eyebrow: 'YO VIBE CALENDAR',
    title: 'Plan the moments that matter.',
    subtitle: 'See upcoming events and make your next plan with confidence.',
  },
  map: {
    eyebrow: 'YO VIBE MAP',
    title: 'See what is happening nearby.',
    subtitle: 'Find events and venues across Uganda in one place.',
  },
  about: {
    eyebrow: 'ABOUT YO VIBE',
    title: 'Your No.1 ticketing platform.',
    subtitle: 'Buy tickets, sell tickets, and discover the vibe around you.',
  },
  tickets: {
    eyebrow: 'YO VIBE TICKETS',
    title: 'Your next moment starts here.',
    subtitle: 'Choose your ticket and join the experience.',
  },
};

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(value, maxChars) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function textLines(lines, x, y, size, lineHeight, color, weight) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`).join('');
}

function renderCard(card) {
  // Load the native renderer lazily. This keeps HEAD requests healthy and
  // lets the handler provide a static fallback if a platform runtime cannot
  // load its optional native binary.
  const { Resvg } = require('@resvg/resvg-js');
  const titleLines = wrapLines(card.title, 28);
  const subtitleLines = wrapLines(card.subtitle, 56);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#060B17"/><stop offset="1" stop-color="#151F37"/></linearGradient>
      <radialGradient id="blueGlow" cx="0.86" cy="0.14" r="0.72"><stop stop-color="#099BE8" stop-opacity="0.42"/><stop offset="1" stop-color="#099BE8" stop-opacity="0"/></radialGradient>
      <radialGradient id="redGlow" cx="0.05" cy="0.96" r="0.72"><stop stop-color="#FF3F4D" stop-opacity="0.35"/><stop offset="1" stop-color="#FF3F4D" stop-opacity="0"/></radialGradient>
      <linearGradient id="wordmark" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#FF3A47"/><stop offset="0.5" stop-color="#FF4651"/><stop offset="0.52" stop-color="#16A7F1"/><stop offset="1" stop-color="#0497E3"/></linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#background)"/>
    <rect width="1200" height="630" fill="url(#blueGlow)"/>
    <rect width="1200" height="630" fill="url(#redGlow)"/>
    <path d="M0 106H1200M0 224H1200M0 342H1200M0 460H1200M160 0V630M400 0V630M640 0V630M880 0V630M1120 0V630" stroke="#ffffff" stroke-opacity="0.055" stroke-width="1"/>
    <circle cx="1032" cy="118" r="190" fill="none" stroke="#26B7FA" stroke-opacity="0.25" stroke-width="32"/>
    <circle cx="1138" cy="525" r="96" fill="none" stroke="#FF4552" stroke-opacity="0.24" stroke-width="24"/>
    <rect x="76" y="72" width="110" height="12" rx="6" fill="#FF3E4C"/>
    <text x="76" y="142" fill="url(#wordmark)" font-family="Arial, sans-serif" font-size="68" font-weight="800">YoVibe</text>
    <text x="78" y="195" fill="#83D8FF" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="4">${escapeXml(card.eyebrow)}</text>
    ${textLines(titleLines, 76, 338, 72, 84, '#FFFFFF', 800)}
    ${textLines(subtitleLines, 80, 510, 29, 40, '#C8D8ED', 400)}
    <text x="80" y="587" fill="#72E6B2" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="2">HIGH VIBES ONLY</text>
  </svg>`;
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  });
  return renderer.render().asPng();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return { statusCode: 405, headers: { Allow: 'GET, HEAD' }, body: '' };
  }
  const kind = String(event.queryStringParameters?.kind || '');
  const card = CARDS[kind];
  if (!card) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Unknown social card' }) };
  }

  const headers = {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    'Content-Disposition': `inline; filename="yovibe-${kind}-social-card.png"`,
    'X-Content-Type-Options': 'nosniff',
  };
  if (event.httpMethod === 'HEAD') return { statusCode: 200, headers, body: '' };
  try {
    const image = renderCard(card);
    return { statusCode: 200, headers, isBase64Encoded: true, body: image.toString('base64') };
  } catch (error) {
    console.error('[social-card] failed:', error);
    // A static wide card is published by the web build and remains a valid
    // Open Graph image even when the optional native renderer is unavailable.
    return {
      statusCode: 302,
      headers: {
        Location: 'https://yovibe.net/assets/og-image.png',
        'Cache-Control': 'public, max-age=0, s-maxage=86400',
      },
      body: '',
    };
  }
};

exports.__test__ = { CARDS, renderCard };
