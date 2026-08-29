// netlify/functions/sales-report.js
//
// Phase 3 (3.3): per-event sales & reconciliation report (admin only).
// Returns a JSON summary, a CSV string, AND a professionally formatted PDF
// (base64) covering: tickets sold, gross, late fees, gateway fees, platform
// commission (15%), net venue revenue, refunds (count + amount + clawbacks),
// chargebacks, and payouts made.
//
// POST { eventId } → { success, event, summary, csv, pdfBase64 }

const { requireUser, json } = require('../shared/supabaseAdmin');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const SOLD_STATUSES = ['active', 'used', 'pending'];
const DONE_REFUND_STATUSES = ['completed'];

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

// ─── PDF report builder ───────────────────────────────────────────────────────
function drawPage1(doc, page, helv, helvBold, ev, summary, fees) {
  const W = 595.28;
  let y = 841.89;

  // Header band
  page.drawRectangle({ x: 0, y: y - 104, width: W, height: 104, color: DARK });
  page.drawText('YoVibe', { x: 48, y: y - 62, size: 26, font: helvBold, color: WHITE });
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
  drawRow(y - rowH, ['TOTAL', String(summary.soldCount), fmtUGX(summary.gross), fmtUGX(summary.lateFees), fmtUGX(summary.gatewayFees), fmtUGX(summary.commission), fmtUGX(summary.venueRevenue)], undefined);
  drawRectangleBold(page, tableX, y - rowH, W - 96, rowH, DARK);
  // Redraw total row text in white on dark
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
    ['Clawbacks recovered (paid-then-refunded)', String(summary.clawbacks > 0 ? `UGX ${summary.clawbacks.toLocaleString()}` : '—'), ''],
    ['Chargebacks', String(summary.chargebacks), ''],
    ['Payout records', String(summary.payoutsCount), fmtUGX(summary.payoutsTotal)],
    ['Pending payout (eligible, unpaid)', '', fmtUGX(summary.pendingPayout)],
  ];
  lines.forEach(([label, mid, val], i) => {
    page.drawText(label, { x: 48, y, size: 9.5, font: helv, color: INK });
    if (mid) page.drawText(mid, { x: 300, y, size: 9.5, font: helv, color: GRAY });
    if (val) page.drawText(val, { x: W - 200, y, size: 9.5, font: helvBold, color: INK });
    y -= 17;
  });

  // Footer
  page.drawRectangle({ x: 0, y: 28, width: W, height: 1.2, color: LINE });
  page.drawText('Generated by YoVibe • yovibe.net • support@yovibe.net', { x: 48, y: 16, size: 8, font: helv, color: GRAY });
  page.drawText('Page 1 of 2', { x: W - 120, y: 16, size: 8, font: helv, color: GRAY });
}

function drawRectangleBold(page, x, y, w, h, color) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

async function buildPdfReport(ev, summary, fees) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  drawPage1(doc, page, helv, helvBold, ev, summary, fees);
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

// ─── Organiser Insights page (benchmarked vs Eventbrite / Ticketmaster / Splash) ─
function drawHBar(page, helv, helvBold, x, y, label, count, total, maxCount, barColor) {
  const barMax = 200;
  const w = maxCount > 0 ? Math.max(6, Math.round((count / maxCount) * barMax)) : 0;
  const pct = total ? Math.round((count / total) * 100) : 0;
  page.drawText(label, { x, y, size: 8.5, font: helv, color: INK });
  page.drawRectangle({ x: x + 110, y: y - 4, width: barMax, height: 7, color: CARD_BG });
  page.drawRectangle({ x: x + 110, y: y - 4, width: w, height: 7, color: barColor || ACCENT });
  page.drawText(`${count}`, { x: x + 110 + barMax + 8, y: y - 4, size: 8.5, font: helvBold, color: INK });
  page.drawText(`${pct}%`, { x: x + 110 + barMax + 40, y: y - 4, size: 8.5, font: helv, color: GRAY });
}

function drawPage2(doc, page, helv, helvBold, ev, summary, fees, insights) {
  const W = 595.28;
  let y = 841.89;

  // Header band
  page.drawRectangle({ x: 0, y: y - 84, width: W, height: 84, color: DARK });
  page.drawText('YoVibe', { x: 48, y: y - 52, size: 24, font: helvBold, color: WHITE });
  page.drawText('ORGANISER INSIGHTS', { x: 48, y: y - 74, size: 12, font: helvBold, color: ACCENT });
  page.drawText('Eventbrite / Ticketmaster / Splash-style organiser analytics', { x: W - 300, y: y - 52, size: 8, font: helv, color: rgb(0.7, 0.7, 0.75) });
  page.drawText(String(ev.name || '').toUpperCase(), { x: W - 300, y: y - 68, size: 8, font: helvBold, color: rgb(0.85, 0.85, 0.9) });
  y -= 108;

  // KPI tiles: attendance, returning buyers, avg order value, tickets/order
  const tiles = [
    ['ATTENDANCE / REDEMPTION', `${insights.scannedCount}/${insights.totalTickets} · ${insights.attendanceRate}%`],
    ['RETURNING BUYERS', `${insights.returning}/${insights.uniqueBuyers} · ${insights.returningRate}%`],
    ['AVG ORDER VALUE', fmtUGX(insights.avgOrderValue)],
    ['AVG TICKETS / ORDER', insights.avgTicketsPerOrder.toFixed(1)],
  ];
  const tileW = (W - 96 - 18) / 2;
  const tileH = 46;
  tiles.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 48 + col * (tileW + 18);
    const cy = y - row * (tileH + 12) - tileH;
    page.drawRectangle({ x, y: cy, width: tileW, height: tileH, color: CARD_BG, borderColor: LINE, borderWidth: 1 });
    page.drawText(label, { x: x + 12, y: cy + tileH - 18, size: 7.5, font: helvBold, color: GRAY });
    page.drawText(value, { x: x + 12, y: cy + 10, size: 12, font: helvBold, color: INK });
  });
  y -= 2 * (tileH + 12) + 24;

  // Sales over time (mini bar chart)
  page.drawText('SALES OVER TIME (DAILY GROSS)', { x: 48, y, size: 10, font: helvBold, color: DARK });
  y -= 12;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1, color: ACCENT });
  y -= 16;
  const daily = insights.daily || [];
  if (daily.length) {
    const maxAmt = Math.max(...daily.map((d) => d.amount), 1);
    const barW = (W - 96) / Math.min(daily.length, 14) - 4;
    daily.forEach((d, i) => {
      const h = Math.max(4, Math.round((d.amount / maxAmt) * 70));
      const x = 48 + i * ((W - 96) / Math.min(daily.length, 14));
      page.drawRectangle({ x: x + 2, y: y - h, width: Math.max(4, barW), height: h, color: ACCENT });
      page.drawText(String(d.amount).slice(0, 4), { x: x + 2, y: y - h - 9, size: 6, font: helv, color: GRAY });
    });
    y -= 96;
  } else {
    page.drawText('No sales recorded', { x: 48, y, size: 9, font: helv, color: GRAY });
    y -= 20;
  }

  // Ticket-type share
  page.drawText('TICKET TYPE SHARE', { x: 48, y, size: 10, font: helvBold, color: DARK });
  y -= 12;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1, color: ACCENT });
  y -= 20;
  const maxFee = Math.max(...(insights.feeBreakdown || []).map((f) => f.tickets), 1);
  (insights.feeBreakdown || []).forEach((f) => {
    drawHBar(page, helv, helvBold, 48, y, f.name, f.tickets, insights.totalTickets, maxFee);
    y -= 18;
  });
  y -= 14;

  // Purchase channel mix
  page.drawText('PURCHASE CHANNELS', { x: 48, y, size: 10, font: helvBold, color: DARK });
  y -= 12;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1, color: ACCENT });
  y -= 20;
  const channelTotal = (insights.channelMix || []).reduce((s, c) => s + c.count, 0) || 1;
  const maxChan = Math.max(...(insights.channelMix || []).map((c) => c.count), 1);
  const channelLabel = (m) => (m === 'mobile_money' ? 'Mobile Money' : m === 'credit_card' ? 'Card' : m === 'bank_transfer' ? 'Bank Transfer' : m || 'Other');
  (insights.channelMix || []).forEach((c) => {
    drawHBar(page, helv, helvBold, 48, y, channelLabel(c.name), c.count, channelTotal, maxChan, rgb(0.11, 0.6, 0.6));
    y -= 18;
  });

  // Demographics + engagement (two-column rows)
  y -= 8;
  const colX = 48;
  page.drawText('BUYER DEMOGRAPHICS', { x: colX, y, size: 10, font: helvBold, color: DARK });
  y -= 14;
  const domainTotal = (insights.domainSplit || []).reduce((s, d) => s + d.count, 0) || 1;
  const maxDom = Math.max(...(insights.domainSplit || []).map((d) => d.count), 1);
  (insights.domainSplit || []).forEach((d) => {
    drawHBar(page, helv, helvBold, colX, y, `Email · ${d.name}`, d.count, domainTotal, maxDom, rgb(0.55, 0.4, 0.9));
    y -= 18;
  });
  (insights.providerMix || []).forEach((p) => {
    drawHBar(page, helv, helvBold, colX, y, `Network · ${p.name}`, p.count, insights.totalTickets || 1, Math.max(...(insights.providerMix || []).map((x) => x.count), 1), rgb(0.2, 0.55, 0.3));
    y -= 18;
  });
  y -= 8;

  // Engagement + recommendations
  page.drawText('ENGAGEMENT & RECOMMENDATIONS', { x: 48, y, size: 10, font: helvBold, color: DARK });
  y -= 12;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1, color: ACCENT });
  y -= 18;
  const engagementRows = [
    ['Early purchases', `${insights.totalTickets - insights.lateCount}`, `${insights.totalTickets ? Math.round(((insights.totalTickets - insights.lateCount) / insights.totalTickets) * 100) : 0}%`],
    ['Late-fee purchases', `${insights.lateCount}`, `${insights.lateRate}%`],
    ['Scanned / attended', `${insights.scannedCount}`, `${insights.attendanceRate}%`],
    ['Refunded tickets', `${summary.refundedCount}`, ''],
  ];
  engagementRows.forEach(([label, mid, val]) => {
    page.drawText(label, { x: 48, y, size: 9, font: helv, color: INK });
    page.drawText(mid, { x: 300, y, size: 9, font: helvBold, color: INK });
    if (val) page.drawText(val, { x: W - 200, y, size: 9, font: helvBold, color: ACCENT });
    y -= 16;
  });
  y -= 4;

  const recs = [];
  if (insights.attendanceRate < 60) recs.push('Redemption is below 60% — send a reminder to ticket holders 24h before the event.');
  if (insights.returningRate < 20) recs.push('Returning-buyer rate is under 20% — run a post-event re-engagement campaign to convert first-timers.');
  if (insights.lateRate > 40) recs.push('Over 40% bought at the late-fee rate — introduce earlier-bird tiers or countdown pricing.');
  const mmShare = ((insights.channelMix || []).find((c) => c.name === 'mobile_money') || { count: 0 }).count / (insights.totalTickets || 1);
  if (mmShare > 0.8) recs.push('Mobile-money share is very high — test card incentives (fees or checkout offers) to balance channels.');
  if (!recs.length) recs.push('Healthy metrics across the board — keep the current pricing, cadence, and channel mix.');
  recs.forEach((r) => {
    page.drawText(`• ${r}`, { x: 52, y, size: 8.5, font: helv, color: INK, maxWidth: W - 120 });
    y -= 15;
  });
  y -= 6;

  // Top buyers table
  page.drawText('TOP BUYERS BY SPEND', { x: 48, y, size: 10, font: helvBold, color: DARK });
  y -= 12;
  page.drawRectangle({ x: 48, y, width: W - 96, height: 1, color: ACCENT });
  y -= 18;
  page.drawText('BUYER', { x: 60, y, size: 8, font: helvBold, color: GRAY });
  page.drawText('TICKETS', { x: 300, y, size: 8, font: helvBold, color: GRAY });
  page.drawText('SPEND', { x: W - 170, y, size: 8, font: helvBold, color: GRAY });
  y -= 14;
  (insights.topBuyers || []).forEach((b) => {
    page.drawText(String(b.name || '').slice(0, 30), { x: 60, y, size: 9, font: helv, color: INK });
    page.drawText(String(b.tickets), { x: 300, y, size: 9, font: helv, color: INK });
    page.drawText(fmtUGX(b.spend), { x: W - 170, y, size: 9, font: helvBold, color: INK });
    y -= 16;
  });

  // Footer
  page.drawRectangle({ x: 0, y: 28, width: W, height: 1.2, color: LINE });
  page.drawText('Generated by YoVibe • yovibe.net • support@yovibe.net', { x: 48, y: 16, size: 8, font: helv, color: GRAY });
  page.drawText('Page 2 of 2', { x: W - 120, y: 16, size: 8, font: helv, color: GRAY });
}

async function buildFullPdf(ev, summary, fees, insights) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page1 = doc.addPage([595.28, 841.89]);
  drawPage1(doc, page1, helv, helvBold, ev, summary, fees);
  const page2 = doc.addPage([595.28, 841.89]);
  drawPage2(doc, page2, helv, helvBold, ev, summary, fees, insights);
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
      .select('id, entry_fee_type, total_amount, base_price, late_fee, venue_revenue, app_commission, gateway_fee, status, payout_status, refund_status')
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

    // 4. Per-category breakdown (for the PDF table + CSV).
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

    // ── Organiser insights (benchmarked vs Eventbrite / Ticketmaster / Splash) ─
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

    // Returning-buyer detection: how many of these buyers have bought at 2+
    // distinct events across the platform (retention metric).
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
    for (const [email, b] of buyerMap) {
      const eventsSeen = crossEvent.get(email) || new Set([eventId]);
      if (eventsSeen.size >= 2) returning++;
    }
    const returningRate = uniqueBuyers ? Math.round((returning / uniqueBuyers) * 100) : 0;

    // Purchase-channel mix (payment method + provider).
    const channelMap = new Map();
    const providerMap = new Map();
    for (const t of sold) {
      const m = t.payment_method || 'unknown';
      channelMap.set(m, (channelMap.get(m) || 0) + 1);
      const p = String(t.payment_provider || 'other')
        .replace('_MOMO_UGA', '').replace('_OAPI_UGA', '').replace('_UGA', '') || 'other';
      providerMap.set(p, (providerMap.get(p) || 0) + 1);
    }

    // Buyer demographics — email domain split (provider of record).
    const domainMap = new Map();
    for (const [email] of buyerMap) {
      if (email.startsWith('anon-')) continue;
      const d = String(email).split('@')[1] || 'unknown';
      const label = /gmail/i.test(d) ? 'Gmail'
        : /yahoo|ymail|rocketmail/i.test(d) ? 'Yahoo'
        : /outlook|hotmail|live|msn/i.test(d) ? 'Outlook/Hotmail'
        : /\.ug$/.test(d) ? 'Local (.ug)' : 'Other';
      domainMap.set(label, (domainMap.get(label) || 0) + 1);
    }

    // Sales over time (daily gross, last 14 sale days) — trend line practice.
    const dailyMap = new Map();
    for (const t of sold) {
      const d = t.purchase_date ? new Date(t.purchase_date).toISOString().slice(0, 10) : 'unknown';
      dailyMap.set(d, (dailyMap.get(d) || 0) + num(t.total_amount));
    }
    const daily = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);

    // Top buyers by spend.
    const topBuyers = [...buyerMap.values()].sort((a, b) => b.spend - a.spend).slice(0, 5)
      .map((b) => ({ name: b.name || b.email, tickets: b.tickets, spend: b.spend }));

    // Order economics (approximate: distinct purchase_date+payment_id).
    const orderKeys = new Set(sold.map((t) => `${t.purchase_date}|${t.payment_id || ''}`));
    const orderCount = orderKeys.size || 1;
    const avgOrderValue = Math.round(gross / orderCount);
    const avgTicketsPerOrder = sold.length / orderCount;

    const insights = {
      uniqueBuyers, scannedCount, attendanceRate, lateCount, lateRate,
      returning, returningRate, orderCount, avgOrderValue, avgTicketsPerOrder,
      totalTickets: sold.length, totalRevenue: gross,
      channelMix: [...channelMap.entries()].map(([k, v]) => ({ name: k, count: v })),
      providerMix: [...providerMap.entries()].map(([k, v]) => ({ name: k, count: v })),
      domainSplit: [...domainMap.entries()].map(([k, v]) => ({ name: k, count: v })),
      daily: daily.map(([date, amount]) => ({ date, amount })),
      topBuyers,
      feeBreakdown: fees.map((f) => ({
        name: f.name, tickets: f.tickets,
        sharePct: sold.length ? Math.round((f.tickets / sold.length) * 100) : 0,
        gross: f.gross,
      })),
    };

    // 5. CSV.
    const header = ['ticket_ref_or_id', 'buyer_name', 'entry_fee_type', 'total_amount', 'base_price', 'late_fee', 'app_commission', 'gateway_fee', 'venue_revenue', 'status', 'payout_status', 'refund_status'];
    const lines = [header.join(',')];
    for (const t of sold) {
      lines.push([t.ticket_ref || t.id, t.buyer_name || '', t.entry_fee_type || '', t.total_amount, t.base_price, t.late_fee, t.app_commission, t.gateway_fee, t.venue_revenue, t.status, t.payout_status || 'pending', t.refund_status || 'none'].map(csvEscape).join(','));
    }
    const csv = lines.join('\n');

    // 6. PDF (professional branded report + organiser insights page).
    const pdfBase64 = await buildFullPdf(ev, summary, fees, insights);

    console.log(`[SalesReport] ${summary.soldCount} tickets, UGX ${gross} gross, ${insights.uniqueBuyers} buyers, PDF ${Math.round(pdfBase64.length * 0.75 / 1024)}KB for ${eventId}`);

    return json(200, { success: true, eventId, summary, csv, pdfBase64, fees, insights });
  } catch (error) {
    console.error('sales-report error', error);
    return json(error.statusCode || 500, { error: error.message || 'Failed to generate report' });
  }
};

module.exports = { handler: exports.handler, buildPdfReport, buildFullPdf };
