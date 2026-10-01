const { Resvg } = require('@resvg/resvg-js');

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_POSTERS = 3;
const TILE_WIDTH = WIDTH / MAX_POSTERS;
const IMAGE_HEIGHT = 500;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function shortenName(value, max = 42) {
  const name = String(value || 'YoVibe event').replace(/\s+/g, ' ').trim();
  return name.length > max ? `${name.slice(0, max - 1).trim()}…` : name;
}

function nameLines(value) {
  const words = shortenName(value, 42).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > 22 && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function parseEventPreviews(value) {
  if (Array.isArray(value)) return value.slice(0, MAX_POSTERS);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_POSTERS) : [];
  } catch {
    return [];
  }
}

function isSafePublicImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (
      host === 'localhost' || host === '::1' || host === '0.0.0.0'
      || host.startsWith('10.') || host.startsWith('192.168.')
      || host.startsWith('169.254.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) return false;
    for (const key of url.searchParams.keys()) {
      const normalized = key.toLowerCase();
      if (normalized.includes('signature') || normalized.includes('token')
        || normalized.includes('credential') || normalized.includes('expires')) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function sniffMime(bytes, contentType) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  return String(contentType || 'image/jpeg').split(';')[0];
}

async function fetchPosterData(url) {
  if (!isSafePublicImageUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 6 * 1024 * 1024) return null;
    return `data:${sniffMime(bytes, response.headers.get('content-type'))};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

function buildNotificationCollageSvg(previews, posterData) {
  const tiles = previews.slice(0, MAX_POSTERS).map((preview, index) => {
    const x = index * TILE_WIDTH;
    const image = posterData[index];
    const name = nameLines(preview.name).map((line, lineIndex) => `<tspan x="${x + 24}" dy="${lineIndex === 0 ? 0 : 36}">${escapeXml(line)}</tspan>`).join('');
    const imageMarkup = image
      ? `<image href="${image}" x="${x}" y="0" width="${TILE_WIDTH}" height="${IMAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect x="${x}" y="0" width="${TILE_WIDTH}" height="${IMAGE_HEIGHT}" fill="#19213a"/><text x="${x + TILE_WIDTH / 2}" y="250" text-anchor="middle" font-family="DejaVu Sans" font-size="44" fill="#9ca3af">YoVibe</text>`;
    return `${imageMarkup}<rect x="${x}" y="${IMAGE_HEIGHT - 112}" width="${TILE_WIDTH}" height="112" fill="#000000" fill-opacity=".68"/><text x="${x + 24}" y="${IMAGE_HEIGHT - 76}" font-family="DejaVu Sans" font-size="28" font-weight="700" fill="#ffffff">${name}</text>`;
  }).join('');
  const empty = previews.length === 0
    ? '<rect width="1200" height="630" fill="#111827"/><text x="600" y="315" text-anchor="middle" font-family="DejaVu Sans" font-size="54" font-weight="700" fill="#ffffff">YoVibe events</text>'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#080b14"/>${empty}${tiles}<rect x="0" y="${IMAGE_HEIGHT}" width="${WIDTH}" height="${HEIGHT - IMAGE_HEIGHT}" fill="#080b14" fill-opacity=".35"/></svg>`;
}

async function renderNotificationCollage(previews) {
  const limited = parseEventPreviews(previews);
  const posterData = await Promise.all(limited.map((preview) => fetchPosterData(preview.posterUrl)));
  const svg = buildNotificationCollageSvg(limited, posterData);
  return Buffer.from(new Resvg(svg, {
    fitTo: { mode: 'original' },
    textRendering: 2,
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
      sansSerifFamily: 'DejaVu Sans',
    },
  }).render().asPng());
}

module.exports = {
  MAX_POSTERS,
  buildNotificationCollageSvg,
  parseEventPreviews,
  renderNotificationCollage,
};
