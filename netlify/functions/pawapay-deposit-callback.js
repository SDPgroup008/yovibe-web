// netlify/functions/pawapay-deposit-callback.js
//
// PawaPay deposit callback webhook. PawaPay POSTs a JSON body when a deposit
// reaches a final status:
//   { "depositId": "...", "status": "COMPLETED"|"FAILED", "amount": "...",
//     "providerTransactionId": "...", "failureReason": {...}, ... }
//
// Responsibilities:
//  1. Verify the callback signature when PAWAPAY_SIGNED_CALLBACKS=true
//     (RFC 9421 — see shared/pawapaySignatures.js). Reject 401 otherwise.
//  2. Re-query PawaPay for the authoritative status (never trust the ping).
//  3. On FAILED: automatically strike any tickets created for this deposit.
//  4. Always answer 200 fast (after verification) so PawaPay stops retrying.

const { getAdminClient } = require('../shared/supabaseAdmin');
const { verifyPawaPayDeposit, markTicketsByPayment, triggerFulfillmentWorker } = require('../shared/ticketFulfillment');
const { verifyCallbackSignature } = require('../shared/pawapaySignatures');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function ack(body) {
  return { statusCode: 200, headers, body: JSON.stringify({ received: true, ...(body || {}) }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  // Extract depositId from the POST body (primary) or query params (legacy).
  let depositId;
  let status;
  let parsedBody = {};
  try {
    parsedBody = JSON.parse(event.body || '{}');
  } catch {
    // tolerate non-JSON bodies below
  }
  depositId = parsedBody.depositId || (event.queryStringParameters && event.queryStringParameters.depositId);
  status = String(parsedBody.status || (event.queryStringParameters && event.queryStringParameters.status) || '').toUpperCase();

  /* console.log('[PawaPayCallback] Received deposit callback:', { depositId, status }); */

  // Signature verification applies ONLY to real PawaPay POST callbacks. GET
  // requests are uptime-monitor probes (PawaPay never sends GET callbacks),
  // so they are acknowledged without signature checks.
  if (event.httpMethod === 'POST') {
    const signatureResult = await verifyCallbackSignature(event);
    if (!signatureResult.ok) {
      console.warn('[PawaPayCallback] Signature verification failed:', signatureResult.error);
      return { statusCode: 401, headers, body: JSON.stringify({ error: signatureResult.error }) };
    }
  }

  if (!depositId) {
    return ack({ message: 'Callback received without depositId' });
  }

  try {
    // 2. Re-query PawaPay for the authoritative status (don't trust the ping alone).
    const verification = await verifyPawaPayDeposit(depositId);
    /* console.log('[PawaPayCallback] Verified status:', verification.status); */

    // 3. A deposit that never completed must not leave live tickets behind.
    if (verification.status === 'failed') {
      const result = await markTicketsByPayment(getAdminClient(), { depositId, status: 'cancelled', refundStatus: null });
      /* console.log('[PawaPayCallback] Failed-deposit reconciliation:', result); */
    }

    if (verification.status === 'completed') {
      const admin = getAdminClient();
      const { data: fulfillment } = await admin
        .from('pending_ticket_fulfillments')
        .select('id')
        .eq('pawapay_deposit_id', depositId)
        .maybeSingle();
      if (fulfillment) await triggerFulfillmentWorker(fulfillment.id);
    }

    return ack({ depositId, status: verification.status });
  } catch (error) {
    console.error('[PawaPayCallback] Error (acknowledged):', error.message);
    return ack({ depositId, message: 'Callback acknowledged with error' });
  }
};
