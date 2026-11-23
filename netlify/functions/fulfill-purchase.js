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

const { verifyOrder } = require('../shared/settlement');
const { getAdminClient } = require('../shared/supabaseAdmin');
const {
  loadEvent,
  uploadImageDataUrl,
} = require('../shared/ticketFulfillment');
const { requiredEnv, getSiteUrl } = require('../shared/runtimeConfig');
const { privateKeyFromReference, presignR2 } = require('../shared/r2');
const { getEventPayoutEligibility } = require('../shared/eventPayoutEligibility');

function accessibleQr(value) {
  const key = privateKeyFromReference(value);
  return key ? presignR2({ kind: 'private', method: 'GET', key, expiresSeconds: 300 }) : value;
}

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
    unitPriceAtCheckout,
    lateFeePercentAtCheckout,
    isTableEntry,
    tableSize,
    buyerNames,
    buyerEmails,
    deliveryEmails,
    payerEmail,
    buyerId,
    buyerPhone,
    buyerPhotoDataUrl,
    buyerPhotoUrl,
    seatNumbers,
    tableNumbers,
    inventoryHoldIds,
    inventorySessionId,
    installmentPlanId,
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
  const total = Number(totalAmount);
  const normalizedTableSize = Math.floor(Number(tableSize) || 0);
  if (!Number.isSafeInteger(Number(quantity)) || !Number.isFinite(total) || qty <= 0 || total <= 0) return error(400, { success: false, error: 'Invalid quantity or amount' });
  if (isTableEntry && normalizedTableSize <= 0) {
    return error(400, { success: false, error: 'A valid table size is required' });
  }
  if (isTableEntry && qty % normalizedTableSize !== 0) {
    return error(400, { success: false, error: 'Table attendee count must be a whole number of tables' });
  }
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
        tickets: (tickets || []).map((t) => ({ id: t.id, ticketRef: t.ticket_ref, qrCodeDataUrl: accessibleQr(t.qr_code_data_url) })),
      });
    }

    const event = await loadEvent(admin, eventId);
    if (!event) return error(404, { success: false, error: 'Event not found' });
    const confirmation = await verifyOrder(admin, event, payload, verification);
    if (confirmation.failed) return error(402, { success: false, status: 'failed', message: 'Payment was not completed' });
    if (!confirmation.confirmed) return ok({ success: false, status: 'pending', message: 'Payment is still being verified' });
    const verificationResult = confirmation.verificationResult;
    const { unitPrice, lateFeePercent } = confirmation.quote;
    const payoutEligibilityPolicy = await getEventPayoutEligibility(admin, event.slug || event.id);

    // ── Step 4: Claim the fulfillment row (concurrency lock via PK) ────────
    const paymentId = method === 'mobile_money' ? verification.depositId : (verification.orderId || paymentIdFallback(fulfillmentId));
    const existingByPayment = await admin
      .from('pending_ticket_fulfillments')
      .select('id, status, ticket_ids')
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (existingByPayment.error && existingByPayment.error.code !== 'PGRST116') throw existingByPayment.error;
    if (existingByPayment.data && existingByPayment.data.id !== fulfillmentId) {
      const existingIds = existingByPayment.data.ticket_ids || [];
      if (existingIds.length > 0) {
        const { data: existingTickets } = await admin
          .from('tickets')
          .select('id, ticket_ref, qr_code_data_url')
          .in('id', existingIds);
        return ok({
          success: true,
          fulfillmentId: existingByPayment.data.id,
          alreadyFulfilled: true,
          ticketIds: existingIds,
          tickets: (existingTickets || []).map((t) => ({ id: t.id, ticketRef: t.ticket_ref, qrCodeDataUrl: accessibleQr(t.qr_code_data_url) })),
        });
      }
      await triggerFulfillmentWorker(existingByPayment.data.id);
      return ok({
        success: false,
        status: 'in_progress',
        fulfillmentId: existingByPayment.data.id,
        message: 'Your payment is already queued for ticket finalization.',
      });
    }
    const tableGroupId = isTableEntry ? `YVG-${String(event.slug || event.id).slice(-6)}-${Date.now().toString().slice(-6)}` : undefined;
    const recorded = confirmation.quote;
    const checkout = recorded.buyerNames ? recorded : payload;
    let resolvedPhotoUrl = checkout.buyerPhotoUrl || null;
    if (!resolvedPhotoUrl && checkout.buyerPhotoDataUrl) {
      try {
        // Legacy clients may still send a data URL. Upload it before the queue
        // row is persisted so Base64 never gets stored in Supabase.
        resolvedPhotoUrl = await uploadImageDataUrl(checkout.buyerPhotoDataUrl, 'buyer-photos', `purchase_${fulfillmentId}`);
      } catch (e) {
        console.warn('[FulfillPurchase] Legacy photo upload failed; continuing without photo:', e.message);
      }
    }
    // Persist the FULL payload so the scheduled retry can rebuild full-fidelity
    // tickets (seats/tables/photo/payment) for a stranded purchase.
    const claimPayload = {
      eventId,
      ticketType: ticketType || (event.entry_fees && event.entry_fees[0] ? event.entry_fees[0].name : 'Standard'),
      quantity: qty,
      totalAmount: total,
      unitPrice,
      lateFeePercent,
      unitPriceAtCheckout: Number(unitPrice),
      lateFeePercentAtCheckout: lateFeePercent,
      isTableEntry: !!isTableEntry,
      tableSize: isTableEntry ? normalizedTableSize : null,
      tableGroupId: tableGroupId || null,
      buyerNames: checkout.buyerNames,
      buyerEmails: checkout.buyerEmails,
      deliveryEmails: checkout.deliveryEmails,
      payerEmail: checkout.payerEmail,
      buyerId: checkout.buyerId || null,
      buyerPhone: checkout.buyerPhone || null,
      buyerPhotoDataUrl: null,
      buyerPhotoUrl: resolvedPhotoUrl,
      seatNumbers: checkout.seatNumbers || null,
      tableNumbers: checkout.tableNumbers || null,
      inventoryHoldIds: Array.isArray(checkout.inventoryHoldIds) ? checkout.inventoryHoldIds : null,
      inventorySessionId: checkout.inventorySessionId || null,
      installmentPlanId: installmentPlanId || null,
      payment: { ...payment },
      paymentId,
      verification: { depositId: verification.depositId, orderId: verification.orderId, trackingId: verification.trackingId },
      pesapalTransactionId: verificationResult.transactionId || null,
      pesapalConfirmationCode: verificationResult.confirmationCode || null,
      salePayoutEligible: payoutEligibilityPolicy.salePayoutEnabled === true,
    };
    const claim = await admin.from('pending_ticket_fulfillments').insert({
      id: fulfillmentId,
      payment_id: paymentId,
      pawapay_deposit_id: method === 'mobile_money' ? verification.depositId : null,
      buyer_email: checkout.payerEmail || checkout.buyerEmails?.[0] || '',
      buyer_name: checkout.buyerNames[0] || '',
      buyer_id: checkout.buyerId || null,
      event_id: eventId,
      event_name: event.name,
      ticket_type: claimPayload.ticketType,
      quantity: qty,
      amount: total,
      status: 'fulfilling',
      ticket_ids: [],
      attempt_count: 0,
      attendee_names: buyerNames,
      payload: claimPayload,
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
          tickets: (tickets || []).map((t) => ({ id: t.id, ticketRef: t.ticket_ref, qrCodeDataUrl: accessibleQr(t.qr_code_data_url) })),
        });
      }
      const winner = await admin.from('pending_ticket_fulfillments').select('payment_id').eq('id', fulfillmentId).maybeSingle();
      if (winner.error || winner.data?.payment_id !== paymentId) return error(409, { error: 'Checkout reference conflict' });
    } else if (claim.error) {
      throw claim.error;
    }

    // ── Step 5: Queue server-side fulfillment ───────────────────────────────
    await triggerFulfillmentWorker(fulfillmentId);
    return ok({
      success: false,
      status: 'in_progress',
      fulfillmentId,
      message: 'Payment confirmed. Your tickets are being finalized.',
    });
  } catch (err) {
    console.error('[FulfillPurchase] Error:', err.message);
    return error(err.statusCode || 500, { success: false, error: err.message || 'Unknown error', fulfillmentId });
  }
};

function paymentIdFallback(fulfillmentId) {
  return `YV-${fulfillmentId}`;
}

async function triggerFulfillmentWorker(fulfillmentId) {
  const base = getSiteUrl();
  const secret = requiredEnv('FULFILLMENT_WORKER_SECRET');
  try {
    const response = await fetch(`${base}/.netlify/functions/process-ticket-fulfillment-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fulfillment-Worker-Secret': secret,
      },
      body: JSON.stringify({ fulfillmentId }),
    });
    // A background function normally returns 202. Treat an HTTP failure as a
    // recoverable queue condition; the scheduled sweeper will process the row.
    if (!response.ok && response.status !== 202) {
      console.warn(`[FulfillPurchase] Worker trigger returned HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn('[FulfillPurchase] Worker trigger failed; scheduled retry will recover:', error.message);
  }
}
