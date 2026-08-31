// netlify/functions/sales-report.js
//
// Phase 3 (3.3): per-event sales & reconciliation report (admin only).
// Returns a JSON summary, a CSV string, AND a professionally formatted PDF
// (base64): a financial summary page + an organiser-insights page + an
// audit-grade buyer register (complete buyer list, paginated).
//
// POST { eventId } → { success, event, summary, csv, pdfBase64, fees, insights }

const { requireUser, json } = require('../shared/supabaseAdmin');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const SOLD_STATUSES = ['active', 'used', 'pending'];
const DONE_REFUND_STATUSES = ['completed'];
const ROWS_PER_PAGE = 26;

// YoVibe brand colors
const INK = rgb(0.11, 0.11, 0.15);        // #1c1c26
const DARK = rgb(0.05, 0.05, 0.08);       // #0d0d14
const CARD_BG = rgb(0.96, 0.96, 0.98);    // #f5f5fa
const ACCENT = rgb(0.91, 0.16, 0.16);     // YoVibe red #E8292B
const GRAY = rgb(0.45, 0.45, 0.5);
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.85, 0.85, 0.9);

function num(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }

function fmtUGX(n) {
  return `UGX ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Truncate text to fit a fixed-width PDF column.
function truncate(text, font, size, maxWidth) {
  let s = String(text ?? '');
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

// ─── Page 1: financial summary + engagement ──────────────────────────────────
function drawPage1(doc, page, helv, helvBold, ev, summary, fees, insights, totalPages) {
  const W = 595.28;
  let y = 841.89;

  // Header band
  page.drawRectangle({ x: 0, y: y - 104, width: W, height: 104, color: DARK });
  page.drawText('Yo', { x: 48, y: y - 62, size: 26, font: helvBold, color: ACCENT });
  page.drawText('Vibe', { x: 48 + helvBold.widthOfTextAtSize('Yo', 26), y: y - 62, size: 26, font: helvBold, color: WHITE });
  page.drawText('EVENT SALES REPORT', { x: 48, y: y - 88, size: 12, font: helvBold, color: ACCENT });
  page.drawText('yovibe.net', { x: W - 160, y: y - 62, size: 11, font: helv, color: rgb(0.7, 0.7, 0.75) });
  page.drawText('CONFIDENTIAL', { x: W - 160, y: y - 88, size: 9, font: helv, color: rgb(0.6, 0.6, 0.65) });
  y -= 128;

  // Event info
  page.drawText(String(ev.name || '').toUpperCase(), { x: 48, y, size: 17, font: helvBold, color: INK });
  y -= 22;
  page.drawText(`${ev.venue_name || ''}  •  ${ev.date ? new Date(ev.date).toDateString() : ''}${ev.time ? `  •  ${ev.time}` : ''}`, { x: 48, y, size: 11, font: helv, color: GRAY });
  y -= 16;
  page.drawText(`Generated ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}  •  Event ID: ${ev.slug}`, { x: 48, y, size: 9, font: helv, color: GRAY });
  y -= 30;

  // KPI cards (2 rows × 3 cols)
  const kpis = [
    ['Tickets Sold', String(summary.soldCount)],
    ['Gross Revenue', fmtUGX(summary.gross)],
    ['Platform Commission (15%)', fmtUGX(summary.commission)],
    ['Net to Venue', fmtUGX(summary.venueRevenue)],
    ['Refunds', `${summary.completedRefunds}  (${fmtUGX(summary.refundAmount)})`],
    ['Payouts Made', `${summary.payoutsCount}  (${fmtUGX(summary.payoutsTotal)})`],
  ];
  const cardW = (W - 96 - 24) / 3;
  const cardH = 62;
  kpis.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 48 + col * (cardW + 12);
    const cy = y - row * (cardH + 12) - cardH;
    page.drawRectangle({ x, y: cy, width: cardW, height: cardH, color: CARD_BG, borderColor: LINE, borderWidth: 1 });
    page.drawText(label.toUpperCase(), { x: x + 12, y: cy + cardH - 20, size: 8, font: helvBold, color: GRAY });
    page.drawText(value, { x: x + 12, y: cy + 14, size: 13, font: helvBold, color: INK });
  });
  y -= 2 * (cardH + 12) + 26;

  // Section: ticket breakdown by category
  page.drawText('TICKET BREAKDOWN BY CATEGORY', { x: 48, y, size: 11, font: helvBold, color: DARK });
  y -= 14;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1.2, color: ACCENT });
  y -= 18;

  const cols = [
    { label: 'Category', w: 118, align: 'left' },
    { label: 'Tickets', w: 52, align: 'center' },
    { label: 'Gross', w: 72, align: 'right' },
    { label: 'Late Fees', w: 62, align: 'right' },
    { label: 'Gateway', w: 62, align: 'right' },
    { label: 'Commission', w: 66, align: 'right' },
    { label: 'Net', w: 66, align: 'right' },
  ];
  const tableX = 48;
  const rowH = 24;
  const drawHeaderRow = (yy) => {
    page.drawRectangle({ x: tableX, y: yy, width: W - 96, height: rowH, color: DARK });
    let cx = tableX;
    cols.forEach((c) => {
      const label = c.label.toUpperCase();
      page.drawText(label, { x: cx + (c.align === 'right' ? c.w - 10 : c.align === 'center' ? (c.w - helvBold.widthOfTextAtSize(label, 8)) / 2 : 10), y: yy + 8, size: 8, font: helvBold, color: WHITE });
      cx += c.w;
    });
  };
  const drawRow = (yy, values, bg) => {
    if (bg) page.drawRectangle({ x: tableX, y: yy, width: W - 96, height: rowH, color: bg });
    let cx = tableX;
    cols.forEach((c, i) => {
      const v = String(values[i]);
      page.drawText(v, { x: cx + (c.align === 'right' ? c.w - 10 - helv.widthOfTextAtSize(v, 9) : c.align === 'center' ? (c.w - helv.widthOfTextAtSize(v, 9)) / 2 : 10), y: yy + 7.5, size: 9, font: helv, color: INK });
      cx += c.w;
    });
    page.drawRectangle({ x: tableX, y: yy, width: W - 96, height: 0.4, color: LINE });
  };

  drawHeaderRow(y - rowH);
  y -= rowH;
  fees.forEach((f, i) => {
    drawRow(y - rowH, [f.name, String(f.tickets), fmtUGX(f.gross), fmtUGX(f.lateFees), fmtUGX(f.gatewayFees), fmtUGX(f.commission), fmtUGX(f.net)], i % 2 === 1 ? CARD_BG : undefined);
    y -= rowH;
  });
  // Total row
  page.drawRectangle({ x: tableX, y: y - rowH, width: W - 96, height: rowH, color: DARK });
  let cx = tableX;
  const totalValues = ['TOTAL', String(summary.soldCount), fmtUGX(summary.gross), fmtUGX(summary.lateFees), fmtUGX(summary.gatewayFees), fmtUGX(summary.commission), fmtUGX(summary.venueRevenue)];
  cols.forEach((c, i) => {
    const v = String(totalValues[i]);
    page.drawText(v, { x: cx + (c.align === 'right' ? c.w - 10 - helvBold.widthOfTextAtSize(v, 9) : c.align === 'center' ? (c.w - helvBold.widthOfTextAtSize(v, 9)) / 2 : 10), y: y - rowH + 7.5, size: 9, font: helvBold, color: WHITE });
    cx += c.w;
  });
  y -= rowH + 22;

  // Section: refunds & reconciliation
  page.drawText('REFUNDS & RECONCILIATION', { x: 48, y, size: 11, font: helvBold, color: DARK });
  y -= 14;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1.2, color: ACCENT });
  y -= 18;
  const lines = [
    ['Completed refunds', `${summary.completedRefunds} ticket(s)`, fmtUGX(summary.refundAmount)],
    ['Clawbacks recovered (paid-then-refunded)', summary.clawbacks > 0 ? `UGX ${summary.clawbacks.toLocaleString()}` : '—', ''],
    ['Chargebacks', String(summary.chargebacks), ''],
    ['Payout records', String(summary.payoutsCount), fmtUGX(summary.payoutsTotal)],
    ['Pending payout (eligible, unpaid)', '', fmtUGX(summary.pendingPayout)],
  ];
  lines.forEach(([label, mid, val]) => {
    page.drawText(label, { x: 48, y, size: 9.5, font: helv, color: INK });
    if (mid) page.drawText(mid, { x: 300, y, size: 9.5, font: helv, color: GRAY });
    if (val) page.drawText(val, { x: W - 200, y, size: 9.5, font: helvBold, color: INK });
    y -= 17;
  });
  y -= 8;

  // Engagement (attendance + purchase timing — supports organiser decisions)
  page.drawText('ENGAGEMENT', { x: 48, y, size: 11, font: helvBold, color: DARK });
  y -= 14;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1.2, color: ACCENT });
  y -= 18;
  const engagementRows = [
    ['Scanned / attended', `${insights.scannedCount}`, `${insights.attendanceRate}%`],
    ['Early purchases', `${insights.totalTickets - insights.lateCount}`, `${insights.totalTickets ? Math.round(((insights.totalTickets - insights.lateCount) / insights.totalTickets) * 100) : 0}%`],
    ['Late-fee purchases', `${insights.lateCount}`, `${insights.lateRate}%`],
    ['Returning buyers', `${insights.returning}/${insights.uniqueBuyers}`, `${insights.returningRate}%`],
    ['Average order value', '', fmtUGX(insights.avgOrderValue)],
    ['Average tickets / order', '', insights.avgTicketsPerOrder.toFixed(1)],
  ];
  engagementRows.forEach(([label, mid, val]) => {
    page.drawText(label, { x: 48, y, size: 9.5, font: helv, color: INK });
    if (mid) page.drawText(mid, { x: 300, y, size: 9.5, font: helv, color: GRAY });
    if (val) page.drawText(val, { x: W - 200, y, size: 9.5, font: helvBold, color: INK });
    y -= 17;
  });

  // Footer
  page.drawRectangle({ x: 0, y: 28, width: W, height: 1.2, color: LINE });
  page.drawText('Generated by YoVibe • yovibe.net • support@yovibe.net', { x: 48, y: 16, size: 8, font: helv, color: GRAY });
  page.drawText(`Page 1 of ${totalPages}`, { x: W - 120, y: 16, size: 8, font: helv, color: GRAY });
}

async function buildPdfReport(ev, summary, fees, insights) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  drawPage1(doc, page, helv, helvBold, ev, summary, fees, insights || {}, 1);
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

// ─── Buyer register (complete buyer list, paginated, audit-grade) ────────────
// Columns sized to fit inside the page (40..555) so nothing is cut off.
const REG_COLS = [
  { label: 'TICKET REF', x: 48, w: 72 },
  { label: 'BUYER NAME', x: 124, w: 110 },
  { label: 'EMAIL', x: 238, w: 130 },
  { label: 'PHONE', x: 372, w: 84 },
  { label: 'TYPE', x: 460, w: 48 },
  { label: 'PAYMENT', x: 512, w: 44 },
];

function drawBuyerPages(doc, helv, helvBold, ev, buyerRows, totalPages) {
  const W = 595.28;
  const pages = Math.max(1, Math.ceil(buyerRows.length / ROWS_PER_PAGE));
  const rowH = 20;

  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595.28, 841.89]);
    const pageNo = 2 + p;

    // Header band
    page.drawRectangle({ x: 0, y: 841.89 - 70, width: W, height: 70, color: DARK });
    page.drawText('Yo', { x: 48, y: 841.89 - 42, size: 20, font: helvBold, color: ACCENT });
    page.drawText('Vibe', { x: 48 + helvBold.widthOfTextAtSize('Yo', 20), y: 841.89 - 42, size: 20, font: helvBold, color: WHITE });
    page.drawText(`BUYER REGISTER — ${String(ev.name || '').toUpperCase()}`, { x: 48, y: 841.89 - 62, size: 10, font: helvBold, color: ACCENT });
    page.drawText('All buyers (tickets in active/used/pending status)', { x: W - 220, y: 841.89 - 42, size: 8, font: helv, color: rgb(0.7, 0.7, 0.75) });
    page.drawText(`Page ${pageNo} of ${totalPages}`, { x: W - 220, y: 841.89 - 62, size: 8, font: helv, color: rgb(0.7, 0.7, 0.75) });

    // Table header (repeated on every page)
    const headerY = 841.89 - 96;
    page.drawRectangle({ x: 40, y: headerY, width: W - 80, height: 22, color: DARK });
    REG_COLS.forEach((c) => {
      page.drawText(c.label, { x: c.x, y: headerY + 7, size: 7.5, font: helvBold, color: WHITE });
    });

    // Rows
    const start = p * ROWS_PER_PAGE;
    const chunk = buyerRows.slice(start, start + ROWS_PER_PAGE);
    let y = headerY - 22;
    chunk.forEach((b, i) => {
      if (i % 2 === 1) page.drawRectangle({ x: 40, y: y, width: W - 80, height: rowH, color: CARD_BG });
      const cells = [
        truncate(b.ref, helv, 8.5, 68),
        truncate(b.name, helv, 8.5, 104),
        truncate(b.email, helv, 8.5, 124),
        truncate(b.phone, helv, 8.5, 78),
        truncate(b.type, helv, 8.5, 44),
        truncate(b.method === 'mobile_money' ? 'Mobile Money' : b.method === 'credit_card' ? 'Card' : b.method === 'bank_transfer' ? 'Bank' : (b.method || ''), helv, 8.5, 40),
      ];
      REG_COLS.forEach((c, ci) => {
        page.drawText(cells[ci], { x: c.x, y: y + 5.5, size: 8.5, font: helv, color: INK });
      });
      page.drawRectangle({ x: 40, y: y, width: W - 80, height: 0.3, color: LINE });
      y -= rowH;
    });

    // Footer + reconciliation/compliance notes on the last page
    page.drawRectangle({ x: 0, y: 28, width: W, height: 1.2, color: LINE });
    page.drawText('Generated by YoVibe • yovibe.net • support@yovibe.net', { x: 48, y: 16, size: 8, font: helv, color: GRAY });
    page.drawText(`Page ${pageNo} of ${totalPages}`, { x: W - 120, y: 16, size: 8, font: helv, color: GRAY });
    if (p === pages - 1) {
      page.drawText(`TOTAL BUYER RECORDS: ${buyerRows.length}  —  reconciles to Tickets Sold on the summary page.`, { x: 48, y: 48, size: 8.5, font: helvBold, color: INK });
      page.drawText('Personal data is processed under the Data Protection and Privacy Act, 2019 for event administration, entry validation, and event communications only.', { x: 48, y: 36, size: 7.5, font: helv, color: GRAY });
    }
  }
}

async function buildFullPdf(ev, summary, fees, insights, buyerRows) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Register pages scale with the number of tickets (26 rows/page).
  const buyerPages = Math.max(1, Math.ceil((buyerRows || []).length / ROWS_PER_PAGE));
  const totalPages = 1 + buyerPages;
  const page1 = doc.addPage([595.28, 841.89]);
  drawPage1(doc, page1, helv, helvBold, ev, summary, fees, insights || {}, totalPages);
  drawBuyerPages(doc, helv, helvBold, ev, buyerRows || [], totalPages);
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { admin, profile } = await requireUser(event);
    if (!profile || profile.user_type !== 'admin') return json(403, { error: 'Admin access required' });

    const { eventId } = JSON.parse(event.body || '{}');
    if (!eventId) return json(400, { error: 'eventId is required' });

    const { data: ev, error: evErr } = await admin.from('events').select('*').eq('slug', eventId).maybeSingle();
    if (evErr) throw evErr;
    if (!ev) return json(404, { error: `Event not found: ${eventId}` });

    // 1. Sold tickets.
    const { data: tickets } = await admin
      .from('tickets')
      .select('id, ticket_ref, buyer_name, buyer_email, buyer_phone, entry_fee_type, total_amount, base_price, late_fee, venue_revenue, app_commission, gateway_fee, status, payout_status, refund_status, payment_method, payment_provider, is_late_purchase, is_scanned, purchase_date, payment_id')
      .eq('event_slug', eventId);

    const sold = (tickets || []).filter((t) => SOLD_STATUSES.includes(t.status));
    const sum = (fn) => sold.reduce((s, t) => s + num(fn(t)), 0);
    const gross = sum((t) => t.total_amount);
    const lateFees = sum((t) => t.late_fee);
    const gatewayFees = sum((t) => t.gateway_fee);
    const commission = sum((t) => t.app_commission);
    const venueRevenue = sum((t) => t.venue_revenue);
    const paidOut = sold.filter((t) => (t.payout_status || 'pending') === 'paid').reduce((s, t) => s + num(t.venue_revenue), 0);
    const pendingPayout = sold.filter((t) => (t.payout_status || 'pending') === 'pending' && t.payout_eligible !== false).reduce((s, t) => s + num(t.venue_revenue), 0);
    const refundedCount = sold.filter((t) => (t.refund_status || 'none') !== 'none' || t.status === 'refunded').length;

    // 2. Refunds + chargebacks.
    const ticketIds = sold.map((t) => t.id);
    let refunds = [];
    if (ticketIds.length) {
      const { data: r1 } = await admin.from('refund_requests').select('*').in('ticket_id', ticketIds);
      const { data: r2 } = await admin.from('refund_requests').select('*').overlaps('ticket_ids', ticketIds);
      const seen = new Set();
      refunds = [...(r1 || []), ...(r2 || [])].filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    }
    const completedRefunds = refunds.filter((r) => DONE_REFUND_STATUSES.includes(r.status));
    const refundAmount = completedRefunds.reduce((s, r) => s + num(r.approved_amount || r.requested_amount), 0);
    const chargebacks = refunds.filter((r) => r.reason_code === 'chargeback');
    const clawbacks = refunds.reduce((s, r) => s + num(r.clawback_amount), 0);

    // 3. Payout records attributable to this event.
    const { data: payoutRows } = await admin.from('payouts').select('*').eq('event_id', eventId);
    const payoutsTotal = (payoutRows || []).filter((p) => (p.status || '') === 'completed').reduce((s, p) => s + num(p.amount), 0);

    const summary = {
      eventId, eventName: ev.name, soldCount: sold.length, gross, lateFees, gatewayFees,
      commission, venueRevenue, paidOut, pendingPayout, refundedCount,
      completedRefunds: completedRefunds.length, refundAmount, clawbacks,
      chargebacks: chargebacks.length, payoutsCount: (payoutRows || []).length, payoutsTotal,
      netToPlatform: commission, netVenueAfterRefunds: venueRevenue - refundAmount + clawbacks,
    };

    // 4. Per-category breakdown (summary page + CSV).
    const feeMap = new Map();
    for (const t of sold) {
      const key = t.entry_fee_type || 'Standard';
      const f = feeMap.get(key) || { name: key, tickets: 0, gross: 0, lateFees: 0, gatewayFees: 0, commission: 0, net: 0 };
      f.tickets += 1;
      f.gross += num(t.total_amount);
      f.lateFees += num(t.late_fee);
      f.gatewayFees += num(t.gateway_fee);
      f.commission += num(t.app_commission);
      f.net += num(t.venue_revenue);
      feeMap.set(key, f);
    }
    const fees = [...feeMap.values()];

    // ── Organiser insights (engagement & retention) ─────────────────────────
    const buyerMap = new Map();
    for (const t of sold) {
      const key = String(t.buyer_email || '').toLowerCase() || `anon-${t.id}`;
      let b = buyerMap.get(key);
      if (!b) { b = { email: key, name: t.buyer_name || '', tickets: 0, spend: 0, scanned: false, late: 0 }; buyerMap.set(key, b); }
      b.tickets += 1;
      b.spend += num(t.total_amount);
      if (t.is_scanned || t.status === 'used') b.scanned = true;
      if (t.is_late_purchase) b.late += 1;
    }
    const uniqueBuyers = buyerMap.size;
    const scannedCount = sold.filter((t) => t.is_scanned || t.status === 'used').length;
    const attendanceRate = sold.length ? Math.round((scannedCount / sold.length) * 100) : 0;
    const lateCount = sold.filter((t) => t.is_late_purchase).length;
    const lateRate = sold.length ? Math.round((lateCount / sold.length) * 100) : 0;

    const realEmails = [...buyerMap.keys()].filter((e) => !e.startsWith('anon-'));
    const crossEvent = new Map();
    if (realEmails.length) {
      const { data: allTickets } = await admin
        .from('tickets')
        .select('buyer_email, event_slug')
        .in('buyer_email', realEmails)
        .limit(10000);
      for (const t of allTickets || []) {
        const k = String(t.buyer_email || '').toLowerCase();
        if (!crossEvent.has(k)) crossEvent.set(k, new Set());
        crossEvent.get(k).add(t.event_slug);
      }
    }
    let returning = 0;
    for (const [email] of buyerMap) {
      const eventsSeen = crossEvent.get(email) || new Set([eventId]);
      if (eventsSeen.size >= 2) returning++;
    }
    const returningRate = uniqueBuyers ? Math.round((returning / uniqueBuyers) * 100) : 0;

    const channelMap = new Map();
    for (const t of sold) {
      const m = t.payment_method || 'unknown';
      channelMap.set(m, (channelMap.get(m) || 0) + 1);
    }

    const orderKeys = new Set(sold.map((t) => `${t.purchase_date}|${t.payment_id || ''}`));
    const orderCount = orderKeys.size || 1;
    const avgOrderValue = Math.round(gross / orderCount);
    const avgTicketsPerOrder = sold.length / orderCount;

    const insights = {
      uniqueBuyers, scannedCount, attendanceRate, lateCount, lateRate,
      returning, returningRate, orderCount, avgOrderValue, avgTicketsPerOrder,
      totalTickets: sold.length, totalRevenue: gross,
      channelMix: [...channelMap.entries()].map(([k, v]) => ({ name: k, count: v })),
      feeBreakdown: fees.map((f) => ({ name: f.name, tickets: f.tickets, sharePct: sold.length ? Math.round((f.tickets / sold.length) * 100) : 0, gross: f.gross })),
    };

    // 5. Complete buyer register (audit-grade): every sold ticket.
    const buyerRows = sold.map((t) => ({
      ref: t.ticket_ref || t.id,
      name: t.buyer_name || '',
      email: t.buyer_email || '',
      phone: t.buyer_phone || '',
      type: t.entry_fee_type || 'Standard',
      method: t.payment_method || 'mobile_money',
    })).sort((a, b) => String(a.ref).localeCompare(String(b.ref)));

    // 6. CSV.
    const header = ['ticket_ref_or_id', 'buyer_name', 'buyer_email', 'buyer_phone', 'entry_fee_type', 'total_amount', 'base_price', 'late_fee', 'app_commission', 'gateway_fee', 'venue_revenue', 'status', 'payout_status', 'refund_status', 'payment_method'];
    const lines = [header.join(',')];
    for (const t of sold) {
      lines.push([t.ticket_ref || t.id, t.buyer_name || '', t.buyer_email || '', t.buyer_phone || '', t.entry_fee_type || '', t.total_amount, t.base_price, t.late_fee, t.app_commission, t.gateway_fee, t.venue_revenue, t.status, t.payout_status || 'pending', t.refund_status || 'none', t.payment_method || ''].map(csvEscape).join(','));
    }
    const csv = lines.join('\n');

    // 7. PDF (summary + insights + buyer register).
    const pdfBase64 = await buildFullPdf(ev, summary, fees, insights, buyerRows);

    /* console.log(`[SalesReport] ${summary.soldCount} tickets, UGX ${gross} gross, ${uniqueBuyers} buyers, PDF ${Math.round(pdfBase64.length * 0.75 / 1024)}KB for ${eventId}`); */

    return json(200, { success: true, eventId, summary, csv, pdfBase64, fees, insights, buyerCount: buyerRows.length });
  } catch (error) {
    console.error('sales-report error', error);
    return json(error.statusCode || 500, { error: error.message || 'Failed to generate report' });
  }
};

module.exports = { handler: exports.handler, buildPdfReport, buildFullPdf };
