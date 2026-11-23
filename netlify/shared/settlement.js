const { installmentAmounts } = require('../../shared/eventMoney');
const { amountMatches, invalid, ticketQuote } = require('./marketPayments');
const { confirmPaymentVerified } = require('./ticketFulfillment');

function checkPayment(result, expected) {
  const id = expected.method === 'mobile_money' ? result.depositId : result.merchantReference;
  if (result.status !== 'completed' || result.currency !== expected.currency ||
      !amountMatches(result.amount, expected.amount) || !id || id !== expected.id) {
    throw invalid('The verified transaction does not match this order', 409);
  }
}

async function verifyOrder(admin, event, purchase, verification) {
  const currency = event.currency || 'UGX';
  const method = purchase.payment.method;
  const id = method === 'mobile_money' ? verification.depositId : verification.orderId;
  if (!id) throw invalid('A payment reference is required', 400);
  const confirmation = await confirmPaymentVerified(method, verification, 1);
  if (!confirmation.confirmed) return confirmation;
  const verified = confirmation.verificationResult;
  if (purchase.installmentPlanId) {
    const { data: plan, error } = await admin.from('ticket_installment_plans').select('*').eq('id', purchase.installmentPlanId).single();
    if (error) throw error;
    if (plan.status !== 'completed' || plan.event_id !== event.slug || plan.ticket_type !== purchase.ticketType ||
        plan.quantity !== purchase.quantity || !amountMatches(plan.total_amount, purchase.totalAmount)) throw invalid('Installment plan does not match this order');
    const parts = plan.installments;
    if (!Array.isArray(parts) || parts.length < 2 || parts.length > 5) throw invalid('Invalid installment schedule');
    const schedule = installmentAmounts(plan.total_amount, parts.length, event.country_code, currency);
    const ids = new Set();
    let principal = 0n;
    const { decimal } = require('./marketPayments');
    const { toMinorUnits } = require('./money');
    for (const [index, part] of parts.entries()) {
      const mobile = part.paymentMethod === 'mobile_money';
      const ref = mobile ? part.depositId : part.orderId;
      if (!ref || ids.has(ref) || part.status !== 'paid' || (index === parts.length - 1 && ref !== id)) throw invalid('Installment payments could not be reconciled');
      if (!amountMatches(schedule[index].amount, part.amount) || !amountMatches(schedule[index].totalDue, part.totalDue)) throw invalid("Installment amount requires reconciliation");
      ids.add(ref);
      principal += toMinorUnits(decimal(part.amount), 2);
      const partResult = ref === id ? confirmation : await confirmPaymentVerified(part.paymentMethod, part, 1);
      if (!partResult.confirmed) return partResult;
      checkPayment(partResult.verificationResult, { currency, amount: part.totalDue, method: part.paymentMethod, id: ref });
    }
    if (principal !== toMinorUnits(decimal(plan.total_amount), 2)) throw invalid('Installment principal does not match the plan');
    const quote = await require('./checkoutAttempt').planQuote(admin, event, plan);
    if (!amountMatches(quote.amount, plan.total_amount)) throw invalid('Installment price requires reconciliation');
    return { ...confirmation, quote };
  }

  let quote;
  if (method === 'mobile_money') {
    const { data: attempt, error } = await admin.from('country_payment_attempts').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (attempt) {
      if (attempt.purpose !== 'ticket' || attempt.subject_id !== purchase.fulfillmentId ||
          attempt.event_slug !== event.slug || attempt.currency !== currency || attempt.checkout.ticketType !== purchase.ticketType ||
          attempt.checkout.quantity !== purchase.quantity || attempt.provider !== verified.provider) throw invalid('Transaction is assigned to another order', 409);
      quote = attempt.checkout;
    } else if (currency !== 'UGX') throw invalid('Missing checkout reference', 409);
  }
  quote ||= ticketQuote(event, purchase.ticketType, purchase.quantity);
  if (!amountMatches(quote.amount, purchase.totalAmount) || !!purchase.isTableEntry !== quote.isTableEntry ||
      (quote.isTableEntry && Number(purchase.tableSize) !== quote.tableSize)) throw invalid('Ticket prices have changed. Refresh checkout.', 409);
  checkPayment(verified, { id, currency, amount: quote.amount, method });
  return { ...confirmation, quote };
}
module.exports = { checkPayment, verifyOrder };
