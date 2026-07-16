const { computeTicketLayout } = require('../functions/ticketLayoutEngine');
const { Resvg } = require('@resvg/resvg-js');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (v) => esc(v).replace(/#/g, '%23');
const TEMPLATE_COLORS = {
  midnight: ['#111827', '#7c3aed', '#ffffff', '#a78bfa', '#1e1b4b', 'rgba(167,139,250,0.25)'],
  neon: ['#111827', '#ff0080', '#ffffff', '#f0abfc', '#1a0533', 'rgba(255,0,128,0.3)'],
  golden: ['#111827', '#ffd700', '#fff8dc', '#d4af37', '#2d1f00', 'rgba(212,175,55,0.35)'],
  ocean: ['#111827', '#00b4d8', '#ffffff', '#90e0ef', '#003366', 'rgba(0,180,216,0.3)'],
  ember: ['#111827', '#ff4500', '#fff5f0', '#ffb347', '#3d0c00', 'rgba(255,69,0,0.3)'],
  minimal: ['#f8f8f8', '#111111', '#111111', '#555555', '#ffffff', '#e0e0e0'],
};

function colorsFor(design) {
  const id = String(design.template_id || 'midnight');
  const key = id.includes('neon') ? 'neon' : id.includes('golden') ? 'golden' : id.includes('ocean') ? 'ocean' : id.includes('ember') ? 'ember' : id.includes('minimal') ? 'minimal' : 'midnight';
  const [background, accent, text, secondary, qr, border] = TEMPLATE_COLORS[key];
  return { background, accent, text, secondary, qr, border };
}

function renderSvg(data) {
  const design = data.ticketDesign || { source: 'template', template_id: 'midnight-portrait', orientation: 'portrait', dimensions: { width: 600, height: 900 } };
  const layout = computeTicketLayout(design, { hasPoster: !!data.posterUrl });
  const colors = colorsFor(design);
  const { background: base, accent, text: primary, secondary, qr: qrBg, border } = colors;
  const W = layout.pageWidth, H = layout.pageHeight;
  const get = (id, fallback) => layout.blocks.find((b) => b.id === id) || fallback;
  const poster = get('poster', { x: 330, y: 20, width: 200, height: 200, scale: 1 });
  const title = get('title', { x: 24, y: 24, width: 280, height: 80, scale: 1 });
  const info = get('info', { x: 24, y: 430, width: 260, height: 180, scale: 1 });
  const qrBase = get('qr', { x: 190, y: 250, width: 160, height: 200, scale: 1 });
  const qr = { ...qrBase };
  if (!design.layout && design.source === 'template' && design.qr_position) {
    if (design.qr_position === 'top') { qr.x = Math.round((W - qr.width) / 2); qr.y = 110; }
    if (design.qr_position === 'center') { qr.x = Math.round((W - qr.width) / 2); qr.y = Math.round((H - qr.height) / 2); }
    if (design.qr_position === 'bottom') { qr.x = Math.round((W - qr.width) / 2); qr.y = H - qr.height - 50; }
    if (design.qr_position === 'left') { qr.x = 24; qr.y = Math.round((H - qr.height) / 2); }
    if (design.qr_position === 'right') { qr.x = W - qr.width - 24; qr.y = Math.round((H - qr.height) / 2); }
  }
  const g = (b) => ` transform="translate(${b.x} ${b.y}) scale(${b.scale || 1})"`;
  const text = (x, y, v, size, color, weight = 500, anchor = 'start') => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(v)}</text>`;
  const qrSize = Math.max(64, Math.min(qr.width - 24, qr.height - 36));
  const rows = [['DATE', data.date], ['TIME', data.time], ['VENUE', data.venue || 'Venue TBA'], ['ATTENDEE', data.buyerName || 'Guest']];
  const rowH = Math.max(22, (info.height - 24) / rows.length);
  const bg = design.source === 'upload' && design.background_url ? `<image href="${href(design.background_url)}" x="${layout.bgTransform.x || 0}" y="${layout.bgTransform.y || 0}" width="${W * (layout.bgTransform.scale || 1)}" height="${H * (layout.bgTransform.scale || 1)}" preserveAspectRatio="xMidYMid slice" opacity=".96"/>` : `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${base}"/><stop offset="100%" stop-color="${accent}" stop-opacity=".72"/></linearGradient><clipPath id="posterClip"><rect width="${poster.width}" height="${poster.height}" rx="10"/></clipPath></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  const posterImage = data.posterUrl ? `<rect width="${poster.width}" height="${poster.height}" rx="10" fill="#000" opacity=".35"/><image href="${href(data.posterUrl)}" x="0" y="0" width="${poster.width}" height="${poster.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#posterClip)"/>` : '';
  const qrImage = data.qrCodeDataUrl ? `<image href="${href(data.qrCodeDataUrl)}" x="${(qr.width - qrSize) / 2}" y="10" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet"/>` : text(qr.width / 2, qr.height / 2, 'QR unavailable', 14, secondary, 600, 'middle');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${base}"/><stop offset="100%" stop-color="${accent}" stop-opacity=".72"/></linearGradient><clipPath id="posterClip"><rect width="${poster.width}" height="${poster.height}" rx="10"/></clipPath></defs>${bg}<rect width="${W}" height="${H}" fill="#000000" opacity=".16"/><g${g(poster)}>${posterImage}</g><g${g(title)}><rect width="${title.width}" height="${title.height}" rx="10" fill="#000" opacity=".46" stroke="${border}"/>${text(16, 34, data.eventName, Math.max(16, Math.min(30, title.height / 3)), primary, 800)}<rect x="16" y="${title.height - 32}" width="${Math.min(title.width - 32, Math.max(90, String(data.ticketType || 'Standard').length * 8 + 28))}" height="20" rx="10" fill="${accent}"/>${text(Math.min(title.width - 32, Math.max(90, String(data.ticketType || 'Standard').length * 8 + 28)) / 2 + 16, title.height - 18, String(data.ticketType || 'Standard').toUpperCase(), 10, '#fff', 700, 'middle')}</g><g${g(info)}><rect width="${info.width}" height="${info.height}" rx="10" fill="#000" opacity=".48" stroke="${border}"/>${rows.map((r, i) => `${text(16, 22 + i * rowH, r[0], 9, secondary, 700)}${text(16, 36 + i * rowH, r[1], 12, primary, 600)}`).join('')}</g><g${g(qr)}><rect width="${qr.width}" height="${qr.height}" rx="12" fill="${qrBg}" stroke="${accent}" stroke-width="2"/>${qrImage}${text(qr.width / 2, qr.height - 20, data.ticketRef, 10, accent, 700, 'middle')}</g><rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000" opacity=".55"/>${text(18, H - 13, 'YOVIBE', 10, accent, 700)}${text(W - 18, H - 13, data.ticketRef, 10, secondary, 500, 'end')}</svg>`;
}

async function asData(value) {
  if (!value || value.startsWith('data:') || !/^https?:\/\//i.test(value)) return value;
  const response = await fetch(value);
  if (!response.ok) return value;
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${response.headers.get('content-type') || 'image/jpeg'};base64,${bytes.toString('base64')}`;
}

async function renderTicketPng(data) {
  let svg = renderSvg(data);
  for (const asset of [data.qrCodeDataUrl, data.posterUrl, data.ticketDesign?.background_url].filter(Boolean)) {
    svg = svg.replaceAll(`href="${href(asset)}"`, `href="${await asData(asset)}"`);
  }
  const layout = computeTicketLayout(data.ticketDesign || {}, { hasPoster: !!data.posterUrl });
  return {
    bytes: new Resvg(svg, {
      fitTo: { mode: 'original' },
      textRendering: 2,
      font: {
        loadSystemFonts: true,
        defaultFontFamily: 'DejaVu Sans',
        sansSerifFamily: 'DejaVu Sans',
        monospaceFamily: 'DejaVu Sans Mono',
      },
    }).render().asPng(),
    width: layout.pageWidth,
    height: layout.pageHeight,
  };
}

module.exports = { renderTicketPng };
