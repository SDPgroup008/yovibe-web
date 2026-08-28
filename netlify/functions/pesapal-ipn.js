// netlify/functions/pesapal-ipn.js
//
// Phase 1: real PesaPal IPN handling. PesaPal pings this endpoint when a
// transaction status changes (COMPLETED / FAILED / REVERSED / CANCELLED).
//
// Responsibilities:
//  1. Verify the transaction status server-side (never trust the ping alone).
//  2. REVERSED / FAILED / CANCELLED  → mark any tickets paid by this order as
//     refunded/cancelled automatically (reversal reconciliation).
//  3. COMPLETED → nothing to create here: the client drives fulfillment via
//     fulfill-purchase (payload travels in that request). We still log the
//     webhook so verification stays observable.
//  4. Always answer 200 fast so PesaPal stops retrying.
//
// The PesaPal webhook URL must be registered once via /register-ipn.

const { getPesapalToken } = require('../shared/pesapalAuth');
const { getAdminClient } = require('../shared/supabaseAdmin');
const { verifyPesapalPayment, markTicketsByPayment } = require('../shared/ticketFulfillment');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function ack(extra) {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ received: true, ...(extra || {}) }),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  let orderTrackingId;
  let orderMerchantReference;
  let notificationType;

  if (event.httpMethod === 'GET') {
    orderTrackingId = event.queryStringParameters?.OrderTrackingId || event.queryStringParameters?.orderTrackingId;
    orderMerchantReference = event.queryStringParameters?.OrderMerchantReference || event.queryStringParameters?.orderMerchantReference;
    notificationType = event.queryStringParameters?.OrderNotificationType || event.queryStringParameters?.orderNotificationType;
  } else if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      orderTrackingId = body.OrderTrackingId || body.orderTrackingId;
      orderMerchantReference = body.OrderMerchantReference || body.orderMerchantReference;
      notificationType = body.OrderNotificationType || body.orderNotificationType;
    } catch {
      // Unparseable body — acknowledge anyway to avoid PesaPal retries.
      return ack({ message: 'IPN received (unparseable body)' });
    }
  } else {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  console.log('[PesaPalIPN] Notification received:', { orderTrackingId, orderMerchantReference, notificationType });

  try {
    const admin = getAdminClient();

    // Verify the payment status server-side (don't trust the ping).
    const verification = await verifyPesapalPayment({ trackingId: orderTrackingId, orderId: orderMerchantReference });
    console.log('[PesaPalIPN] Verified status:', verification.status, 'raw:', verification.rawStatus);

    // Reversal / failure reconciliation — automatically strike tickets whose
    // payment was reversed, cancelled, or failed after issuance.
    if (verification.status === 'failed' && orderMerchantReference) {
      const target =
        verification.rawStatus === 'reversed' ? { status: 'refunded', refundStatus: 'completed' }
        : verification.rawStatus === 'cancelled' || verification.rawStatus === 'invalid' ? { status: 'cancelled', refundStatus: null }
        : null;

      if (target) {
        const result = await markTicketsByPayment(admin, {
          paymentId: orderMerchantReference,
          status: target.status,
          refundStatus: target.refundStatus,
        });
        console.log('[PesaPalIPN] Reversal reconciliation:', result);
      }
    }

    return ack({ orderTrackingId, verifiedStatus: verification.status });
  } catch (error) {
    // Always 200 — an IPN processing error must not trigger PesaPal retries.
    console.error('[PesaPalIPN] Error (acknowledged):', error.message);
    return ack({ message: 'IPN received with error (acknowledged)' });
  }
};
