const { installmentAmounts } = require('../../shared/eventMoney');
const crypto = require('node:crypto');
const { amountMatches, invalid, ticketQuote } = require('./marketPayments');
const { getAdminClient } = require('./supabaseAdmin');
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

async function prepareAttempt(body, admin = getAdminClient()) {
  const context = body.checkout;
  if (!context || !uuid.test(context.subjectId)) throw invalid('A valid checkout reference is required', 400);
  const { data: event, error } = await admin.from('events').select('*')
    .eq('slug', context.eventSlug).eq('is_deleted', false).maybeSingle();
  if (error) throw error;
  if (!event || event.event_status === 'cancelled') throw invalid('Event unavailable', 409);
  if (event.currency !== body.currency) throw invalid('Event currency changed. Refresh checkout.', 409);
  let quote;
  let snapshot;
  if (context.purpose === 'ticket') {
    quote = ticketQuote(event, context.ticketType, context.quantity);
    if (!Array.isArray(context.buyerNames) || context.buyerNames.length !== context.quantity ||
        !Array.isArray(context.deliveryEmails) || context.deliveryEmails.length !== context.quantity) throw invalid('Attendee details are incomplete');
    if (context.buyerPhotoDataUrl && (typeof context.buyerPhotoDataUrl !== 'string' ||
        context.buyerPhotoDataUrl.length > 5592450 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(context.buyerPhotoDataUrl))) throw invalid('Invalid checkout photo');
    snapshot = { buyerPhotoDataUrl: context.buyerPhotoDataUrl || null, ticketType: context.ticketType, quantity: context.quantity, ...quote, buyerNames: context.buyerNames,
      deliveryEmails: context.deliveryEmails, buyerEmails: context.deliveryEmails, payerEmail: context.payerEmail,
      buyerId: context.buyerId || null, buyerPhotoUrl: context.buyerPhotoUrl || null, seatNumbers: context.seatNumbers,
      tableNumbers: context.tableNumbers, inventoryHoldIds: context.inventoryHoldIds, inventorySessionId: context.inventorySessionId };
  } else if (context.purpose === 'installment') {
    const { data: plan, error } = await admin.from('ticket_installment_plans').select('*')
      .eq('id', context.subjectId).eq('event_id', event.slug).single();
    if (error) throw error;
    const index = context.installmentIndex;
    if (!Number.isInteger(index) || index < 0 || plan.status !== 'active' || index !== plan.installments_paid) throw invalid('Installment unavailable');
    const part = plan.installments[index];
    if (!part || part.status === 'paid') throw invalid('Installment unavailable');
    const validPlan = await planQuote(admin, event, plan);
    if (!amountMatches(plan.total_amount, validPlan.amount)) throw invalid('Installment plan price requires review', 409);
    const expected = installmentAmounts(validPlan.amount, plan.installments.length, event.country_code, event.currency)[index];
    if (!amountMatches(expected.totalDue, part.totalDue) || !amountMatches(expected.amount, part.amount)) throw invalid('Installment amount requires review', 409);
    quote = { amount: expected.totalDue };
    snapshot = { checkoutHoldId: plan.checkout_hold_id, quote: validPlan };
  } else if (context.purpose === 'sponsorship') {
    const { data: order, error } = await admin.from('ticket_sponsorship_orders')
      .select('amount_paid,currency,payment_status,ticket_allocations!inner(event_slug)').eq('id', context.subjectId).single();
    if (error) throw error;
    if (order.payment_status !== 'processing' || order.ticket_allocations.event_slug !== event.slug || order.currency !== event.currency) throw invalid('Sponsorship unavailable');
    quote = { amount: order.amount_paid };
    snapshot = {};
  } else throw invalid('Invalid checkout purpose');

  if (!amountMatches(quote.amount, body.amount)) throw invalid('Ticket prices have changed. Refresh checkout.', 409);
  return { id: crypto.randomUUID(), purpose: context.purpose, subject_id: context.subjectId,
    installment_index: context.purpose === 'installment' ? context.installmentIndex : -1,
    event_slug: event.slug, country_code: event.country_code, currency: event.currency,
    amount: quote.amount, provider: body.provider, checkout: snapshot };
}

async function saveAttempt(admin, attempt, phoneNumber) {
  // Retrying an ambiguous submission must use the same pawaPay depositId.
  const digest = crypto.createHash('sha256').update(JSON.stringify([
    phoneNumber, attempt.event_slug, attempt.currency, attempt.amount, attempt.provider, attempt.checkout,
  ])).digest('hex');
  const { buyerPhotoDataUrl, ...checkout } = attempt.checkout;
  attempt.checkout = { ...checkout, requestDigest: digest };
  if (buyerPhotoDataUrl) {
    const { uploadImageDataUrl } = require('./ticketFulfillment');
    attempt.checkout.buyerPhotoUrl = await uploadImageDataUrl(buyerPhotoDataUrl, 'buyer-photos', 'purchase_' + attempt.id);
  }
  const { error } = await admin.from('country_payment_attempts').insert(attempt);
  if (!error) return attempt;
  if (error.code !== '23505') throw error;
  const { data: previous, error: readError } = await admin.from('country_payment_attempts')
    .select('id,status,checkout').eq('purpose', attempt.purpose).eq('subject_id', attempt.subject_id)
    .eq('installment_index', attempt.installment_index).neq('status', 'failed').maybeSingle();
  if (readError) throw readError;
  if (previous?.checkout?.requestDigest === digest) return previous;
  throw invalid('Another payment is in progress for this order. Check its status before retrying.', 409);
}

async function planQuote(admin, event, plan) {
  const first = plan.installments?.[0];
  if (first?.depositId) {
    const { data, error } = await admin.from('country_payment_attempts').select('checkout')
      .eq('id', first.depositId).eq('purpose', 'installment').eq('subject_id', plan.id).eq('installment_index', 0).maybeSingle();
    if (error) throw error;
    if (data?.checkout?.quote) return data.checkout.quote;
  }
  return ticketQuote(event, plan.ticket_type, plan.quantity, new Date(plan.created_at));
}

module.exports = { prepareAttempt, saveAttempt, planQuote };
