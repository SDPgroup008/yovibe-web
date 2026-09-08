// Organizer-initiated, OTP-gated payout engine.
// Mobile-money proceeds are submitted directly to PawaPay. Card proceeds are
// queued for an administrator to review and submit to PesaPal.

const crypto = require('crypto');
const { requireUser, json } = require('../shared/supabaseAdmin');
const { ticketIsPayable } = require('../shared/payoutRules');
const { submitPawaPayPayout } = require('./create-pawapay-payout');
const { otpMatches } = require('../shared/payoutOtp');

const ACTIVE_REFUND_STATES = ['pending_admin_review', 'approved', 'processing', 'submitted', 'completed', 'needs_attention'];

function amountNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function verifyOtp(admin, authUserId, otpCode) {
  if (!otpCode || !String(otpCode).trim()) {
    throw Object.assign(new Error('OTP code is required'), { statusCode: 400 });
  }
  const { data, error } = await admin.from('payout_otps').select('*')
    .eq('user_id', authUserId).eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || !otpMatches(authUserId, otpCode, data.otp)) {
    throw Object.assign(new Error('Invalid or expired OTP code'), { statusCode: 401 });
  }
  return data;
}

async function consumeOtp(admin, otpId) {
  const { data, error } = await admin.from('payout_otps').update({ used: true })
    .eq('id', otpId).eq('used', false).select('id');
  if (error) throw error;
  if (!data || data.length !== 1) {
    throw Object.assign(new Error('OTP code has already been used'), { statusCode: 409 });
  }
}

async function loadTickets(admin, ticketIds) {
  const uniqueIds = Array.isArray(ticketIds) ? [...new Set(ticketIds.filter(Boolean).map(String))] : [];
  if (!uniqueIds.length) throw Object.assign(new Error('No tickets provided'), { statusCode: 400 });
  const { data, error } = await admin.from('tickets').select('*').in('id', uniqueIds);
  if (error) throw error;
  if (!data || data.length !== uniqueIds.length) {
    throw Object.assign(new Error('One or more selected tickets do not exist'), { statusCode: 404 });
  }
  return data;
}

async function loadAuthorizedEvent(admin, tickets, authUser, profile, isAdmin) {
  const eventIds = [...new Set(tickets.map((ticket) => ticket.event_slug).filter(Boolean))];
  if (eventIds.length !== 1) {
    throw Object.assign(new Error('All selected tickets must belong to the same event'), { statusCode: 422 });
  }
  const { data: payoutEvent, error } = await admin.from('events').select('*').eq('slug', eventIds[0]).maybeSingle();
  if (error) throw error;
  if (!payoutEvent) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  if (!isAdmin) {
    const ownerIds = [authUser.id, profile?.uid, profile?.id].filter(Boolean).map(String);
    const ownsEvent = ownerIds.includes(String(payoutEvent.created_by || '')) ||
      ownerIds.includes(String(payoutEvent.created_by_auth || ''));
    if (!ownsEvent) throw Object.assign(new Error('You do not own this event'), { statusCode: 403 });
  }
  return payoutEvent;
}

async function findActiveRefunds(admin, ticketIds) {
  const { data: byTicketId, error: singleError } = await admin.from('refund_requests').select('id')
    .in('ticket_id', ticketIds).in('status', ACTIVE_REFUND_STATES);
  if (singleError) throw singleError;
  const { data: byTicketIds, error: batchError } = await admin.from('refund_requests').select('id')
    .overlaps('ticket_ids', ticketIds).in('status', ACTIVE_REFUND_STATES);
  if (batchError) throw batchError;
  return [...(byTicketId || []), ...(byTicketIds || [])];
}

function buildRecipient(payoutEvent, requested) {
  // The current request is authoritative because the organizer has just
  // re-authenticated by email OTP. It is persisted for audit/default display.
  return requested;
}

async function releaseTickets(admin, ticketIds, currentStatus) {
  await admin.from('tickets').update({ payout_status: 'pending', payout_eligible: true })
    .in('id', ticketIds).eq('payout_status', currentStatus).eq('status', 'used')
    .eq('is_scanned', true).eq('refund_status', 'none');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON body' }); }
  const action = body.action || 'execute';
  if (!['execute', 'eligibility'].includes(action)) return json(400, { error: `Unknown action: ${action}` });

  try {
    const { admin, authUser, profile } = await requireUser(event);
    const isAdmin = profile?.user_type === 'admin';
    const tickets = await loadTickets(admin, body.ticketIds);
    const payoutEvent = await loadAuthorizedEvent(admin, tickets, authUser, profile, isAdmin);

    if (action === 'eligibility') {
      const payable = tickets.filter(ticketIsPayable);
      const amount = amountNumber(payable.reduce((sum, ticket) => sum + Number(ticket.venue_revenue || 0), 0));
      return json(200, {
        success: true, eligibleCount: payable.length, total: tickets.length, amount,
        eligibleTicketIds: payable.map((ticket) => ticket.id),
        excluded: tickets.filter((ticket) => !ticketIsPayable(ticket)).map((ticket) => ({
          id: ticket.id, reason: `${ticket.status}/${ticket.payout_status}/${ticket.refund_status || 'none'}`,
        })),
      });
    }

    const payoutMethod = body.payoutMethod || 'mobile_money';
    if (!['mobile_money', 'bank_transfer'].includes(payoutMethod)) {
      return json(422, { error: 'payoutMethod must be mobile_money or bank_transfer' });
    }
    const verifiedOtp = await verifyOtp(admin, authUser.id, body.otpCode);
    const expectedPaymentMethod = payoutMethod === 'mobile_money' ? 'mobile_money' : 'credit_card';
    if (tickets.some((ticket) => ticket.payment_method !== expectedPaymentMethod)) {
      return json(422, { error: `Every selected ticket must have been paid by ${expectedPaymentMethod}` });
    }
    if (tickets.some((ticket) => !ticketIsPayable(ticket))) {
      return json(409, { error: 'One or more selected tickets are no longer eligible. Refresh and retry.' });
    }
    const ticketIds = tickets.map((ticket) => ticket.id);
    if ((await findActiveRefunds(admin, ticketIds)).length) {
      return json(409, { error: 'One or more selected tickets have an active refund' });
    }

    const serverAmount = amountNumber(tickets.reduce((sum, ticket) => sum + Number(ticket.venue_revenue || 0), 0));
    if (serverAmount <= 0) return json(409, { error: 'Payout amount is zero' });
    const clientAmount = amountNumber(body.amount);
    if (clientAmount > 0 && Math.abs(clientAmount - serverAmount) > 1) {
      return json(409, { error: `Payout amount mismatch (server: UGX ${serverAmount.toLocaleString()}). Refresh and retry.` });
    }

    const requested = body.recipientDetails || {};
    const recipient = buildRecipient(payoutEvent, {
      method: payoutMethod, name: requested.name, phoneNumber: requested.phoneNumber,
      provider: requested.provider, bankName: requested.bankName, accountNumber: requested.accountNumber,
    });
    if (!recipient.name) return json(422, { error: 'Recipient name is required' });
    if (payoutMethod === 'mobile_money' && (!recipient.phoneNumber || !recipient.provider)) {
      return json(422, { error: 'Phone number and provider are required for mobile money payouts' });
    }
    if (payoutMethod === 'bank_transfer' && (!recipient.bankName || !recipient.accountNumber)) {
      return json(422, { error: 'Bank name and account number are required for card-funded payouts' });
    }

    await consumeOtp(admin, verifiedOtp.id);
    const payoutStatus = payoutMethod === 'mobile_money' ? 'processing' : 'pending_admin_review';
    const claimedStatus = payoutMethod === 'mobile_money' ? 'processing' : 'pending_review';
    const { data: claimed, error: claimError } = await admin.from('tickets')
      .update({ payout_status: claimedStatus, payout_eligible: false }).in('id', ticketIds)
      .eq('status', 'used').eq('is_scanned', true).eq('payout_status', 'pending')
      .eq('payout_eligible', true).eq('refund_status', 'none').select('id');
    if (claimError) throw claimError;
    if (!claimed || claimed.length !== ticketIds.length) {
      if (claimed?.length) await releaseTickets(admin, claimed.map((ticket) => ticket.id), claimedStatus);
      return json(409, { error: 'The selected tickets changed while the payout was prepared. Refresh and retry.' });
    }

    const payoutConfig = {
      method: recipient.method, name: recipient.name, phoneNumber: recipient.phoneNumber || null,
      provider: recipient.provider || null, bankName: recipient.bankName || null,
      accountNumber: recipient.accountNumber || null,
    };
    const { error: configError } = await admin.from('events').update({ payout_config: payoutConfig }).eq('slug', payoutEvent.slug);
    const providerRequestId = payoutMethod === 'mobile_money' ? crypto.randomUUID() : null;
    const payoutRow = {
      organizer_id: payoutEvent.created_by ? String(payoutEvent.created_by) : (profile?.uid || authUser.id),
      ticket_ids: ticketIds, amount: serverAmount, status: payoutStatus, payout_method: payoutMethod,
      recipient_name: recipient.name,
      recipient_phone_number: payoutMethod === 'mobile_money' ? recipient.phoneNumber : null,
      metadata: payoutMethod === 'bank_transfer'
        ? { bank_name: recipient.bankName, account_number: recipient.accountNumber }
        : { provider: recipient.provider, pawapay_payout_id: providerRequestId },
      transaction_reference: providerRequestId, processed_date: null, event_id: payoutEvent.slug,
      admin_note: configError ? 'Unable to persist payout_config' : 'payout_config persisted',
    };
    const { data: payout, error: payoutError } = await admin.from('payouts').insert(payoutRow).select('*').single();
    if (payoutError) {
      await releaseTickets(admin, ticketIds, claimedStatus);
      throw payoutError;
    }

    let providerPayoutId = null;
    if (payoutMethod === 'mobile_money') {
      try {
        const providerData = await submitPawaPayPayout({
          payoutId: providerRequestId, amount: serverAmount, currency: 'UGX',
          phoneNumber: recipient.phoneNumber, provider: recipient.provider,
        });
        providerPayoutId = providerData.payoutId;
        await admin.from('payouts').update({
          status: 'processing', transaction_reference: providerData.payoutId,
          metadata: { provider: recipient.provider, pawapay_payout_id: providerData.payoutId, pawapay_status: providerData.status },
          updated_at: new Date().toISOString(),
        }).eq('id', payout.id).eq('status', 'processing');
      } catch (providerError) {
        await admin.from('payouts').update({ status: 'failed', admin_note: providerError.message, updated_at: new Date().toISOString() })
          .eq('id', payout.id).eq('status', 'processing');
        await releaseTickets(admin, ticketIds, claimedStatus);
        throw Object.assign(new Error(providerError.message || 'PawaPay payout initiation failed'), { statusCode: 502 });
      }
    }

    return json(200, {
      success: true, payoutId: payout.id, providerPayoutId,
      transactionReference: providerPayoutId, amount: serverAmount, ticketIds, status: payoutStatus,
    });
  } catch (error) {
    console.error('[Payout] Error:', error.message);
    return json(error.statusCode || 500, { success: false, error: error.message || 'Payout failed' });
  }
};

module.exports = { handler: exports.handler, ticketIsPayable };
