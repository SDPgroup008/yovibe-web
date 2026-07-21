const { getAdminClient, json } = require('../shared/supabaseAdmin');

function normalizeStatus(value) {
  const status = String(value || '').toUpperCase();
  if (status === 'COMPLETED') return 'completed';
  if (status === 'FAILED' || status === 'REJECTED') return 'failed';
  if (status === 'PROCESSING' || status === 'ENQUEUED' || status === 'ACCEPTED') return 'submitted';
  return 'needs_attention';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const payload = JSON.parse(event.body || '{}');
    const refundId = payload.refundId || payload.refund_id;
    if (!refundId) return json(400, { error: 'refundId is required' });
    const admin = getAdminClient();
    const { data: refund, error } = await admin.from('refund_requests').select('*').eq('external_refund_id', refundId).single();
    if (error || !refund) return json(404, { error: 'Refund not found' });
    const status = normalizeStatus(payload.status || payload.refundStatus);
    const update = { status, processor_payload: payload, updated_at: new Date().toISOString(), ...(status === 'completed' ? { completed_at: new Date().toISOString(), refunded_amount: refund.approved_amount } : {}), ...(status === 'failed' ? { failed_at: new Date().toISOString() } : {}) };
    const result = await admin.from('refund_requests').update(update).eq('id', refund.id).select('*').single();
    if (result.error) throw result.error;
    await admin.from('refund_status_history').insert({ refund_request_id: refund.id, from_status: refund.status, to_status: status, actor_type: 'pawapay_callback', note: 'PawaPay refund callback received', processor_payload: payload });
    if (status === 'completed' && refund.ticket_id) {
      await admin.from('tickets').update({ status: 'refunded', refund_status: 'completed', refunded_amount: refund.approved_amount }).eq('id', refund.ticket_id);
    }
    return json(200, { received: true, status });
  } catch (error) {
    console.error('pawapay-refund-callback error', error);
    return json(500, { error: error.message || 'Callback processing failed' });
  }
};
