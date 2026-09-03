// netlify/functions/process-stuck-fulfillments.js
//
// Phase 1 (P1.4): scheduled automatic retry for stranded purchases.
//
// Every 5 minutes (configured in netlify.toml) this function:
//  1. Finds pending_ticket_fulfillments stuck in payment_confirmed /
//     fulfilling / failed that are older than 5 minutes and under the retry cap.
//  2. Re-verifies the payment server-side with PesaPal / PawaPay (never trusts
//     stored state alone).
//  3. COMPLETED + no tickets → creates tickets server-side (degraded: no
//     seats/tables/photo, matching the previous admin-recovery fidelity),
//     emails them, marks the fulfillment fulfilled.
//  4. COMPLETED + tickets already exist → marks the fulfillment fulfilled.
//  5. Still pending → bumps attempt_count and waits for the next run.
//  6. Failed payment → leaves the record for admin review.
//
// The full-fidelity path (seats, tables, security photo) is only possible from
// the original purchase session via fulfill-purchase, because the purchase
// payload cannot be persisted without a schema change; the scheduled retry is
// the safety net that guarantees the buyer still receives working tickets.

const { getAdminClient } = require('../shared/supabaseAdmin');
const {
  confirmPaymentVerified,
  loadEvent,
  insertTicketNotification,
  enqueueTicketEmailJobs,
  createTicketServerSide,
  persistTicketRows,
  uploadImageDataUrl,
  cleanupTicketAssets,
} = require('../shared/ticketFulfillment');

const MAX_ATTEMPTS = 5;
const MAX_AGE_MINUTES = 5;
const BATCH_SIZE = 25;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event, context) => {
  // Netlify scheduled functions send the schedule in the path; allow it.
  const isScheduled = event?.headers?.['x-netlify-scheduled'] === 'true' || (event?.path || '').includes('/schedule');
  if (event && event.httpMethod && event.httpMethod !== 'GET') {
    return json(405, { error: 'Method Not Allowed' });
  }

  const admin = getAdminClient();
  const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60 * 1000).toISOString();

  try {
    // Reclaim expired checkout holds and release installment inventory at the
    // three-hour cutoff. This runs on the existing every-minute scheduler.
    const { error: expiryError } = await admin.rpc('release_expired_inventory_reservations');
    if (expiryError) console.warn('[StuckFulfillments] Inventory expiry sweep failed:', expiryError.message);

    // Fetch stuck fulfillments: not yet fulfilled, older than the cutoff,
    // and below the retry cap.
    const { data: rows, error } = await admin
      .from('pending_ticket_fulfillments')
      .select('*')
      .neq('status', 'fulfilled')
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .lt('created_at', cutoff)
      .lte('attempt_count', MAX_ATTEMPTS - 1)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;
    const fulfillments = (rows || []).filter((f) => f.status !== 'cancelled');

    /* console.log('[StuckFulfillments] Candidates:', fulfillments.length); */

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const f of fulfillments) {
      processed++;
      try {
        const outcome = await processOne(admin, f);
        if (outcome === 'succeeded') succeeded++;
        else if (outcome === 'failed') failed++;
      } catch (e) {
        failed++;
        console.warn(`[StuckFulfillments] Error on ${f.id}:`, e.message);
        await bump(admin, f, 'fulfilling', e.message || 'Worker error');
      }
    }

    return json(200, { ok: true, processed, succeeded, failed, scheduled: isScheduled });
  } catch (error) {
    console.error('[StuckFulfillments] Error:', error.message);
    return json(500, { ok: false, error: error.message });
  }
};

async function processOne(admin, f) {
  const { data: claimed, error: claimError } = await admin.rpc('claim_ticket_fulfillment', {
    p_id: f.id,
    p_lease_seconds: 600,
  });
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return 'locked';
  f = claimed[0];

  // 1. Confirm the payment (deployed verify functions + direct API tiebreaker).
  const verifyMethod = f.pawapay_deposit_id ? 'mobile_money' : 'credit_card';
  const confirmation = await confirmPaymentVerified(verifyMethod, {
    depositId: f.pawapay_deposit_id,
    orderId: f.payment_id,
    trackingId: undefined,
  });
  if (confirmation.failed) {
    await bump(admin, f, 'failed', 'Payment not completed');
    return 'failed';
  }
  if (!confirmation.confirmed) {
    await bump(admin, f, f.status, 'Payment still pending, will retry on next run');
    return 'pending';
  }
  const verification = confirmation.verificationResult || {};

  // Payment is COMPLETED — fulfil.
  const existingIds = f.ticket_ids || [];
  if (existingIds.length > 0) {
    const { data: existingTickets, error: existingError } = await admin
      .from('tickets')
      .select('*')
      .in('id', existingIds);
    if (existingError) throw existingError;
    await persistInstallmentTicketIds(admin, f, existingIds);
    await enqueueTicketEmailJobs(admin, await loadEvent(admin, f.event_id), existingTickets || [], f.buyer_email, f.id);
    await bump(admin, f, 'fulfilled', 'Tickets already created; marking fulfilled');
    return 'succeeded';
  }

  // Full-fidelity rebuild when the claim stored the complete payload
  // (seats/tables/photo/payment — no degraded tickets).
  const payload = f.payload && typeof f.payload === 'object' ? f.payload : null;
  const event = await loadEvent(admin, payload && payload.eventId ? payload.eventId : f.event_id);
  if (!event) {
    await bump(admin, f, 'failed', `Event not found: ${f.event_id}`);
    return 'failed';
  }

  const names = (payload && payload.buyerNames && payload.buyerNames.length)
    ? payload.buyerNames
    : (f.attendee_names && f.attendee_names.length ? f.attendee_names : [f.buyer_name || 'Attendee']);
  const qty = Math.max(1, Math.floor(Number((payload && payload.quantity) || f.quantity) || 1));
  const total = Math.floor(Number((payload && payload.totalAmount) || f.amount) || 0);
  const perTicketTotal = total > 0 ? total / qty : 0;
  const method = f.pawapay_deposit_id ? 'mobile_money' : ((payload && payload.payment && payload.payment.method) || 'credit_card');
  const sharedPaymentId = f.payment_id || (payload && payload.paymentId);
  const isTableEntry = !!(payload && payload.isTableEntry);
  const tableSize = isTableEntry ? Math.max(1, Math.floor(Number(payload.tableSize) || 1)) : null;
  const verifiedFeePrice = payload && payload.unitPrice != null ? Number(payload.unitPrice) : null;
  // The verified event fee is a table total for table tiers. Ticket rows still
  // store their per-attendee share, while table_total_amount stores the full
  // table amount.
  const rowUnitPrice = verifiedFeePrice != null && isTableEntry
    ? verifiedFeePrice / tableSize
    : verifiedFeePrice;

  // Crash recovery for the narrow window after the ticket RPC commits but
  // before ticket_ids is written to the fulfillment row.
  const { data: paymentTickets, error: paymentTicketsError } = await admin
    .from('tickets')
    .select('*')
    .eq('payment_id', sharedPaymentId)
    .eq('event_slug', event.slug || f.event_id);
  if (paymentTicketsError) throw paymentTicketsError;
  if ((paymentTickets || []).length >= qty) {
    const recoveredTickets = paymentTickets.slice(0, qty);
    const recoveredIds = recoveredTickets.map((ticket) => ticket.id);
    await admin.from('pending_ticket_fulfillments').update({ ticket_ids: recoveredIds }).eq('id', f.id);
    await persistInstallmentTicketIds(admin, f, recoveredIds);
    await enqueueTicketEmailJobs(admin, event, recoveredTickets, f.buyer_email, f.id);
    await bump(admin, f, 'fulfilled', 'Recovered tickets created before worker interruption');
    return 'succeeded';
  }

  // Photo: hosted R2 URL from the payload, or re-upload a legacy data URL once.
  let photoUrl = null;
  if (payload && payload.buyerPhotoUrl) {
    photoUrl = payload.buyerPhotoUrl;
  } else if (payload && payload.buyerPhotoDataUrl) {
    try {
      photoUrl = await uploadImageDataUrl(payload.buyerPhotoDataUrl, 'buyer-photos', `purchase_${f.id}`);
    } catch (e) {
      console.warn('[StuckFulfillments] Photo re-upload failed:', e.message);
    }
  }

  const createdRows = [];
  for (let i = 0; i < qty; i++) {
    const row = await createTicketServerSide(admin, {
      event,
      attendeeName: names[i] || names[0] || 'Attendee',
      payerEmail: (payload && payload.payerEmail) || f.buyer_email,
      buyerId: (payload && payload.buyerId) || f.buyer_id,
      deliveryEmail: (payload && payload.deliveryEmails && payload.deliveryEmails[i])
        || (payload && payload.buyerEmails && payload.buyerEmails[i])
        || (payload && payload.payerEmail) || f.buyer_email,
      totalAmount: perTicketTotal,
      unitPrice: rowUnitPrice,
      lateFeePercent: payload && payload.lateFeePercent,
      isTableEntry,
      tableSize: tableSize || undefined,
      tableGroupId: payload && payload.tableGroupId,
      tableTotalAmount: payload && payload.isTableEntry ? total : undefined,
      seatNumber: payload && payload.seatNumbers && payload.seatNumbers[i] != null ? payload.seatNumbers[i] : undefined,
      tableNumber: payload && payload.tableNumbers && payload.tableNumbers[i] != null ? payload.tableNumbers[i] : undefined,
      buyerPhone: payload && payload.buyerPhone,
      sharedPaymentId,
      cardPaymentName: payload && payload.payment && payload.payment.cardName,
      photoUrl,
      payment: { ...((payload && payload.payment) || {}), ticketType: (payload && payload.ticketType) || f.ticket_type || undefined },
      pesapalTransactionId: verification.transactionId || (payload && payload.pesapalTransactionId),
      pesapalConfirmationCode: verification.confirmationCode || (payload && payload.pesapalConfirmationCode),
    });
    createdRows.push(row);
  }

  // Persist the whole batch atomically (inventory checks included).
  let createdIds;
  try {
    createdIds = await persistTicketRows(
      admin,
      createdRows,
      payload && payload.inventoryHoldIds,
      payload && payload.inventorySessionId,
      payload && payload.installmentPlanId,
    );
  } catch (error) {
    await cleanupTicketAssets(createdRows);
    throw error;
  }

  // Persist ticket IDs immediately after the atomic insert. If the worker
  // stops before email enqueue or status completion, the next retry resumes
  // from these IDs instead of creating a duplicate ticket batch.
  const { error: idsError } = await admin
    .from('pending_ticket_fulfillments')
    .update({ ticket_ids: createdIds, updated_at: new Date().toISOString() })
    .eq('id', f.id);
  if (idsError) throw idsError;
  await persistInstallmentTicketIds(admin, f, createdIds);

  for (const row of createdRows) {
    await insertTicketNotification(admin, event, row);

  }

  await enqueueTicketEmailJobs(admin, event, createdRows, f.buyer_email, f.id);

  await bump(admin, f, 'fulfilled', 'Fulfilled by scheduled retry');
  return 'succeeded';
}

async function bump(admin, f, status, note) {
  const { error } = await admin
    .from('pending_ticket_fulfillments')
    .update({
      status,
      attempt_count: f.attempt_count || 0,
      last_error: (note || '').substring(0, 500),
      lease_expires_at: null,
      processing_started_at: null,
      next_retry_at: status === 'fulfilled'
        ? null
        : new Date(Date.now() + (status === 'failed' ? 15 : 1) * 60 * 1000).toISOString(),
      completed_at: status === 'fulfilled' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', f.id);
  if (error) console.warn(`[StuckFulfillments] Status update failed for ${f.id}:`, error.message);
}

async function persistInstallmentTicketIds(admin, fulfillment, ticketIds) {
  const planId = fulfillment?.payload?.installmentPlanId;
  if (!planId || !Array.isArray(ticketIds) || ticketIds.length === 0) return;

  const { error } = await admin
    .from('ticket_installment_plans')
    .update({ ticket_ids: ticketIds, updated_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) throw error;
}

module.exports.processOne = processOne;
