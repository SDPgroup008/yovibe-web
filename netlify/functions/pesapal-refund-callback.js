// PesaPal refund callback webhook
// PesaPal may send async status updates after a refund request is submitted.
const { getAdminClient, json } = require('../shared/supabaseAdmin');

function normalizePesaPalStatus(value) {
  const status = String(value || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'SUCCESS') return 'completed';
  if (status === 'FAILED' || status === 'REVERSED') return 'failed';
  if (status === 'PENDING' || status === 'PROCESSING') return 'submitted';
  return 'needs_attention';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const payload = JSON.parse(event.body || '{}');
    const confirmationCode = payload.confirmation_code || payload.ConfirmationCode || payload.order_notification?.MerchantReference;
    const pesapalTrackingId = payload.tracking_id || payload.TrackingId || payload.order_notification?.TrackingId;
    const refundStatus = payload.status || payload.Status || payload.payment_status_description || payload.order_notification?.PaymentStatusDescription;

    if (!confirmationCode && !pesapalTrackingId) {
      return json(400, { error: 'confirmation_code or tracking_id is required' });
    }

    const admin = getAdminClient();

    // Look up refund by processor_confirmation_code or external_refund_id
    let refund;
    if (confirmationCode) {
      const { data } = await admin.from('refund_requests')
        .select('*').eq('processor_confirmation_code', confirmationCode).maybeSingle();
      refund = data;
    }
    if (!refund && pesapalTrackingId) {
      const { data } = await admin.from('refund_requests')
        .select('*').eq('external_refund_id', pesapalTrackingId).maybeSingle();
      refund = data;
    }
    if (!refund) return json(404, { error: 'Refund not found' });

    const status = normalizePesaPalStatus(refundStatus);
    const update = {
      status,
      processor_payload: payload,
      updated_at: new Date().toISOString(),
      ...(status === 'completed'
        ? { completed_at: new Date().toISOString(), refunded_amount: refund.approved_amount }
        : {}),
      ...(status === 'failed' ? { failed_at: new Date().toISOString() } : {}),
    };

    const result = await admin.from('refund_requests').update(update).eq('id', refund.id).select('*').single();
    if (result.error) throw result.error;

    await admin.from('refund_status_history').insert({
      refund_request_id: refund.id, from_status: refund.status, to_status: status,
      actor_type: 'pesapal_callback', note: 'PesaPal refund callback received', processor_payload: payload,
    });

    if (status === 'completed' && refund.ticket_id) {
      await admin.from('tickets').update({
        status: 'refunded', refund_status: 'completed', refunded_amount: refund.approved_amount,
      }).eq('id', refund.ticket_id);
    }

    return json(200, { received: true, status });
  } catch (error) {
    console.error('pesapal-refund-callback error', error);
    return json(500, { error: error.message || 'Callback processing failed' });
  }
};
