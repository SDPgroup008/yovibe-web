// netlify/functions/payout.js
//
// Phase 3 (3.1 / 3.2 / 3.4): server-side payout engine.
//
// The client previously initiated the provider payout AND marked tickets "paid"
// itself (OrganiserDashboardScreen / AdminWithdrawalsScreen). This function
// makes the money-out path authoritative:
//
//   eligibility — server-verified per-ticket payout eligibility + amount.
//   execute     — OTP verification → authoritative eligibility → server-computed
//                 amount → provider submission → tickets marked paid/pending_review
//                 → payout record. Recipient details are persisted to the
//                 event's payout_config (3.1) so payouts stop relying on
//                 free-text UI input.
//
// OTPs are created + emailed by the deployed Supabase edge function
// (send-payout-otp) and verified HERE against the payout_otps table (marked
// used server-side, never trusted from the client).

const { requireUser, json } = require('../shared/supabaseAdmin');
const { ticketIsPayable } = require('../shared/payoutRules');

const ACTIVE_REFUND_STATES = ['pending_admin_review', 'approved', 'processing', 'submitted', 'completed', 'needs_attention'];

function siteBase() {
  return process.env.SITE_URL || process.env.URL || 'https://yovibe.net';
}

function amountNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function verifyOtp(admin, authUserId, otpCode) {
  if (!otpCode || !String(otpCode).trim()) {
    throw Object.assign(new Error('OTP code is required'), { statusCode: 400 });
  }
  const { data, error } = await admin
    .from('payout_otps')
    .select('*')
    .eq('user_id', authUserId)
    .eq('otp', String(otpCode).trim())
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error('Invalid or expired OTP code'), { statusCode: 401 });
  const { error: markError } = await admin.from('payout_otps').update({ used: true }).eq('id', data.id);
  if (markError) throw markError;
  return data;
}

// Authoritative per-ticket payout eligibility is in shared/payoutRules.js
// (ticketIsPayable) — refunded or in-refund tickets can never be paid out.

async function loadTickets(admin, ticketIds) {
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    throw Object.assign(new Error('No tickets provided'), { statusCode: 400 });
  }
  const { data, error } = await admin.from('tickets').select('*').in('id', ticketIds);
  if (error) throw error;
  return data || [];
}

async function findActiveRefunds(admin, ticketIds) {
  if (!ticketIds.length) return [];
  const { data: byTicketId } = await admin
    .from('refund_requests')
    .select('id, ticket_id')
    .in('ticket_id', ticketIds)
    .in('status', ACTIVE_REFUND_STATES);
  const { data: byTicketIds } = await admin
    .from('refund_requests')
    .select('id, ticket_ids')
    .overlaps('ticket_ids', ticketIds)
    .in('status', ACTIVE_REFUND_STATES);
  return [...(byTicketId || []), ...(byTicketIds || [])];
}

function buildRecipient(event, requested) {
  // 3.1: prefer the event's configured payout account; fall back to the
  // request's details (and persist them for next time in execute).
  const cfg = event && event.payout_config && typeof event.payout_config === 'object' ? event.payout_config : {};
  if (cfg.method && cfg.name) {
    return {
      method: cfg.method,
      name: cfg.name,
      phoneNumber: cfg.phoneNumber,
      provider: cfg.provider,
      bankName: cfg.bankName,
      accountNumber: cfg.accountNumber,
    };
  }
  return requested;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }
  const action = body.action || 'execute';
  if (!['execute', 'eligibility'].includes(action)) return json(400, { error: `Unknown action: ${action}` });

  try {
    const { admin, authUser, profile } = await requireUser(event);
    const isAdmin = profile && profile.user_type === 'admin';

    // ── eligibility ─────────────────────────────────────────────────────────
    if (action === 'eligibility') {
      const tickets = await loadTickets(admin, body.ticketIds);
      const payable = tickets.filter(ticketIsPayable);
      const amount = Math.round(payable.reduce((s, t) => s + Number(t.venue_revenue || 0), 0) * 100) / 100;
      return json(200, {
        success: true,
        eligibleCount: payable.length,
        total: tickets.length,
        amount,
        eligibleTicketIds: payable.map((t) => t.id),
        excluded: tickets.filter((t) => !ticketIsPayable(t)).map((t) => ({
          id: t.id, reason: `${t.status}/${t.payout_status}/${t.refund_status || 'none'}`,
        })),
      });
    }

    // ── execute ────────────────────────────────────────────────────────────
    const otpCode = body.otpCode;
    const payoutMethod = body.payoutMethod || 'mobile_money';
    const requestedRecipient = body.recipientDetails || {};
    if (payoutMethod !== 'mobile_money' && payoutMethod !== 'bank_transfer') {
      return json(422, { error: 'payoutMethod must be mobile_money or bank_transfer' });
    }

    // 1. OTP — verified + consumed server-side.
    await verifyOtp(admin, authUser.id, otpCode);

    // 2. Load tickets + authoritative eligibility (refund-aware).
    const tickets = await loadTickets(admin, body.ticketIds);
    const payable = tickets.filter(ticketIsPayable);
    if (payable.length === 0) return json(409, { error: 'None of the selected tickets are eligible for payout' });
    const payableIds = payable.map((t) => t.id);
    const activeRefunds = await findActiveRefunds(admin, payableIds);
    if (activeRefunds.length > 0) {
      return json(409, { error: 'Some selected tickets have active refunds and cannot be paid out' });
    }

    // 3. Server-computed amount (never trust the client's number).
    const serverAmount = Math.round(payable.reduce((s, t) => s + Number(t.venue_revenue || 0), 0) * 100) / 100;
    if (serverAmount <= 0) return json(409, { error: 'Payout amount is zero' });
    const clientAmount = amountNumber(body.amount);
    if (clientAmount > 0 && Math.abs(clientAmount - serverAmount) > 1) {
      return json(409, { error: `Payout amount mismatch (server: UGX ${serverAmount.toLocaleString()}). Refresh and retry.` });
    }

    // 4. Ownership + event + recipient (3.1).
    const { data: firstTicket } = await admin.from('tickets').select('event_slug').eq('id', payableIds[0]).single();
    const eventId = firstTicket ? firstTicket.event_slug : null;
    // NOTE: named `payoutEvent` — the handler parameter is already `event`, and
    // a block-scoped `let event` here hoists over the whole try (binding every
    // earlier `event` reference to it → "Cannot access 'event2' before init").
    let payoutEvent = null;
    if (eventId) {
      const ev = await admin.from('events').select('*').eq('slug', eventId).maybeSingle();
      payoutEvent = ev.data || null;
      if (!isAdmin) {
        const ownerOk = payoutEvent && (
          String(payoutEvent.created_by || '') === String(authUser.id) ||
          String(payoutEvent.created_by_auth || '') === String(authUser.id)
        );
        if (!ownerOk) {
          return json(403, { error: 'You do not own this event' });
        }
      }
    }

    const recipient = buildRecipient(payoutEvent, {
      method: payoutMethod,
      name: requestedRecipient.name,
      phoneNumber: requestedRecipient.phoneNumber,
      provider: requestedRecipient.provider,
      bankName: requestedRecipient.bankName,
      accountNumber: requestedRecipient.accountNumber,
    });
    if (!recipient.name) return json(422, { error: 'Recipient name is required' });

    // 5. Persist the recipient as the event's default payout config (3.1).
    let persistedConfig = false;
    if (payoutEvent && recipient.method && recipient.name) {
      const configUpdate = {
        method: recipient.method,
        name: recipient.name,
        phoneNumber: recipient.phoneNumber || null,
        provider: recipient.provider || null,
        bankName: recipient.bankName || null,
        accountNumber: recipient.accountNumber || null,
      };
      const { error: cfgError } = await admin.from('events').update({ payout_config: configUpdate }).eq('slug', payoutEvent.slug);
      if (!cfgError) persistedConfig = true;
    }

    // 6. Submit to the provider (mobile money → PawaPay; bank → admin review).
    let payoutId = null;
    let transactionReference = null;
    let payoutStatus = 'completed';
    let ticketsUpdate;
    if (payoutMethod === 'mobile_money') {
      if (!recipient.phoneNumber || !recipient.provider) {
        return json(422, { error: 'Phone number and provider are required for mobile money payouts' });
      }
      const providerResponse = await fetch(`${siteBase()}/.netlify/functions/create-pawapay-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: serverAmount, currency: 'UGX',
          phoneNumber: recipient.phoneNumber, provider: recipient.provider,
        }),
      });
      const providerData = await providerResponse.json().catch(() => ({}));
      if (!providerResponse.ok || !providerData.success) {
        return json(502, { error: providerData.error || 'PawaPay payout initiation failed' });
      }
      payoutId = providerData.payoutId;
      transactionReference = providerData.payoutId;
      ticketsUpdate = { payout_status: 'paid', payout_date: new Date().toISOString(), payout_eligible: false };
    } else {
      // Bank transfers go through admin review (matching the existing flow).
      payoutStatus = 'pending_admin_review';
      ticketsUpdate = { payout_status: 'pending_review', payout_eligible: false };
    }

    // 7. Mark tickets + record the payout.
    const { error: ticketError } = await admin.from('tickets').update(ticketsUpdate).in('id', payableIds);
    if (ticketError) throw ticketError;

    const payoutRow = {
      organizer_id: payoutEvent && payoutEvent.created_by ? String(payoutEvent.created_by) : (profile && profile.uid ? profile.uid : authUser.id),
      ticket_ids: payableIds,
      amount: serverAmount,
      status: payoutStatus,
      payout_method: payoutMethod,
      recipient_name: recipient.name,
      recipient_phone_number: payoutMethod === 'mobile_money' ? recipient.phoneNumber : null,
      metadata: payoutMethod === 'bank_transfer' ? { bank_name: recipient.bankName, account_number: recipient.accountNumber } : { provider: recipient.provider },
      transaction_reference: transactionReference,
      processed_date: payoutStatus === 'completed' ? new Date().toISOString() : null,
      event_id: eventId,
      admin_note: persistedConfig ? 'payout_config persisted' : null,
    };
    const { data: payout, error: payoutError } = await admin.from('payouts').insert(payoutRow).select('*').single();
    if (payoutError) throw payoutError;

    console.log(`[Payout] ${payoutMethod} ${payoutStatus} for ${payableIds.length} tickets, UGX ${serverAmount}, id=${payout.id}`);

    return json(200, {
      success: true,
      payoutId: payout.id,
      providerPayoutId: payoutId,
      transactionReference,
      amount: serverAmount,
      ticketIds: payableIds,
      status: payoutStatus,
    });
  } catch (error) {
    console.error('[Payout] Error:', error.message);
    return json(error.statusCode || 500, { success: false, error: error.message || 'Payout failed' });
  }
};

module.exports = { handler: exports.handler, ticketIsPayable };
