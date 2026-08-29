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
async function buildPdfReport(ev, summary, fees) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]); // A4 portrait
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
      page.drawText(c.label.toUpperCase(), { x: cx + (c.align === 'right' ? c.w - 10 : c.align === 'center' ? (c.w - page.widthOfText(c.label.toUpperCase(), helvBold, 8)) / 2 : 10), y: yy + 8, size: 8, font: helvBold, color: WHITE });
      cx += c.w;
    });
  };
  const drawRow = (yy, values, bg) => {
    if (bg) page.drawRectangle({ x: tableX, y: yy, width: W - 96, height: rowH, color: bg });
    let cx = tableX;
    cols.forEach((c, i) => {
      const v = String(values[i]);
      page.drawText(v, { x: cx + (c.align === 'right' ? c.w - 10 - page.widthOfText(v, helv, 9) : c.align === 'center' ? (c.w - page.widthOfText(v, helv, 9)) / 2 : 10), y: yy + 7.5, size: 9, font: helv, color: INK });
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
    page.drawText(v, { x: cx + (c.align === 'right' ? c.w - 10 - page.widthOfText(v, helvBold, 9) : c.align === 'center' ? (c.w - page.widthOfText(v, helvBold, 9)) / 2 : 10), y: y - rowH + 7.5, size: 9, font: helvBold, color: WHITE });
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
  page.drawText('Page 1 of 1', { x: W - 120, y: 16, size: 8, font: helv, color: GRAY });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

function drawRectangleBold(page, x, y, w, h, color) {
  page.drawRectangle({ x, y, width: w, height: h, color });
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

    // 5. CSV.
    const header = ['ticket_ref_or_id', 'buyer_name', 'entry_fee_type', 'total_amount', 'base_price', 'late_fee', 'app_commission', 'gateway_fee', 'venue_revenue', 'status', 'payout_status', 'refund_status'];
    const lines = [header.join(',')];
    for (const t of sold) {
      lines.push([t.ticket_ref || t.id, t.buyer_name || '', t.entry_fee_type || '', t.total_amount, t.base_price, t.late_fee, t.app_commission, t.gateway_fee, t.venue_revenue, t.status, t.payout_status || 'pending', t.refund_status || 'none'].map(csvEscape).join(','));
    }
    const csv = lines.join('\n');

    // 6. PDF (professional branded report).
    const pdfBase64 = await buildPdfReport(ev, summary, fees);

    console.log(`[SalesReport] ${summary.soldCount} tickets, UGX ${gross} gross, PDF ${Math.round(pdfBase64.length * 0.75 / 1024)}KB for ${eventId}`);

    return json(200, { success: true, eventId, summary, csv, pdfBase64, fees });
  } catch (error) {
    console.error('sales-report error', error);
    return json(error.statusCode || 500, { error: error.message || 'Failed to generate report' });
  }
};
