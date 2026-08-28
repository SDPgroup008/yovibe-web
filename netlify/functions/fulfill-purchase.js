// netlify/functions/fulfill-purchase.js
//
// Phase 1: the server-side purchase trust boundary.
//
// The client submits the FULL purchase payload here ONLY after its payment
// polling reported COMPLETED. This function re-verifies the payment directly
// with PesaPal / PawaPay, and only then creates the tickets server-side,
// uploads QR/photo assets to R2, sends the ticket emails, and records a
// pending_ticket_fulfillments row for traceability + admin recovery.
//
// The client no longer writes ticket rows: a compromised/buggy client cannot
// create tickets without a genuinely completed payment.
//
// Idempotency: the client generates `fulfillmentId` (uuid) before calling.
// If the row already exists and holds ticket_ids, this returns those tickets
// instead of creating duplicates.

const { getAdminClient } = require('../shared/supabaseAdmin');
const {
  verifyPesapalPayment,
  verifyPawaPayDeposit,
  loadEvent,
  uploadImageDataUrl,
  insertTicketNotification,
  sendTicketEmail,
  createTicketServerSide,
} = require('../shared/ticketFulfillment');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function ok(body) {
  return { statusCode: 200, headers, body: JSON.stringify(body) };
}

function error(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return error(405, { success: false, error: 'Method Not Allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return error(400, { success: false, error: 'Invalid JSON body' });
  }

  const {
    fulfillmentId,
    eventId,
    ticketType,
    quantity,
    totalAmount,
    isTableEntry,
    tableSize,
    buyerNames,
    buyerEmails,
    deliveryEmails,
    payerEmail,
    buyerId,
    buyerPhone,
    buyerPhotoDataUrl,
    seatNumbers,
    tableNumbers,
    payment,
    verification,
  } = payload;

  if (!fulfillmentId) return error(400, { success: false, error: 'fulfillmentId is required' });
  if (!eventId) return error(400, { success: false, error: 'eventId is required' });
  if (!payment || !payment.method) return error(400, { success: false, error: 'payment.method is required' });
  if (!verification) return error(400, { success: false, error: 'verification is required' });

  const method = payment.method;
  if (!['mobile_money', 'credit_card', 'bank_transfer'].includes(method)) {
    return error(400, { success: false, error: `Unsupported payment method: ${method}` });
  }

  const qty = Math.floor(Number(quantity) || 0);
  const total = Math.floor(Number(totalAmount) || 0);
  if (qty <= 0 || total <= 0) return error(400, { success: false, error: 'Invalid quantity or amount' });
  if (!Array.isArray(buyerNames) || buyerNames.length !== qty) {
    return error(400, { success: false, error: 'buyerNames must match quantity' });
  }

  const admin = getAdminClient();

  try {
    // ── Step 1: Idempotency check ──────────────────────────────────────────
    const existing = await admin.from('pending_ticket_fulfillments').select('*').eq('id', fulfillmentId).maybeSingle();
    if (existing.error && existing.error.code !== 'PGRST116') {
      throw existing.error;
    }
    if (existing.data && (existing.data.ticket_ids || []).length > 0) {
      const ids = existing.data.ticket_ids;
      const { data: tickets } = await admin.from('tickets').select('id, ticket_ref, qr_code_data_url').in('id', ids);
      return ok({
        success: true,
        fulfillmentId,
        alreadyFulfilled: true,
        ticketIds: ids,
        tickets: (tickets || []).map((t) => ({ id: t.id, ticketRef: t.ticket_ref, qrCodeDataUrl: t.qr_code_data_url })),
      });
    }

    // ── Step 2: Server-side payment verification ───────────────────────────
    let verificationResult;
    if (method === 'mobile_money') {
      verificationResult = await verifyPawaPayDeposit(verification.depositId);
    } else {
      verificationResult = await verifyPesapalPayment({
        trackingId: verification.trackingId,
        orderId: verification.orderId,
      });
    }

    if (verificationResult.status === 'pending' || verificationResult.status === 'invalid') {
      return ok({ success: false, status: 'pending', message: 'Payment is still being verified by the processor' });
    }
    if (verificationResult.status === 'failed') {
      return error(402, { success: false, status: 'failed', message: 'Payment was not completed' });
    }

    // ── Step 3: Load the event ─────────────────────────────────────────────
    const event = await loadEvent(admin, eventId);
    if (!event) return error(404, { success: false, error: `Event not found: ${eventId}` });

    // ── Step 4: Claim the fulfillment row (concurrency lock via PK) ────────
    const paymentId = method === 'mobile_money' ? verification.depositId : (verification.orderId || paymentIdFallback());
    const claim = await admin.from('pending_ticket_fulfillments').insert({
      id: fulfillmentId,
      payment_id: paymentId,
      pawapay_deposit_id: method === 'mobile_money' ? verification.depositId : null,
      buyer_email: payerEmail || buyerEmails[0] || '',
      buyer_name: buyerNames[0] || '',
      buyer_id: buyerId || null,
      event_id: eventId,
      event_name: event.name,
      ticket_type: ticketType || (event.entry_fees && event.entry_fees[0] ? event.entry_fees[0].name : 'Standard'),
      quantity: qty,
      amount: total,
      status: 'fulfilling',
      ticket_ids: [],
      attempt_count: 0,
      attendee_names: buyerNames,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (claim.error && claim.error.code === '23505') {
      // The row already exists. If it holds tickets, another invocation won the
      // race — return them. If it has none (a previous attempt crashed between
      // the claim and ticket creation), resume the claim and create tickets.
      if (existing.data && (existing.data.ticket_ids || []).length > 0) {
        const ids = existing.data.ticket_ids;
        const { data: tickets } = await admin.from('tickets').select('id, ticket_ref, qr_code_data_url').in('id', ids);
        return ok({
          success: true,
          fulfillmentId,
          alreadyFulfilled: true,
          ticketIds: ids,
          tickets: (tickets || []).map((t) => ({ id: t.id, ticketRef: t.ticket_ref, qrCodeDataUrl: t.qr_code_data_url })),
        });
      }
      const resume = await admin
        .from('pending_ticket_fulfillments')
        .update({
          status: 'fulfilling',
          payment_id: paymentId,
          pawapay_deposit_id: method === 'mobile_money' ? verification.depositId : null,
          attempt_count: ((existing.data && existing.data.attempt_count) || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fulfillmentId);
      if (resume.error) throw resume.error;
      console.log(`[FulfillPurchase] Resumed stranded claim ${fulfillmentId}`);
    } else if (claim.error) {
      throw claim.error;
    }

    // ── Step 5: Upload the buyer security photo once ───────────────────────
    let photoUrl = null;
    if (buyerPhotoDataUrl) {
      try {
        photoUrl = await uploadImageDataUrl(buyerPhotoDataUrl, 'buyer-photos', `purchase_${fulfillmentId}`);
      } catch (e) {
        console.warn('[FulfillPurchase] Photo upload failed (continuing without photo):', e.message);
      }
    }

    // ── Step 6: Create the tickets server-side ─────────────────────────────
    const perTicketTotal = total / qty;
    const tableGroupId = isTableEntry ? `YVG-${String(event.slug || event.id).slice(-6)}-${Date.now().toString().slice(-6)}` : undefined;
    const createdRows = [];

    for (let i = 0; i < qty; i++) {
      const row = await createTicketServerSide(admin, {
        event,
        attendeeName: buyerNames[i] || buyerNames[0] || 'Attendee',
        payerEmail,
        buyerId,
        deliveryEmail: deliveryEmails && deliveryEmails[i] ? deliveryEmails[i] : (buyerEmails[i] || payerEmail),
        totalAmount: perTicketTotal,
        isTableEntry: !!isTableEntry,
        tableSize: isTableEntry ? tableSize : undefined,
        tableGroupId,
        tableTotalAmount: isTableEntry ? total : undefined,
        seatNumber: seatNumbers && seatNumbers[i] != null ? seatNumbers[i] : undefined,
        tableNumber: tableNumbers && tableNumbers[i] != null ? tableNumbers[i] : undefined,
        buyerPhone,
        sharedPaymentId: paymentId,
        cardPaymentName: payment.cardName,
        photoUrl,
        payment: { ...payment, ticketType: ticketType || undefined },
        pesapalTransactionId: verificationResult.transactionId,
        pesapalConfirmationCode: verificationResult.confirmationCode,
      });
      createdRows.push(row);

      // Notification to the event owner (best-effort, mirrors the client flow)
      await insertTicketNotification(admin, event, row);
    }

    const ticketIds = createdRows.map((r) => r.id);

    // ── Step 7: Mark fulfillment as fulfilled (persist before emails so a
    //            crashed email step never re-creates tickets) ───────────────
    const { error: fulfilledError } = await admin
      .from('pending_ticket_fulfillments')
      .update({ status: 'fulfilled', ticket_ids: ticketIds, updated_at: new Date().toISOString() })
      .eq('id', fulfillmentId);
    if (fulfilledError) throw fulfilledError;

    // ── Step 8: Send ticket emails (best-effort; buyer can re-send later) ──
    const emailPromises = createdRows.map((ticket) => {
      const design =
        event.entry_fees && event.entry_fees.find ? event.entry_fees.find((f) => f && f.name === ticket.entry_fee_type) : null;
      const deliveryEmail = ticket.delivery_email || payerEmail;
      const eventStart = new Date(ticket.event_start_time);
      return sendTicketEmail({
        buyerEmail: deliveryEmail,
        buyerName: ticket.buyer_name,
        eventName: event.name,
        ticketType: ticket.entry_fee_type,
        venue: event.venue_name || '',
        date: eventStart.toISOString().split('T')[0],
        time: event.time || '',
        ticketRef: ticket.ticket_ref,
        qrCodeDataUrl: ticket.qr_code_data_url,
        seatNumber: ticket.table_number != null ? undefined : (ticket.seat_number ?? undefined),
        tableNumber: ticket.table_number ?? undefined,
        tableGroupId: ticket.table_group_id,
        photoUploadLink: !ticket.buyer_photo_url && ticket.photo_upload_token
          ? `${process.env.SITE_URL || process.env.URL || 'https://yovibe.net'}/add-photo?ticket=${ticket.id}&token=${ticket.photo_upload_token}`
          : undefined,
        ticketDesign: design ? design.ticketDesign : undefined,
        posterUrl: event.poster_image_url,
      });
    });
    const emailResults = await Promise.allSettled(emailPromises);
    emailResults.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        console.log(`[FulfillPurchase] Email sent for ticket ${createdRows[i].id}`);
      } else {
        console.warn(`[FulfillPurchase] Email failed for ticket ${createdRows[i].id}:`, res.reason?.message || res.reason);
      }
    });

    return ok({
      success: true,
      fulfillmentId,
      ticketIds,
      tickets: createdRows.map((t) => ({ id: t.id, ticketRef: t.ticket_ref, qrCodeDataUrl: t.qr_code_data_url })),
    });
  } catch (err) {
    console.error('[FulfillPurchase] Error:', err.message);
    // Try to surface the failure on the fulfillment row for admin visibility.
    try {
      await admin
        .from('pending_ticket_fulfillments')
        .update({
          status: 'failed',
          last_error: (err.message || 'Unknown error').substring(0, 500),
          attempt_count: 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fulfillmentId);
    } catch (e) {
      // ignore secondary failure
    }
    return error(500, { success: false, error: err.message || 'Unknown error', fulfillmentId });
  }
};

function paymentIdFallback() {
  return `YV-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
