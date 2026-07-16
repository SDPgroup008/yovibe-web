const { computeTicketLayout } = require('./ticketLayoutEngine');
const { Resvg } = require('@resvg/resvg-js');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const url = (v) => esc(v).replace(/#/g, '%23');

const COLORS = {
  'midnight-portrait': ['#0f0c29', '#7c3aed', '#fff', '#a78bfa', '#1e1b4b'],
  'neon-night-portrait': ['#0a0a0a', '#ff0080', '#fff', '#f9a8d4', '#1a0533'],
  'golden-vip-portrait': ['#1a1200', '#ffd700', '#fff8dc', '#fde68a', '#2d1f00'],
  'ocean-portrait': ['#001f3f', '#00b4d9', '#fff', '#a5f3fc', '#003366'],
  'ember-portrait': ['#1a0500', '#ff4500', '#fff5f0', '#fed7aa', '#3d0c00'],
  'midnight-landscape': ['#0f0c29', '#7c3aed', '#fff', '#a78bfa', '#1e1b4b'],
  'neon-night-landscape': ['#0a0a0a', '#ff0080', '#fff', '#f9a8d4', '#1a0533'],
  'golden-vip-landscape': ['#1a1200', '#ffd700', '#fff8dc', '#fde68a', '#2d1f00'],
  'ocean-landscape': ['#001f3f', '#00b4d9', '#fff', '#a5f3fc', '#003366'],
  'ember-landscape': ['#1a0500', '#ff4500', '#fff5f0', '#fed7aa', '#3d0c00'],
};

function renderCanonicalTicketSvg({ eventName, ticketType, venue, date, time, buyerName, ticketRef, qrCodeDataUrl, posterUrl, ticketDesign }) {
  const design = ticketDesign || { orientation: 'portrait', source: 'template', template_id: 'midnight-portrait' };
  const layout = computeTicketLayout(design, { hasPoster: !!posterUrl });
  const [background, accent, text, secondary, qrBg] = COLORS[design.template_id] || COLORS['midnight-portrait'];
  const W = layout.pageWidth, H = layout.pageHeight;
  const b = (id, fallback) => layout.blocks.find(x => x.id === id) || fallback;
  const poster = b('poster', { x: 330, y: 20, width: 200, height: 200, scale: 1 });
  const title = b('title', { x: 24, y: 24, width: 280, height: 80, scale: 1 });
  const info = b('info', { x: 24, y: 430, width: 260, height: 180, scale: 1 });
  const qr = { ...b('qr', { x: 190, y: 250, width: 160, height: 200, scale: 1 }) };
  if (!design.layout && design.source === 'template' && design.qr_position) {
    if (design.qr_position === 'top') { qr.x = Math.round((W - qr.width) / 2); qr.y = 110; }
    if (design.qr_position === 'center') { qr.x = Math.round((W - qr.width) / 2); qr.y = Math.round((H - qr.height) / 2); }
    if (design.qr_position === 'bottom') { qr.x = Math.round((W - qr.width) / 2); qr.y = H - qr.height - 50; }
    if (design.qr_position === 'left') { qr.x = 24; qr.y = Math.round((H - qr.height) / 2); }
    if (design.qr_position === 'right') { qr.x = W - qr.width - 24; qr.y = Math.round((H - qr.height) / 2); }
  }
  const escText = (x, y, value, size, fill, weight = 500, anchor = 'start') => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${esc(fill)}" text-anchor="${anchor}">${esc(value)}</text>`;
  const g = (block) => ` transform="translate(${block.x} ${block.y}) scale(${block.scale || 1})"`;
  const qrSize = Math.max(64, Math.min(qr.width - 24, qr.height - 36));
  const rows = [['DATE', date], ['TIME', time], ['VENUE', venue || 'Venue TBA'], ['ATTENDEE', buyerName || 'Guest']];
  const rowHeight = Math.max(22, (info.height - 24) / rows.length);
  const bg = design.source === 'upload' && design.background_url
    ? `<image href="${url(design.background_url)}" x="${layout.bgTransform.x || 0}" y="${layout.bgTransform.y || 0}" width="${W * (layout.bgTransform.scale || 1)}" height="${H * (layout.bgTransform.scale || 1)}" preserveAspectRatio="xMidYMid slice"/>`
    : `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${esc(background)}"/><stop offset="100%" stop-color="${esc(accent)}" stop-opacity=".72"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  const posterSvg = posterUrl ? `<image href="${url(posterUrl)}" x="0" y="0" width="${poster.width}" height="${poster.height}" preserveAspectRatio="xMidYMid slice"/>` : '';
  const qrSvg = qrCodeDataUrl ? `<image href="${url(qrCodeDataUrl)}" x="${(qr.width - qrSize) / 2}" y="10" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet"/>` : escText(qr.width / 2, qr.height / 2, 'QR unavailable', 14, secondary, 600, 'middle');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}${design.source === 'upload' ? `<rect width="${W}" height="${H}" fill="#000" opacity=".16"/>` : ''}<g${g(poster)}>${posterSvg}</g><g${g(title)}><rect width="${title.width}" height="${title.height}" rx="10" fill="#000" opacity=".46"/><text x="16" y="34" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(16, Math.min(30, title.height / 3))}px" font-weight="800" fill="${esc(text)}">${esc(eventName)}</text><rect x="16" y="${title.height - 32}" width="${Math.min(title.width - 32, Math.max(90, String(ticketType || 'Standard').length * 8 + 28))}" height="20" rx="10" fill="${esc(accent)}"/><text x="${Math.min(title.width - 32, Math.max(90, String(ticketType || 'Standard').length * 8 + 28)) / 2 + 16}" y="${title.height - 18}" font-size="10px" font-weight="700" fill="#fff" text-anchor="middle">${esc(String(ticketType || 'Standard').toUpperCase())}</text></g><g${g(info)}><rect width="${info.width}" height="${info.height}" rx="10" fill="#000" opacity=".48" stroke="${esc(secondary)}"/>${rows.map((r, i) => `${escText(16, 22 + i * rowHeight, r[0], 9, secondary, 700)}${escText(16, 36 + i * rowHeight, r[1], 12, text, 600)}`).join('')}</g><g${g(qr)}><rect width="${qr.width}" height="${qr.height}" rx="12" fill="${esc(qrBg)}" stroke="${esc(accent)}" stroke-width="2"/>${qrSvg}${escText(qr.width / 2, qr.height - 20, ticketRef, 10, accent, 700, 'middle')}</g><rect y="${H - 34}" width="${W}" height="34" fill="#000" opacity=".55"/><text x="18" y="${H - 13}" font-size="10px" font-weight="700" fill="${esc(accent)}">YOVIBE</text><text x="${W - 18}" y="${H - 13}" font-family="Courier New, monospace" font-size="10px" fill="${esc(secondary)}" text-anchor="end">${esc(ticketRef)}</text></svg>`;
}

async function loadAssetAsDataUri(value) {
  if (!value || value.startsWith('data:')) return value;
  if (!/^https?:\/\//i.test(value)) return value;
  const response = await fetch(value);
  if (!response.ok) throw new Error(`Failed to load ticket image: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = response.headers.get('content-type') || (value.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function renderCanonicalTicketPng(data) {
  let svg = renderCanonicalTicketSvg(data);
  const assets = [data.qrCodeDataUrl, data.posterUrl, data.ticketDesign?.background_url].filter(Boolean);
  for (const asset of assets) {
    try {
      const embedded = await loadAssetAsDataUri(asset);
      svg = svg.split(`href="${esc(asset)}"`).join(`href="${embedded}"`);
    } catch (error) {
      console.warn('Ticket artwork image could not be embedded:', error.message);
    }
  }
  return new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
}

module.exports = { renderCanonicalTicketSvg, renderCanonicalTicketPng };
