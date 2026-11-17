const { getAdminClient } = require('../shared/supabaseAdmin');
const { hashSecret } = require('../shared/guestTicketAllocations');
const { siteBaseUrl, verifyPesapalPayment, verifyPawaPayDeposit } = require('../shared/ticketFulfillment');
const { activateSponsorPayment, failSponsorPayment } = require('../shared/sponsorPayments');

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

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
      return reply(200, { order: { sponsorName: current.sponsor_name, sponsorOrganisation: current.sponsor_organisation, amount: current.amount_paid, currency: current.currency, paymentMethod: current.payment_method, paymentStatus: current.payment_status }, allocation: { name: allocation.allocation_name, ticketType: allocation.entry_fee_type, quantity: allocation.total_quantity, event: allocation.events } });
    }
    if (action !== 'initiate') throw Object.assign(new Error('Unknown action'), { statusCode: 400 });
    if (order.payment_status === 'paid') return reply(200, { status: 'paid' });
    if (order.payment_status === 'failed') throw Object.assign(new Error('This sponsor payment is no longer active'), { statusCode: 409 });
    const currentOrigin = siteBaseUrl();
    if (order.payment_method === 'credit_card') {
      const { handler } = require('./create-pesapal-order');
      const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ amount: order.amount_paid, description: `YoVibe sponsorship ${order.id}`, buyerEmail: order.sponsor_email, buyerPhone: order.sponsor_phone, buyerName: order.sponsor_name, callbackUrl: `${currentOrigin}/sponsor/pay/${token}` }) });
      const data = JSON.parse(result.body || '{}');
      if (result.statusCode >= 400 || !data.success) throw Object.assign(new Error(data.error || 'Unable to start card payment'), { statusCode: 502 });
      await admin.from('ticket_sponsorship_orders').update({ payment_reference: data.orderId, provider_tracking_id: data.trackingId || null, payment_status: 'processing', updated_at: new Date().toISOString() }).eq('id', order.id);
      return reply(200, { method: 'credit_card', iframeUrl: data.iframeUrl });
    }
    const { handler } = require('./create-pawapay-deposit');
    const result = await handler({ httpMethod: 'POST', body: JSON.stringify({ amount: Math.round(Number(order.amount_paid)), currency: order.currency, phoneNumber: order.sponsor_phone, provider: body.provider, buyerEmail: order.sponsor_email, buyerName: order.sponsor_name }) });
    const data = JSON.parse(result.body || '{}');
    if (result.statusCode >= 400 || !data.success) throw Object.assign(new Error(data.error || 'Unable to start mobile-money payment'), { statusCode: 502 });
    await admin.from('ticket_sponsorship_orders').update({ provider_deposit_id: data.depositId, payment_reference: data.depositId, payment_status: 'processing', updated_at: new Date().toISOString() }).eq('id', order.id);
    return reply(200, { method: 'mobile_money', status: data.status, depositId: data.depositId });
  } catch (error) {
    console.error('[SponsorTicketPayment]', error.message);
    return reply(error.statusCode || 500, { error: error.message || 'Unable to process sponsor payment' });
  }
};
