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
  verifyPesapalPayment,
  verifyPawaPayDeposit,
  loadEvent,
  insertTicketNotification,
  sendTicketEmail,
  createTicketServerSide,
  persistTicketRows,
} = require('../shared/ticketFulfillment');

const MAX_ATTEMPTS = 5;
const MAX_AGE_MINUTES = 5;
const BATCH_SIZE = 10;

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
    // Fetch stuck fulfillments: not yet fulfilled, older than the cutoff,
    // and below the retry cap.
    const { data: rows, error } = await admin
      .from('pending_ticket_fulfillments')
      .select('*')
      .neq('status', 'fulfilled')
      .lt('created_at', cutoff)
      .lte('attempt_count', MAX_ATTEMPTS - 1)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;
    const fulfillments = (rows || []).filter((f) => f.status !== 'cancelled');

    console.log('[StuckFulfillments] Candidates:', fulfillments.length);

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
      }
    }

    return json(200, { ok: true, processed, succeeded, failed, scheduled: isScheduled });
  } catch (error) {
    console.error('[StuckFulfillments] Error:', error.message);
    return json(500, { ok: false, error: error.message });
  }
};

async function processOne(admin, f) {
  // 1. Re-verify the payment server-side.
  let verification;
  if (f.pawapay_deposit_id) {
    verification = await verifyPawaPayDeposit(f.pawapay_deposit_id);
  } else if (f.payment_id) {
    verification = await verifyPesapalPayment({ orderId: f.payment_id, trackingId: undefined });
  } else {
    await bump(admin, f, 'failed', 'No payment reference stored on fulfillment');
    return 'failed';
  }

  if (verification.status === 'failed') {
    await bump(admin, f, 'failed', `Payment not completed (${verification.rawStatus})`);
    return 'failed';
  }

  if (verification.status === 'pending') {
    await bump(admin, f, f.status, 'Payment still pending, will retry on next run');
    return 'pending';
  }

  // Payment is COMPLETED — fulfil.
  const existingIds = f.ticket_ids || [];
  if (existingIds.length > 0) {
    await bump(admin, f, 'fulfilled', 'Tickets already created; marking fulfilled');
    return 'succeeded';
  }

  const event = await loadEvent(admin, f.event_id);
  if (!event) {
    await bump(admin, f, 'failed', `Event not found: ${f.event_id}`);
    return 'failed';
  }

  const names = f.attendee_names && f.attendee_names.length
    ? f.attendee_names
    : [f.buyer_name || 'Attendee'];
  const qty = Math.max(1, Math.floor(Number(f.quantity) || 1));
  const total = Math.floor(Number(f.amount) || 0);
  const perTicketTotal = total > 0 ? total / qty : 0;
  const method = f.pawapay_deposit_id ? 'mobile_money' : 'credit_card';
  const sharedPaymentId = f.payment_id;

  const createdRows = [];
  for (let i = 0; i < qty; i++) {
    const row = await createTicketServerSide(admin, {
      event,
      attendeeName: names[i] || names[0] || 'Attendee',
      payerEmail: f.buyer_email,
      buyerId: f.buyer_id,
      deliveryEmail: f.buyer_email,
      totalAmount: perTicketTotal,
      isTableEntry: false,
      buyerPhone: undefined,
      sharedPaymentId,
      cardPaymentName: undefined,
      photoUrl: null,
      payment: { method, ticketType: f.ticket_type || undefined },
      pesapalTransactionId: verification.transactionId,
      pesapalConfirmationCode: verification.confirmationCode,
    });
    createdRows.push(row);
  }

  // Persist the whole batch atomically (inventory checks included).
  const createdIds = await persistTicketRows(admin, createdRows);

  for (const row of createdRows) {
    await insertTicketNotification(admin, event, row);

    // Best-effort email with the hosted QR URL.
    try {
      await sendTicketEmail({
        buyerEmail: f.buyer_email,
        buyerName: row.buyer_name,
        eventName: event.name,
        ticketType: row.entry_fee_type,
        venue: event.venue_name || '',
        date: new Date(row.event_start_time).toISOString().split('T')[0],
        time: event.time || '',
        ticketRef: row.ticket_ref,
        qrCodeDataUrl: row.qr_code_data_url,
        photoUploadLink: row.photo_upload_token
          ? `${process.env.SITE_URL || process.env.URL || 'https://yovibe.net'}/add-photo?ticket=${row.id}&token=${row.photo_upload_token}`
          : undefined,
        ticketDesign: undefined,
        posterUrl: event.poster_image_url,
      });
    } catch (e) {
      console.warn(`[StuckFulfillments] Email failed for ${row.id}:`, e.message);
    }
  }

  await bump(admin, f, 'fulfilled', 'Fulfilled by scheduled retry');
  return 'succeeded';
}

async function bump(admin, f, status, note) {
  const { error } = await admin
    .from('pending_ticket_fulfillments')
    .update({
      status,
      attempt_count: (f.attempt_count || 0) + 1,
      last_error: (note || '').substring(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', f.id);
  if (error) console.warn(`[StuckFulfillments] Status update failed for ${f.id}:`, error.message);
}
