async function activateSponsorPayment(admin, order, verification) {
  if (!order) return null;
  if (order.payment_status === 'paid') return order;
  if (!verification || verification.status !== 'completed') return null;
  if (verification.currency !== order.currency || !require('./marketPayments').amountMatches(verification.amount, order.amount_paid)) {
    throw new Error('Verified sponsorship amount or currency does not match');
  }
  const { data: updated, error } = await admin.from('ticket_sponsorship_orders').update({
    payment_status: 'paid', amount_paid: Number(order.amount_paid || 0), paid_at: new Date().toISOString(),
    payout_eligible: true, payout_status: 'pending', updated_at: new Date().toISOString(),
  }).eq('id', order.id).in('payment_status', ['pending_payment', 'processing']).select('*').maybeSingle();
  if (error) throw error;
  if (!updated) return order;
  const { error: allocationError } = await admin.from('ticket_allocations').update({ status: 'ready_for_distribution', updated_at: new Date().toISOString() }).eq('id', updated.allocation_id).eq('status', 'awaiting_funding');
  if (allocationError) throw allocationError;
  const { data: allocation } = await admin.from('ticket_allocations').select('event_slug').eq('id', updated.allocation_id).maybeSingle();
  if (allocation) await admin.from('ticket_issuance_audits').insert({ allocation_id: updated.allocation_id, event_slug: allocation.event_slug, action: 'sponsorship_funded', entity_type: 'ticket_sponsorship_order', entity_id: updated.id, metadata: { paymentMethod: updated.payment_method, amountPaid: updated.amount_paid } });
  return updated;
}

async function failSponsorPayment(admin, order, reason) {
  if (!order || ['paid', 'refunded', 'partially_refunded'].includes(order.payment_status)) return order;
  const { data: updated, error } = await admin.from('ticket_sponsorship_orders').update({ payment_status: 'failed', updated_at: new Date().toISOString() }).eq('id', order.id).in('payment_status', ['pending_payment', 'processing']).select('*').maybeSingle();
  if (error) throw error;
  if (updated) await admin.rpc('release_ticket_allocation_reservation', { p_allocation_id: updated.allocation_id, p_actor_id: 'payment-webhook', p_reason: reason || 'Sponsor payment failed' });
  return updated || order;
}

module.exports = { activateSponsorPayment, failSponsorPayment };
