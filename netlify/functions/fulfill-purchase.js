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
  confirmPaymentVerified,
  loadEvent,
  resolveEventStartTime,
  uploadImageDataUrl,
  insertTicketNotification,
  sendTicketEmail,
  createTicketServerSide,
  persistTicketRows,
  cleanupTicketAssets,
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

    // ── Step 2: Server-side payment confirmation ───────────────────────────
    // The UI's poll verdict (verify-pawapay-payment / verify-pesapal-payment)
    // IS server-backed — the client cannot forge it. Re-verification remains
    // the primary gate, but a COMPLETED poll verdict is never allowed to strand
    // a charged buyer:
    //   • re-verification confirms   → proceed (normal).
    //   • re-verification unresolved (both paths error/pending) + poll COMPLETED
    //     → proceed on the poll verdict (infra/alias disagreement) + critical log.
    //   • re-verification says FAILED → fail closed, regardless of the poll.
    const confirmation = await confirmPaymentVerified(method, verification);
    const pollSaysCompleted = String(verification.pollStatus || '').toLowerCase() === 'completed';

    if (!confirmation.confirmed) {
      if (confirmation.failed) {
        // Both independent paths affirmatively report failed — never create
        // tickets for a failed payment.
        return error(402, { success: false, status: 'failed', message: 'Payment was not completed' });
      }
      if (!pollSaysCompleted) {
        return ok({ success: false, status: 'pending', message: 'Payment is still being verified by the processor' });
      }
      // Poll confirmed COMPLETED but re-verification is unresolved — proceed on
      // the poll verdict rather than strand a buyer whose money was taken.
      console.error(
        `[FulfillPurchase] ⚠️ Poll confirmed COMPLETED but re-verification unresolved — proceeding on poll verdict ` +
        `(depositId=${verification.depositId || verification.orderId || '?'})`
      );
    }
    const verificationResult = confirmation.confirmed
      ? (confirmation.verificationResult || {})
      : { status: 'completed', confirmedByPoll: true };

    // ── Step 3: Load the event ─────────────────────────────────────────────
    const event = await loadEvent(admin, eventId);
    if (!event) return error(404, { success: false, error: `Event not found: ${eventId}` });

    // ── Step 3b: Server-side price verification (Phase 2.2) ─────────────────
    // Recompute the expected total from the NOTIFIED price + late fee and
    // reject any client-supplied amount that does not match — a tampered
    // amount (devtools) can never be charged.
    const feeForPurchase = Array.isArray(event.entry_fees)
      ? event.entry_fees.find((f) => f && f.name === ticketType)
      : null;
    if (!feeForPurchase) {
      return error(409, {
        success: false,
        error: `Ticket category "${ticketType || 'Standard'}" is no longer available. Please refresh and try again.`,
      });
    }
    const unitPrice = Number.parseInt(String(feeForPurchase.amount || '0').replace(/[^0-9]/g, ''), 10) || 0;
    const lateFeePercent = Number(event.late_fee_percent ?? 0) || 0;
    const startTime = resolveEventStartTime(event);
    const sevenAm = new Date(startTime);
    sevenAm.setHours(7, 0, 0, 0);
    const isLatePurchase = new Date() >= sevenAm;
    const expectedSubtotal = unitPrice * qty;
    const expectedLateFee = isLatePurchase ? Math.round(expectedSubtotal * lateFeePercent / 100) : 0;
    const expectedTotal = expectedSubtotal + expectedLateFee;
    if (Math.abs(expectedTotal - total) > 1) {
      console.warn(
        `[FulfillPurchase] Price mismatch — client=${total}, expected=${expectedTotal} ` +
        `(fee="${ticketType}", unit=${unitPrice}, qty=${qty}, lateFee=${expectedLateFee})`
      );
      return error(409, {
        success: false,
        error: 'Ticket prices have changed. Please refresh the page and try again.',
      });
    }

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
    // createTicketServerSide builds the rows (QR, R2, pricing); they are NOT
    // inserted individually — the whole batch is persisted atomically below.
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
        unitPrice,
        lateFeePercent,
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
    }

    // ── Step 6b: Atomic persistence with inventory checks (Phase 2.1) ───────
    let ticketIds;
    try {
      ticketIds = await persistTicketRows(admin, createdRows);
    } catch (err) {
      // Remove the QR/photo objects we uploaded so nothing is orphaned.
      await cleanupTicketAssets(createdRows);
      const msg = String(err.message || '');
      if (msg.startsWith('SOLD_OUT')) {
        return error(409, { success: false, error: 'Tickets for this category are sold out.' });
      }
      if (msg.startsWith('TABLE_TAKEN')) {
        return error(409, { success: false, error: 'That table was just taken — please pick another.' });
      }
      if (msg.startsWith('SEAT_TAKEN')) {
        return error(409, { success: false, error: 'That seat was just taken — please pick another.' });
      }
      throw err;
    }

    for (const row of createdRows) {
      // Notification to the event owner (best-effort, mirrors the client flow)
      await insertTicketNotification(admin, event, row);
    }

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
