// netlify/functions/pawapay-checkout-callback.js
//
// PawaPay checkout callback webhook (required by the PawaPay dashboard even
// though the YoVibe app does not use PawaPay checkouts). PawaPay POSTs a JSON
// body when a checkout reaches a final status: { checkoutId, status, ... }.
//
//  1. Verifies the callback signature when PAWAPAY_SIGNED_CALLBACKS=true.
//  2. Logs and acknowledges — no side effects (checkouts are unused).

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

  // Signature verification (fail closed when signing is enabled).
  const signatureResult = await verifyCallbackSignature(event);
  if (!signatureResult.ok) {
    console.warn('[PawaPayCheckoutCallback] Signature verification failed:', signatureResult.error);
    return { statusCode: 401, headers, body: JSON.stringify({ error: signatureResult.error }) };
  }

  let checkoutId;
  let status;
  try {
    const payload = JSON.parse(event.body || '{}');
    checkoutId = payload.checkoutId || payload.checkout_id || (event.queryStringParameters && event.queryStringParameters.checkoutId);
    status = payload.status || (event.queryStringParameters && event.queryStringParameters.status);
  } catch {
    // fall through — acknowledge without ids
  }

  console.log('[PawaPayCheckoutCallback] Received checkout callback:', { checkoutId, status });

  // Checkouts are not used by the app — acknowledge and move on.
  return ack({ checkoutId, status: String(status || '').toUpperCase() });
};
