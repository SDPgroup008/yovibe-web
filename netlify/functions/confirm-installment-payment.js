const { getAdminClient } = require('../shared/supabaseAdmin');
const { confirmPaymentVerified } = require('../shared/ticketFulfillment');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { success: false, error: 'Method Not Allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { success: false, error: 'Invalid JSON body' }); }

  const planId = body.planId;
  const installmentIndex = Number(body.installmentIndex);
  const method = body.paymentMethod;
  if (!planId || !Number.isInteger(installmentIndex) || installmentIndex < 0) {
    return response(400, { success: false, error: 'planId and installmentIndex are required' });
  }
  if (!['mobile_money', 'credit_card', 'bank_transfer'].includes(method)) {
    return response(400, { success: false, error: 'Unsupported payment method' });
  }

  const verification = {
    depositId: body.depositId,
    orderId: body.orderId,
    trackingId: body.trackingId,
  };

  try {
    const confirmation = await confirmPaymentVerified(method, verification);
    if (confirmation.failed) return response(402, { success: false, status: 'failed', error: 'Payment was not completed' });
    if (!confirmation.confirmed) return response(200, { success: false, status: 'pending', message: 'Payment is still being verified' });

    const admin = getAdminClient();
    const { data: plan, error: planError } = await admin.from('ticket_installment_plans').select('*').eq('id', planId).single();
    if (planError) throw planError;
    const part = plan.installments?.[installmentIndex];
    if (!part) return response(422, { error: 'Unknown installment' });
    const { installmentAmounts } = require('../../shared/eventMoney');
    const { amountMatches } = require('../shared/marketPayments');
    const expected = installmentAmounts(plan.total_amount, plan.installments.length, plan.country_code || 'UG', plan.currency || 'UGX')[installmentIndex];
    if (!expected || !amountMatches(part.amount, expected.amount) || !amountMatches(part.totalDue, expected.totalDue)) {
      return response(409, { error: 'Installment amount requires reconciliation' });
    }
    const id = method === 'mobile_money' ? body.depositId : body.orderId;
    require('../shared/settlement').checkPayment(confirmation.verificationResult, { method, id, amount: part.totalDue, currency: plan.currency || 'UGX' });
    if (method === 'mobile_money') {
      const { data: attempt, error } = await admin.from('country_payment_attempts').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (attempt ? attempt.purpose !== 'installment' || attempt.subject_id !== planId || attempt.installment_index !== installmentIndex : plan.currency !== 'UGX') {
        return response(409, { error: 'Deposit does not belong to this installment' });
      }
    }
    if (part.status === 'paid') {
      if (id !== (method === 'mobile_money' ? part.depositId : part.orderId)) return response(409, { error: 'Already paid with another transaction' });
      return response(200, { success: true, planComplete: plan.status === 'completed', installmentsPaid: plan.installments_paid });
    }
    const payment = {
      depositId: body.depositId || null,
      orderId: body.orderId || null,
      trackingId: body.trackingId || null,
      paymentMethod: method,
      provider: body.provider || null,
      confirmationCode: confirmation.verificationResult?.confirmationCode || null,
      transactionId: confirmation.verificationResult?.transactionId || null,
    };
    const { data, error } = await admin.rpc('record_installment_payment', {
      p_plan_id: planId,
      p_installment_index: installmentIndex,
      p_payment: payment,
      p_checkout_hold_id: body.checkoutHoldId || null,
    });
    if (error) {
      const message = String(error.message || 'Unable to record installment payment');
      const status = /RESERVATION_CUTOFF|PLAN_NOT_ACTIVE|INSTALLMENT_ALREADY_PAID/.test(message) ? 409 : 500;
      return response(status, { success: false, status: 'failed', error: message });
    }

    const result = data || {};
    const reservation = result.reservation || {};
    return response(200, {
      success: true,
      planComplete: result.planComplete === true,
      installmentsPaid: result.installmentsPaid,
      reservationId: reservation.reservationId || null,
      reservationStatus: reservation.status || 'none',
      reservationError: reservation.error || null,
    });
  } catch (error) {
    console.error('[ConfirmInstallmentPayment] Error:', error.message);
    return response(500, { success: false, error: error.message || 'Unable to confirm installment payment' });
  }
};
