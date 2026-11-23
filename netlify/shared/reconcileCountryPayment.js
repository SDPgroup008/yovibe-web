const { amountMatches, invalid } = require('./marketPayments');

async function reconcileCountryPayment(admin, attempt, result) {
  if (!result || result.rawStatus === 'NOT_FOUND' || result.status === 'pending') return false;
  if (result.status === 'completed') {
    if (!amountMatches(attempt.amount, result.amount) || attempt.currency !== result.currency ||
        attempt.provider !== result.provider || result.depositId !== attempt.id) throw invalid('Deposit requires reconciliation', 409);
    const snapshot = attempt.checkout;
    if (attempt.purpose === 'ticket') {
      const { handler } = require('../functions/fulfill-purchase');
      const reply = await handler({ httpMethod: 'POST', body: JSON.stringify({
        ...snapshot, fulfillmentId: attempt.subject_id, eventId: attempt.event_slug, totalAmount: attempt.amount,
        payment: { method: 'mobile_money', provider: attempt.provider }, verification: { depositId: attempt.id },
      }) });
      if (reply.statusCode !== 200 || JSON.parse(reply.body).status === 'pending') return false;
    } else if (attempt.purpose === 'installment') {
      const { handler } = require('../functions/confirm-installment-payment');
      const reply = await handler({ httpMethod: 'POST', body: JSON.stringify({ planId: attempt.subject_id,
        installmentIndex: attempt.installment_index, depositId: attempt.id, paymentMethod: 'mobile_money',
        provider: attempt.provider, checkoutHoldId: snapshot.checkoutHoldId }) });
      const confirmed = JSON.parse(reply.body);
      if (reply.statusCode !== 200 || !confirmed.success) return false;
      if (confirmed.planComplete) {
        const { handler: fulfill } = require('../functions/retry-installment-fulfillment');
        const completion = await fulfill({ httpMethod: 'POST', headers: {
          'x-fulfillment-worker-secret': require('./runtimeConfig').requiredEnv('FULFILLMENT_WORKER_SECRET'),
        }, body: JSON.stringify({ planId: attempt.subject_id }) });
        if (completion.statusCode !== 200 || !JSON.parse(completion.body).success) return false;
      }
    } else if (attempt.purpose === 'sponsorship') {
      const { data: order, error } = await admin.from('ticket_sponsorship_orders').select('*').eq('id', attempt.subject_id).single();
      if (error) throw error;
      await require('./sponsorPayments').activateSponsorPayment(admin, order, result);
    }
  } else if (result.status !== 'failed') return false;
  const { error } = await admin.from('country_payment_attempts').update({ status: result.status })
    .eq('id', attempt.id).eq('status', 'pending');
  if (error) throw error;
  return true;
}

async function recoverCountryPayments(admin) {
  const { data, error } = await admin.from('country_payment_attempts').select('*').eq('status', 'pending')
    .lte('next_check_at', new Date().toISOString())
    .lt('created_at', new Date(Date.now() - 60000).toISOString()).order('next_check_at').order('id').limit(20);
  if (error) throw error;
  const { verifyPawaPayDeposit } = require('./ticketFulfillment');
  for (const attempt of data || []) {
    const nextCheck = new Date(Date.now() + 5 * 60000).toISOString();
    const { data: claimed, error } = await admin.from('country_payment_attempts').update({ next_check_at: nextCheck })
      .eq('id', attempt.id).eq('status', 'pending').eq('next_check_at', attempt.next_check_at).select('id');
    if (error) throw error;
    if (!claimed?.length) continue;
    try { await reconcileCountryPayment(admin, attempt, await verifyPawaPayDeposit(attempt.id)); }
    catch { console.warn('[CountryPayments] Pending deposit requires another reconciliation pass'); }
  }
}
module.exports = { reconcileCountryPayment, recoverCountryPayments };
