// netlify/functions/sales-report.js
//
// Phase 3 (3.3): per-event sales & reconciliation report (admin only).
// Returns a JSON summary and a CSV string covering: tickets sold, gross,
// late fees, gateway fees, platform commission (15%), net venue revenue,
// refunds (count + amount + clawbacks), chargebacks, and payouts made.
//
// POST { eventId } → { success, event, summary, csv }

const { requireUser, json } = require('../shared/supabaseAdmin');

const SOLD_STATUSES = ['active', 'used', 'pending'];
const DONE_REFUND_STATUSES = ['completed'];

function num(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { admin, profile } = await requireUser(event);
    if (!profile || profile.user_type !== 'admin') return json(403, { error: 'Admin access required' });

    const { eventId, format } = JSON.parse(event.body || '{}');
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
    const gross = sold.reduce((s, t) => s + num(t.total_amount), 0);
    const lateFees = sold.reduce((s, t) => s + num(t.late_fee), 0);
    const gatewayFees = sold.reduce((s, t) => s + num(t.gateway_fee), 0);
    const commission = sold.reduce((s, t) => s + num(t.app_commission), 0);
    const venueRevenue = sold.reduce((s, t) => s + num(t.venue_revenue), 0);
    const paidOut = sold.filter((t) => (t.payout_status || 'pending') === 'paid')
      .reduce((s, t) => s + num(t.venue_revenue), 0);
    const pendingPayout = sold.filter((t) => (t.payout_status || 'pending') === 'pending' && t.payout_eligible !== false)
      .reduce((s, t) => s + num(t.venue_revenue), 0);
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
    const payoutsTotal = (payoutRows || []).filter((p) => (p.status || '') === 'completed')
      .reduce((s, p) => s + num(p.amount), 0);

    const summary = {
      eventId,
      eventName: ev.name,
      soldCount: sold.length,
      gross,
      lateFees,
      gatewayFees,
      commission,
      venueRevenue,
      paidOut,
      pendingPayout,
      refundedCount,
      completedRefunds: completedRefunds.length,
      refundAmount,
      clawbacks,
      chargebacks: chargebacks.length,
      payoutsCount: (payoutRows || []).length,
      payoutsTotal,
      netToPlatform: commission,
      netVenueAfterRefunds: venueRevenue - refundAmount + clawbacks,
    };

    // 4. CSV (one row per sold ticket + a summary row).
    const header = [
      'ticket_ref_or_id', 'buyer_name', 'entry_fee_type', 'total_amount', 'base_price',
      'late_fee', 'app_commission', 'gateway_fee', 'venue_revenue', 'status',
      'payout_status', 'refund_status',
    ];
    const lines = [header.join(',')];
    for (const t of sold) {
      lines.push([
        t.ticket_ref || t.id, t.buyer_name || '', t.entry_fee_type || '',
        t.total_amount, t.base_price, t.late_fee, t.app_commission, t.gateway_fee,
        t.venue_revenue, t.status, t.payout_status || 'pending', t.refund_status || 'none',
      ].map(csvEscape).join(','));
    }
    const csv = [lines.join('\n'), '', `SUMMARY,,,${summary.gross},,,,,${summary.venueRevenue},,,\n`,].join('');

    if (format === 'csv') {
      return json(200, { success: true, eventId, summary, csv });
    }
    return json(200, { success: true, eventId, summary, csv });
  } catch (error) {
    console.error('sales-report error', error);
    return json(error.statusCode || 500, { error: error.message || 'Failed to generate report' });
  }
};
