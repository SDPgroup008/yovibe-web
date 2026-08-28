const { computeTicketLayout } = require('../functions/ticketLayoutEngine');
const { Resvg } = require('@resvg/resvg-js');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (v) => esc(v).replace(/#/g, '%23');

// Detect the actual image format from the file bytes. R2/custom-domain responses
// can mislabel JPEG data as image/png (or vice-versa); decoders (resvg, native
// Image) trust the data-URL MIME, so a mismatch silently drops the image. Sniff
// the magic bytes and prefer them over the Content-Type header.
function sniffImageMime(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes.length > 0 && bytes.subarray(0, 256).toString('latin1').toLowerCase().includes('<svg')) return 'image/svg+xml';
  return null;
}
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

// Shared email-style layout for DEFAULT tickets. Mirrors the client
// renderEmailStyleSvg so in-app and PDF tickets line up exactly. Returns all the
// vertical positions used by both the SVG renderer and the pdf-lib vector-text
// overlay in renderTicketPdf.
function computeEmailLayout(W, H, isLandscape, rowCount, hasPoster) {
  const FOOTER_H = 36, BRAND_H = 0;   // header removed; hero starts at y=0
  const pad = isLandscape ? 24 : 32;
  const contentW = isLandscape ? Math.round(W * 0.52) : W - pad * 2;
  // Compacted middle content so the hero can grow 1/3 without crushing the QR.
  const rowH = 24;
  const gap = isLandscape ? 4 : 6;
  const detailsCardH = rowCount * rowH + (isLandscape ? 12 : 18);
  const titleH = isLandscape ? 48 : 56;
  const attendeeH = isLandscape ? 46 : 50;
  const qrPad = isLandscape ? 8 : 16;
  // Gap between the hero and the title equals the height of the "YOVIBE" brand text.
  const titleGap = 16;

  const availY = H - FOOTER_H - BRAND_H;

  // Hero height the user sees today (with the prior spacing), so "1/3 more" is
  // relative to that value.
  const prevFixed = pad + (isLandscape ? 54 : 66) + gap + (isLandscape ? 50 : 58) + gap
    + (rowCount * (isLandscape ? 24 : 28) + (isLandscape ? 12 : 18)) + qrPad + (isLandscape ? 244 : 274);
  const heroBase = hasPoster ? Math.max(0, availY - 8 - prevFixed) : 0;
  const heroH = hasPoster ? Math.round(heroBase * (4 / 3)) : 0;

  // QR panel takes whatever vertical space remains, keeping the QR large.
  const nonQrFixed = heroH + titleGap + titleH + gap + attendeeH + gap + detailsCardH + qrPad;
  const qrH = Math.max(64, availY - 8 - nonQrFixed);

  let y = BRAND_H + heroH;
  const titleY = y + titleGap;
  y = titleY + titleH;
  const attendeeY = y + gap;
  y = attendeeY + attendeeH;
  const detailCardY = y + gap;
  y = detailCardY + detailsCardH;
  const qrY = y + qrPad;
  const remainingH = H - FOOTER_H - qrY - 8;
  const panelH = Math.min(qrH, remainingH);
  // QR fills the panel (no label / ref text), using the freed space to enlarge it.
  const qrFit = Math.max(64, Math.min(contentW, panelH) - 44);

  return { FOOTER_H, BRAND_H, pad, contentW, rowH, gap, detailsCardH,
    titleH, attendeeH, qrH, qrPad, heroH, titleY, attendeeY, detailCardY, qrY, panelH, qrFit };
}

function emailDetailRows(data, options) {
  const rows = [
    ['EVENT', data.eventName || 'Event'],
    ['TICKET', data.ticketType || 'Standard'],
    ['VENUE', data.venue || 'Venue TBA'],
    ['DATE', data.date || ''],
    ['TIME', data.time || ''],
    ['REF', data.ticketRef || 'XXXXXXXX'],
  ];
  if (data.seatNumber != null && data.seatNumber !== '') rows.push(['SEAT', String(data.seatNumber)]);
  if (data.tableNumber != null && data.tableNumber !== '') rows.push(['TABLE', String(data.tableNumber)]);
  return rows;
}

// Email-style stacked layout for DEFAULT tickets (no custom uploaded background).
// brand bar → full-bleed hero poster → title → attendee → details → QR → footer.
function renderDefaultSvg(data, options = {}) {
  const design = data.ticketDesign || {};
  const layout = computeTicketLayout(design, { hasPoster: !!data.posterUrl });
  const colors = colorsFor(design);
  const { background: base, accent, text: primary, secondary, qr: qrBg, border } = colors;
  const W = layout.pageWidth, H = layout.pageHeight;
  const isLandscape = layout.isLandscape;
  const hasPoster = !!data.posterUrl;
  // When includeText is false the text is omitted (the PDF draws it as vector
  // text instead, which works without server-side fonts).
  const showText = options.includeText !== false;

  const rows = emailDetailRows(data, options);
  const L = computeEmailLayout(W, H, isLandscape, rows.length, hasPoster);
  const { pad, contentW, rowH, gap, heroH, titleY, attendeeY, detailCardY, qrY, panelH, qrFit } = L;
  const gradientId = 'email-bg-' + Math.abs(W * 31 + H * 17);
  const heroClip = 'email-hero-' + Math.abs(W * 31 + H * 17);

  const hero = hasPoster ? `
    <image href="${href(data.posterUrl)}" x="0" y="0" width="${W}" height="${heroH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${heroClip})"/>` : '';

  const badgeW = Math.min(contentW, Math.max(96, String(data.ticketType || 'Standard').length * 8 + 30));
  const titleBlock = `
    ${showText ? `<text x="${pad}" y="${titleY}" font-family="Arial, Helvetica, sans-serif" font-size="24px" font-weight="800" fill="${primary}" letter-spacing="-0.5">${esc(data.eventName || 'Event')}</text>` : ''}
    <rect x="${pad}" y="${titleY + 10}" width="${badgeW}" height="22" rx="11" fill="${accent}"/>
    ${showText ? `<text x="${pad + badgeW / 2}" y="${titleY + 24}" font-family="Arial, Helvetica, sans-serif" font-size="11px" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1">${esc(String(data.ticketType || 'Standard').toUpperCase())}</text>` : ''}`;

  const attendeeBlock = `
    <rect x="${pad}" y="${attendeeY}" width="${contentW}" height="${L.attendeeH}" rx="10" fill="#000" opacity="0.45" stroke="${border}"/>
    ${showText ? `<text x="${pad + 14}" y="${attendeeY + 20}" font-family="Arial, Helvetica, sans-serif" font-size="9px" font-weight="700" fill="${accent}" letter-spacing="1">ADMITS</text>
    <text x="${pad + 14}" y="${attendeeY + 42}" font-family="Arial, Helvetica, sans-serif" font-size="19px" font-weight="800" fill="${primary}">${esc(data.buyerName || 'Guest')}</text>` : ''}`;

  const detailRows = showText ? rows.map(([label, value], i) => `
    <text x="0" y="${detailCardY + 24 + i * rowH}" font-family="Arial, Helvetica, sans-serif" font-size="9px" font-weight="700" fill="${secondary}" letter-spacing="1">${esc(label)}</text>
    <text x="${contentW - 30}" y="${detailCardY + 24 + i * rowH}" font-family="Arial, Helvetica, sans-serif" font-size="13px" font-weight="600" fill="${primary}" text-anchor="end">${esc(value)}</text>
    <line x1="0" y1="${detailCardY + 24 + i * rowH + 10}" x2="${contentW - 30}" y2="${detailCardY + 24 + i * rowH + 10}" stroke="${border}" stroke-width="0.5" opacity="0.5"/>`).join('') : '';
  const detailCard = `
    <rect x="${pad}" y="${detailCardY}" width="${contentW}" height="${L.detailsCardH}" rx="12" fill="#000" opacity="0.45" stroke="${border}"/>
    <rect x="${pad}" y="${detailCardY}" width="4" height="${L.detailsCardH}" rx="2" fill="${accent}" opacity="0.7"/>
    ${showText ? `<g transform="translate(${pad + 16} 0)">${detailRows}</g>` : ''}`;

  const qrImage = data.qrCodeDataUrl
    ? `<image href="${href(data.qrCodeDataUrl)}" x="${pad + (contentW - qrFit) / 2}" y="${qrY + (panelH - qrFit) / 2}" width="${qrFit}" height="${qrFit}" preserveAspectRatio="xMidYMid meet"/>`
    : (showText ? `<text x="${pad + contentW / 2}" y="${qrY + panelH / 2}" font-family="Arial, Helvetica, sans-serif" font-size="14px" font-weight="600" fill="${secondary}" text-anchor="middle">QR unavailable</text>` : '');
  const qrPanel = `
    <rect x="${pad}" y="${qrY}" width="${contentW}" height="${panelH}" rx="12" fill="${qrBg}" stroke="${accent}" stroke-width="1.5"/>
    ${qrImage}`;

  const footer = `
    <rect x="0" y="${H - L.FOOTER_H}" width="${W}" height="${L.FOOTER_H}" fill="#000" opacity="0.55"/>
    ${showText ? `<text x="18" y="${H - 13}" font-family="Arial, Helvetica, sans-serif" font-size="10px" font-weight="800" fill="${accent}" letter-spacing="2">YOVIBE</text>
    <text x="${W - 18}" y="${H - 13}" font-family="'Courier New',monospace" font-size="9px" fill="${secondary}" text-anchor="end">${esc(data.ticketRef || 'XXXXXXXX')}</text>` : ''}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${base}"/><stop offset="100%" stop-color="${accent}" stop-opacity="0.72"/></linearGradient>
      <clipPath id="${heroClip}"><rect width="${W}" height="${heroH}" rx="0"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#${gradientId})"/>
    ${hero}
    ${titleBlock}
    ${attendeeBlock}
    ${detailCard}
    ${qrPanel}
    ${footer}
  </svg>`;
}


function renderSvg(data, options = {}) {
  const design = data.ticketDesign || { source: 'template', template_id: 'midnight-portrait', orientation: 'portrait', dimensions: { width: 600, height: 900 } };
  const layout = computeTicketLayout(design, { hasPoster: !!data.posterUrl });
  const colors = colorsFor(design);
  const { background: base, accent, text: primary, secondary, qr: qrBg, border } = colors;
  const W = layout.pageWidth, H = layout.pageHeight;

  // Default tickets (no custom uploaded background) use the same email-style
  // stacked layout as the in-app ticket so the PDF matches the app.
  if (!(design.source === 'upload' && design.background_url)) {
    return renderDefaultSvg(data, options);
  }
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
  const text = (x, y, v, size, color, weight = 500, anchor = 'start', filter = '') => options.includeText === false ? '' : `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${filter ? ` filter="url(#titleShadow)"` : ''}>${esc(v)}</text>`;
  const qrSize = Math.max(64, Math.min(qr.width - 24, qr.height - 36));
  const rows = [['DATE', data.date], ['TIME', data.time], ['VENUE', data.venue || 'Venue TBA'], ['ATTENDEE', data.buyerName || 'Guest']];
  if (data.seatNumber != null) rows.push(['SEAT', String(data.seatNumber)]);
  if (data.tableNumber != null) rows.push(['TABLE', String(data.tableNumber)]);
  const rowH = Math.max(22, (info.height - 24) / rows.length);
  // Replicate the editor's CSS background model (background-position: calc(50% + x) calc(50% + y)):
  // center the scale·W × scale·H background box, then offset by (x, y) in ticket-space pixels.
  const bgT = layout.bgTransform || { x: 0, y: 0, scale: 1 };
  const bgScale = bgT.scale || 1;
  const bgLeft = (W - W * bgScale) / 2 + (bgT.x || 0);
  const bgTop = (H - H * bgScale) / 2 + (bgT.y || 0);
  const bg = design.source === 'upload' && design.background_url ? `<image href="${href(design.background_url)}" x="${bgLeft}" y="${bgTop}" width="${W * bgScale}" height="${H * bgScale}" preserveAspectRatio="xMidYMid slice" opacity=".85"/>` : `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${base}"/><stop offset="100%" stop-color="${accent}" stop-opacity=".72"/></linearGradient><clipPath id="posterClip"><rect width="${poster.width}" height="${poster.height}" rx="10"/></clipPath></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  const posterImage = data.posterUrl ? `<rect width="${poster.width}" height="${poster.height}" rx="10" fill="#000" opacity=".35"/><image href="${href(data.posterUrl)}" x="0" y="0" width="${poster.width}" height="${poster.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#posterClip)"/>` : '';
  const qrImage = data.qrCodeDataUrl ? `<image href="${href(data.qrCodeDataUrl)}" x="${(qr.width - qrSize) / 2}" y="10" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet"/>` : text(qr.width / 2, qr.height / 2, 'QR unavailable', 14, secondary, 600, 'middle');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${base}"/><stop offset="100%" stop-color="${accent}" stop-opacity=".72"/></linearGradient><clipPath id="posterClip"><rect width="${poster.width}" height="${poster.height}" rx="10"/></clipPath><filter id="titleShadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity=".75"/></filter></defs>${bg}<rect width="${W}" height="${H}" fill="#000000" opacity="${layout.isUploadBg ? 0 : .16}"/><g${g(poster)}>${posterImage}</g><g${g(title)}>${text(16, 34, data.eventName, Math.max(16, Math.min(30, title.height / 3)), primary, 800, 'start', 'url(#titleShadow)')}<rect x="16" y="${title.height - 28}" width="${Math.min(title.width - 32, Math.max(90, String(data.ticketType || 'Standard').length * 8 + 28))}" height="20" rx="10" fill="${accent}"/>${text(Math.min(title.width - 32, Math.max(90, String(data.ticketType || 'Standard').length * 8 + 28)) / 2 + 16, title.height - 14, String(data.ticketType || 'Standard').toUpperCase(), 10, '#fff', 700, 'middle')}</g><g${g(info)}><rect width="${info.width}" height="${info.height}" rx="10" fill="#000" opacity=".48" stroke="${border}"/>${rows.map((r, i) => `${text(16, 22 + i * rowH, r[0], 9, secondary, 700)}${text(16, 36 + i * rowH, r[1], 12, primary, 600)}`).join('')}</g><g${g(qr)}><rect width="${qr.width}" height="${qr.height}" rx="12" fill="${qrBg}" stroke="${accent}" stroke-width="2"/>${qrImage}${text(qr.width / 2, qr.height - 20, data.ticketRef, 10, accent, 700, 'middle')}</g><rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000" opacity=".55"/>${text(18, H - 13, 'YOVIBE', 10, accent, 700)}${text(W - 18, H - 13, data.ticketRef, 10, secondary, 500, 'end')}</svg>`;
}

async function asData(value) {
  if (!value || value.startsWith('data:') || !/^https?:\/\//i.test(value)) return value;
  const response = await fetch(value);
  if (!response.ok) return value;
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = sniffImageMime(bytes) || response.headers.get('content-type') || 'image/jpeg';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function renderTicketPng(data, options = {}) {
  let svg = renderSvg(data, options);
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

function hexColor(value, fallback = '#ffffff') {
  const match = String(value || fallback).match(/^#([0-9a-f]{6})$/i);
  if (!match) return rgb(1, 1, 1);
  const n = parseInt(match[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function drawPdfText(page, text, x, topBaseline, size, color, options = {}) {
  const { pageHeight } = options;
  page.drawText(String(text ?? ''), {
    x,
    y: pageHeight - topBaseline,
    size,
    font: options.font,
    color: hexColor(color),
    ...(options.align === 'center' ? { x: x - options.font.widthOfTextAtSize(String(text ?? ''), size) / 2 } : {}),
    ...(options.align === 'right' ? { x: x - options.font.widthOfTextAtSize(String(text ?? ''), size) } : {}),
  });
}

async function renderTicketPdf(data) {
  const design = data.ticketDesign || {};

  // DEFAULT tickets (no custom uploaded background): the email-style layout is
  // rendered as an image WITHOUT baked-in text, then the text is drawn as vector
  // text with pdf-lib's embedded Helvetica. This keeps text visible even when the
  // server has no system fonts (resvg cannot rasterize SVG <text> without them).
  if (!(design.source === 'upload' && design.background_url)) {
    const artwork = await renderTicketPng(data, { includeText: false });
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([artwork.width, artwork.height]);
    const image = await pdf.embedPng(artwork.bytes);
    page.drawImage(image, { x: 0, y: 0, width: artwork.width, height: artwork.height });

    const layout = computeTicketLayout(design, { hasPoster: !!data.posterUrl });
    const W = layout.pageWidth, H = layout.pageHeight;
    const isLandscape = layout.isLandscape;
    const colors = colorsFor(design);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const ref = data.ticketRef || 'XXXXXXXX';

    const rows = emailDetailRows(data, {});
    const L = computeEmailLayout(W, H, isLandscape, rows.length, !!data.posterUrl);
    const { pad, contentW, rowH, titleY, attendeeY, detailCardY } = L;
    const badgeW = Math.min(contentW, Math.max(96, String(data.ticketType || 'Standard').length * 8 + 30));
    const ph = { pageHeight: H };

    // Title
    drawPdfText(page, data.eventName || 'Event', pad, titleY, 24, colors.text, { ...ph, font: bold });
    drawPdfText(page, String(data.ticketType || 'Standard').toUpperCase(), pad + badgeW / 2, titleY + 24, 11, '#ffffff', { ...ph, font: bold, align: 'center' });

    // Attendee
    drawPdfText(page, 'ADMITS', pad + 14, attendeeY + 20, 9, colors.accent, { ...ph, font: bold });
    drawPdfText(page, data.buyerName || 'Guest', pad + 14, attendeeY + 42, 19, colors.text, { ...ph, font: bold });

    // Details rows (label left, value right-aligned, matching the SVG translate(pad+16))
    rows.forEach(([label, value], i) => {
      const yy = detailCardY + 24 + i * rowH;
      drawPdfText(page, label, pad + 16, yy, 9, colors.secondary, { ...ph, font: bold });
      drawPdfText(page, value, pad + 16 + contentW - 30, yy, 13, colors.text, { ...ph, font: bold, align: 'right' });
    });

    // Footer
    drawPdfText(page, 'YOVIBE', 18, H - 13, 10, colors.accent, { ...ph, font: bold });
    drawPdfText(page, ref, W - 18, H - 13, 10, colors.secondary, { ...ph, font, align: 'right' });

    return pdf.save();
  }

  const artwork = await renderTicketPng(data, { includeText: false });
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([artwork.width, artwork.height]);
  const image = await pdf.embedPng(artwork.bytes);
  page.drawImage(image, { x: 0, y: 0, width: artwork.width, height: artwork.height });

  const layout = computeTicketLayout(design, { hasPoster: !!data.posterUrl });
  const get = (id, fallback) => layout.blocks.find((b) => b.id === id) || fallback;
  const title = get('title', { x: 24, y: 24, width: 280, height: 80, scale: 1 });
  const info = get('info', { x: 24, y: 430, width: 260, height: 180, scale: 1 });
  const qr = get('qr', { x: 190, y: 250, width: 160, height: 200, scale: 1 });
  const colors = colorsFor(design);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ref = data.ticketRef || data.ticketId || 'XXXXXXXX';
  const ticketType = data.ticketType || 'Standard';
  const badgeWidth = Math.min(title.width - 32, Math.max(90, String(ticketType).length * 8 + 28));
  const titleScale = title.scale || 1;
  const infoScale = info.scale || 1;
  const qrScale = qr.scale || 1;
  const titleX = title.x;
  const titleY = title.y;
  const titleSize = Math.max(16, Math.min(30, title.height / 3)) * titleScale;
  drawPdfText(page, data.eventName || 'Event', titleX + 18 * titleScale, titleY + 36 * titleScale, titleSize, '#000000', { pageHeight: artwork.height, font: bold });
  drawPdfText(page, data.eventName || 'Event', titleX + 16 * titleScale, titleY + 34 * titleScale, titleSize, colors.text, { pageHeight: artwork.height, font: bold });
  drawPdfText(page, String(ticketType).toUpperCase(), titleX + (badgeWidth / 2 + 16) * titleScale, titleY + (title.height - 18) * titleScale, 10 * titleScale, '#ffffff', { pageHeight: artwork.height, font: bold, align: 'center' });

  const rows = [['DATE', data.date], ['TIME', data.time], ['VENUE', data.venue || 'Venue TBA'], ['ATTENDEE', data.buyerName || 'Guest']];
  const rowH = Math.max(22, (info.height - 24) / rows.length);
  rows.forEach(([label, value], index) => {
    drawPdfText(page, label, info.x + 16 * infoScale, info.y + (22 + index * rowH) * infoScale, 9 * infoScale, colors.secondary, { pageHeight: artwork.height, font: bold });
    drawPdfText(page, value, info.x + 16 * infoScale, info.y + (36 + index * rowH) * infoScale, 12 * infoScale, colors.text, { pageHeight: artwork.height, font: bold });
  });
  drawPdfText(page, ref, qr.x + (qr.width / 2) * qrScale, qr.y + (qr.height - 20) * qrScale, 10 * qrScale, colors.accent, { pageHeight: artwork.height, font: bold, align: 'center' });
  drawPdfText(page, 'YOVIBE', 18, artwork.height - 13, 10, colors.accent, { pageHeight: artwork.height, font: bold });
  drawPdfText(page, ref, artwork.width - 18, artwork.height - 13, 10, colors.secondary, { pageHeight: artwork.height, font, align: 'right' });
  return pdf.save();
}

module.exports = { renderTicketPng, renderTicketPdf };
