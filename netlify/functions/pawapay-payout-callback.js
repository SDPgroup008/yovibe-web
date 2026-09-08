// netlify/functions/pawapay-payout-callback.js
//
// PawaPay payout callback webhook. PawaPay POSTs a JSON body when a payout
// status changes: { payoutId, status, providerTransactionId, failureReason, ... }
//
//  1. Verifies the callback signature when PAWAPAY_SIGNED_CALLBACKS=true.
//  2. Reconciles the `payouts` table when the payout can be matched (by
//     transaction_reference or metadata.pawapay_payout_id).
//  3. Always acknowledges with 200 so PawaPay stops retrying.
//
// The app confirms payouts by polling verify-pawapay-payout, so this callback
// is a supplementary reconciliation signal, not a gate.

const { getAdminClient } = require('../shared/supabaseAdmin');
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

function normalizeStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETED') return 'completed';
  if (s === 'FAILED' || s === 'REJECTED') return 'failed';
  if (s === 'ENQUEUED' || s === 'ACCEPTED' || s === 'PROCESSING') return 'pending';
  return 'pending';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return ack({ message: 'Payout callback endpoint is healthy' });

  const signatureResult = await verifyCallbackSignature(event);
  if (!signatureResult.ok || !signatureResult.verified) {
    const error = signatureResult.error || 'Signed PawaPay payout callbacks must be enabled';
    console.warn('[PawaPayPayoutCallback] Signature verification failed:', error);
    return { statusCode: 401, headers, body: JSON.stringify({ error }) };
  }

  let payoutId;
  let status;
  let failureMessage;
  try {
    const payload = JSON.parse(event.body || '{}');
    payoutId = payload.payoutId || payload.payout_id || (event.queryStringParameters && event.queryStringParameters.payoutId);
    status = payload.status || payload.payoutStatus;
    failureMessage = payload.failureReason?.failureMessage || payload.failureMessage;
  } catch {
    return ack({ message: 'Payout callback received (unparseable body)' });
  }

  /* console.log('[PawaPayPayoutCallback] Received payout callback:', { payoutId, status, failureMessage }); */

  if (!payoutId) {
    return ack({ message: 'Payout callback received without payoutId' });
  }

  try {
    const admin = getAdminClient();
    const normalized = normalizeStatus(status);

    // Best-effort reconciliation: match by transaction_reference or the
    // stored PawaPay payout id in metadata.
    const { data: matched } = await admin
      .from('payouts')
      .select('id, ticket_ids, metadata')
      .or(`transaction_reference.eq.${payoutId},metadata->>pawapay_payout_id.eq.${payoutId}`)
      .limit(5);

    if (matched && matched.length > 0) {
      const now = new Date().toISOString();
      for (const payout of matched) {
        const update = {
          status: normalized === 'completed' ? 'completed'
            : normalized === 'failed' ? 'failed'
            : 'processing',
          processed_date: normalized === 'completed' ? now : null,
          metadata: {
            ...(payout.metadata && typeof payout.metadata === 'object' ? payout.metadata : {}),
            pawapay_payout_id: payoutId,
            pawapay_status: status,
            failure_message: failureMessage || null,
          },
          updated_at: now,
        };
        await admin.from('payouts').update(update).eq('id', payout.id);

        const ticketIds = Array.isArray(payout.ticket_ids) ? payout.ticket_ids : [];
        if (ticketIds.length && normalized === 'completed') {
          await admin.from('tickets')
            .update({ payout_status: 'paid', payout_eligible: false, payout_date: now })
            .in('id', ticketIds).eq('payout_status', 'processing');
        } else if (ticketIds.length && normalized === 'failed') {
          await admin.from('tickets')
            .update({ payout_status: 'pending', payout_eligible: true })
            .in('id', ticketIds).eq('payout_status', 'processing')
            .eq('status', 'used').eq('is_scanned', true).eq('refund_status', 'none');
        }
      }
    } else {
      /* console.log('[PawaPayPayoutCallback] No matching payout row for', payoutId, '(acknowledged)'); */
    }

    return ack({ payoutId, status: normalized });
  } catch (error) {
    console.error('[PawaPayPayoutCallback] Error (acknowledged):', error.message);
    return ack({ payoutId, message: 'Payout callback acknowledged with error' });
  }
};
