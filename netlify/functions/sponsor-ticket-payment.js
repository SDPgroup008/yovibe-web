const { getAdminClient } = require('../shared/supabaseAdmin');
const { hashSecret } = require('../shared/guestTicketAllocations');
const { siteBaseUrl, calculateGatewayFee, verifyPesapalPayment, verifyPawaPayDeposit } = require('../shared/ticketFulfillment');
const { activateSponsorPayment, failSponsorPayment } = require('../shared/sponsorPayments');

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

function quoteForPaymentMethod(order, method) {
  const subtotal = Math.max(0, Number(order.face_value || 0) - Number(order.discount_amount || 0));
  const gatewayFee = calculateGatewayFee(method, subtotal);
  return { subtotal, gatewayFee, total: subtotal + gatewayFee };
}

async function resetPendingPayment(admin, orderId, subtotal) {
  await admin.from('ticket_sponsorship_orders').update({
    payment_method: null,
    gateway_fee: 0,
    amount_paid: subtotal,
    payment_status: 'pending_payment',
    updated_at: new Date().toISOString(),
  }).eq('id', orderId).eq('payment_status', 'processing');
}

async function orderForToken(admin, token) {
  const { data: order, error } = await admin.from('ticket_sponsorship_orders').select('*, ticket_allocations(*, events(name,date,time,venue_name,poster_image_url))').eq('payment_token_hash', hashSecret(`sponsor:${token}`)).maybeSingle();
  if (error) throw error;
  if (!order || (order.payment_token_expires_at && new Date(order.payment_token_expires_at) <= new Date())) throw Object.assign(new Error('This sponsor payment link is invalid or expired'), { statusCode: 404 });
  return order;
}

async function providerStatus(admin, order) {
  if (order.payment_status === 'paid') return order;
  let verification = null;
  if (order.payment_method === 'mobile_money' && order.provider_deposit_id) verification = await verifyPawaPayDeposit(order.provider_deposit_id);
  if (order.payment_method === 'credit_card' && (order.provider_tracking_id || order.payment_reference)) verification = await verifyPesapalPayment({ trackingId: order.provider_tracking_id, orderId: order.payment_reference });
  if (!verification) return order;
  if (verification.status === 'completed') return activateSponsorPayment(admin, order, verification);
  if (verification.status === 'failed') return failSponsorPayment(admin, order, verification.rawStatus || 'Provider payment failed');
  return order;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const token = String(body.token || '').trim();
    const admin = getAdminClient();
    const order = await orderForToken(admin, token);
    const action = body.action || 'details';
    if (action === 'details' || action === 'status') {
      const current = action === 'status' ? await providerStatus(admin, order) : order;
      const allocation = current.ticket_allocations || {};
      return reply(200, {
        order: {
          sponsorName: current.sponsor_name, sponsorOrganisation: current.sponsor_organisation, sponsorPhone: current.sponsor_phone,
          amount: current.amount_paid, currency: current.currency, paymentMethod: current.payment_method, paymentStatus: current.payment_status,
          paymentOptions: {
            credit_card: quoteForPaymentMethod(current, 'credit_card'),
            mobile_money: quoteForPaymentMethod(current, 'mobile_money'),
          },
        },
        allocation: { name: allocation.allocation_name, ticketType: allocation.entry_fee_type, quantity: allocation.total_quantity, event: allocation.events },
      });
    }
    if (action !== 'initiate') throw Object.assign(new Error('Unknown action'), { statusCode: 400 });
    if (order.payment_status === 'paid') return reply(200, { status: 'paid' });
    if (order.payment_status === 'failed') throw Object.assign(new Error('This sponsor payment is no longer active'), { statusCode: 409 });
    if (order.payment_status === 'processing') throw Object.assign(new Error('A payment attempt is already in progress. Complete it or wait for verification before trying again.'), { statusCode: 409 });
    const paymentMethod = String(body.paymentMethod || '').trim();
    if (!['credit_card', 'mobile_money'].includes(paymentMethod)) throw Object.assign(new Error('Choose card or mobile money before continuing'), { statusCode: 422 });
    const quote = quoteForPaymentMethod(order, paymentMethod);
    const { data: paymentOrder, error: paymentOrderError } = await admin.from('ticket_sponsorship_orders').update({
      payment_method: paymentMethod,
      gateway_fee: quote.gatewayFee,
      amount_paid: quote.total,
      payment_status: 'processing',
      updated_at: new Date().toISOString(),
    }).eq('id', order.id).eq('payment_status', 'pending_payment').select('*').maybeSingle();
    if (paymentOrderError) throw paymentOrderError;
    if (!paymentOrder) throw Object.assign(new Error('This sponsorship payment is already being prepared. Refresh the page for its current status.'), { statusCode: 409 });
    const currentOrigin = siteBaseUrl();
    if (paymentMethod === 'credit_card') {
      const { handler } = require('./create-pesapal-order');
      let result;
      try {
        result = await handler({ httpMethod: 'POST', body: JSON.stringify({ amount: paymentOrder.amount_paid, description: `YoVibe sponsorship ${paymentOrder.id}`, buyerEmail: paymentOrder.sponsor_email, buyerPhone: paymentOrder.sponsor_phone, buyerName: paymentOrder.sponsor_name, callbackUrl: `${currentOrigin}/sponsor/pay/${token}` }) });
      } catch (error) {
        await resetPendingPayment(admin, paymentOrder.id, quote.subtotal);
        throw error;
      }
      const data = JSON.parse(result.body || '{}');
      if (result.statusCode >= 400 || !data.success) {
        await resetPendingPayment(admin, paymentOrder.id, quote.subtotal);
        throw Object.assign(new Error(data.error || 'Unable to start card payment'), { statusCode: 502 });
      }
      await admin.from('ticket_sponsorship_orders').update({ payment_reference: data.orderId, provider_tracking_id: data.trackingId || null, updated_at: new Date().toISOString() }).eq('id', paymentOrder.id);
      return reply(200, { method: 'credit_card', iframeUrl: data.iframeUrl });
    }
    const { handler } = require('./create-pawapay-deposit');
    const sponsorPhone = String(body.phoneNumber || paymentOrder.sponsor_phone || '').trim();
    if (!sponsorPhone) {
      await resetPendingPayment(admin, paymentOrder.id, quote.subtotal);
      throw Object.assign(new Error('Enter the mobile-money number that should receive the payment prompt'), { statusCode: 422 });
    }
    let result;
    try {
      result = await handler({ httpMethod: 'POST', body: JSON.stringify({ amount: Math.round(Number(paymentOrder.amount_paid)), currency: paymentOrder.currency, phoneNumber: sponsorPhone, provider: body.provider, buyerEmail: paymentOrder.sponsor_email, buyerName: paymentOrder.sponsor_name }) });
    } catch (error) {
      await resetPendingPayment(admin, paymentOrder.id, quote.subtotal);
      throw error;
    }
    const data = JSON.parse(result.body || '{}');
    if (result.statusCode >= 400 || !data.success) {
      await resetPendingPayment(admin, paymentOrder.id, quote.subtotal);
      throw Object.assign(new Error(data.error || 'Unable to start mobile-money payment'), { statusCode: 502 });
    }
    await admin.from('ticket_sponsorship_orders').update({ sponsor_phone: sponsorPhone, provider_deposit_id: data.depositId, payment_reference: data.depositId, updated_at: new Date().toISOString() }).eq('id', paymentOrder.id);
    return reply(200, { method: 'mobile_money', status: data.status, depositId: data.depositId });
  } catch (error) {
    console.error('[SponsorTicketPayment]', error.message);
    return reply(error.statusCode || 500, { error: error.message || 'Unable to process sponsor payment' });
  }
};
