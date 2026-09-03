// Protected recovery endpoint for installment plans whose final payment was
// recorded but ticket fulfillment was rejected or interrupted before a queue
// row was created. It reuses fulfill-purchase, so payment verification,
// inventory locking, ticket creation, and idempotency remain centralized.

const { getAdminClient } = require('../shared/supabaseAdmin');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Fulfillment-Worker-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function reply(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function suppliedSecret(event) {
  return event.headers?.['x-fulfillment-worker-secret']
    || event.headers?.['X-Fulfillment-Worker-Secret']
    || '';
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { success: false, error: 'Method Not Allowed' });

  const expectedSecret = process.env.FULFILLMENT_WORKER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!expectedSecret || suppliedSecret(event) !== expectedSecret) {
    return reply(401, { success: false, error: 'Unauthorized' });
  }

  const body = parseBody(event);
  if (!body) return reply(400, { success: false, error: 'Invalid JSON body' });
  const planId = String(body.planId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)) {
    return reply(400, { success: false, error: 'A valid planId is required' });
  }

  try {
    const admin = getAdminClient();
    const { data: plan, error: planError } = await admin
      .from('ticket_installment_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan) return reply(404, { success: false, error: 'Installment plan not found' });

    const existingTicketIds = Array.isArray(plan.ticket_ids) ? plan.ticket_ids : [];
    if (existingTicketIds.length > 0) {
      return reply(200, {
        success: true,
        alreadyFulfilled: true,
        planId,
        ticketIds: existingTicketIds,
      });
    }
    if (plan.status !== 'completed') {
      return reply(409, { success: false, error: `Plan is not completed (status: ${plan.status})` });
    }

    const installments = Array.isArray(plan.installments) ? plan.installments : [];
    const lastInstallment = installments[installments.length - 1];
    if (!lastInstallment || lastInstallment.status !== 'paid') {
      return reply(409, { success: false, error: 'The final installment is not recorded as paid' });
    }

    const method = lastInstallment.paymentMethod || 'mobile_money';
    const isMobileMoney = method === 'mobile_money';
    const verification = isMobileMoney
      ? { depositId: lastInstallment.depositId }
      : {
          orderId: lastInstallment.orderId || lastInstallment.depositId,
          trackingId: lastInstallment.trackingId,
        };
    const verificationId = isMobileMoney ? verification.depositId : verification.orderId;
    if (!verificationId) {
      return reply(409, { success: false, error: 'The final payment verification identifier is missing' });
    }

    const qty = Math.max(1, Math.floor(Number(plan.quantity) || 0));
    const tableSize = Math.max(1, Math.floor(Number(plan.table_size) || 1));
    const isTableEntry = plan.is_table_entry === true;
    const photo = plan.buyer_photo_url || '';
    const siteUrl = process.env.SITE_URL || process.env.URL || 'https://yovibe.net';
    const fulfillmentPayload = {
      // The plan UUID is deterministic, making this retry idempotent.
      fulfillmentId: plan.id,
      eventId: plan.event_id,
      ticketType: plan.ticket_type,
      quantity: qty,
      totalAmount: plan.total_amount,
      isTableEntry,
      tableSize: isTableEntry ? tableSize : undefined,
      buyerNames: plan.buyer_names || [],
      buyerEmails: plan.buyer_emails || [],
      deliveryEmails: plan.delivery_emails || [],
      payerEmail: plan.payer_email || plan.buyer_email,
      buyerId: plan.buyer_id,
      buyerPhone: plan.payment_number,
      buyerPhotoUrl: /^https?:\/\//.test(photo) ? photo : undefined,
      buyerPhotoDataUrl: /^data:image\//.test(photo) ? photo : undefined,
      seatNumbers: !isTableEntry && plan.seat_number != null ? Array(qty).fill(plan.seat_number) : undefined,
      tableNumbers: isTableEntry && plan.table_number != null ? Array(qty).fill(plan.table_number) : undefined,
      inventoryHoldIds: plan.reservation_id ? [plan.reservation_id] : undefined,
      installmentPlanId: plan.id,
      payment: {
        method,
        provider: plan.payment_provider || undefined,
        number: plan.payment_number || undefined,
        name: plan.buyer_name || undefined,
        cardName: plan.buyer_name || undefined,
      },
      verification: {
        ...verification,
        pollStatus: 'completed',
      },
    };

    const response = await fetch(`${siteUrl.replace(/\/$/, '')}/.netlify/functions/fulfill-purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fulfillmentPayload),
    });
    const responseBody = await response.json().catch(() => ({}));
    return reply(response.status, { ...responseBody, recovery: true, planId });
  } catch (error) {
    console.error('[RetryInstallmentFulfillment] Error:', error.message);
    return reply(500, { success: false, error: 'Unable to retry installment fulfillment' });
  }
};
