const crypto = require('crypto');
const { getAdminClient, requireUser, json } = require('../shared/supabaseAdmin');

const PAWAPAY_BASE_URL = process.env.PAWAPAY_API_URL || 'https://api.pawapay.io/v2';

function uuid() { return crypto.randomUUID(); }
function reference() { return `RF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
function amountNumber(value) { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function isAdmin(profile) { return profile?.user_type === 'admin'; }

async function addHistory(admin, id, fromStatus, toStatus, actorId, actorType, note, payload) {
  await admin.from('refund_status_history').insert({
    refund_request_id: id, from_status: fromStatus || null, to_status: toStatus,
    actor_id: actorId || null, actor_type: actorType, note: note || null, processor_payload: payload || null,
  });
}

async function transition(admin, refund, status, actorId, actorType, note, extra = {}) {
  const { data, error } = await admin.from('refund_requests')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', refund.id).select('*').single();
  if (error) throw error;
  await addHistory(admin, refund.id, refund.status, status, actorId, actorType, note, extra.processor_payload);
  return data;
}

async function sendRefundNotification(admin, type, refund) {
  try {
    const titleMap = {
      requested: '🔄 Refund Requested', approved: '✅ Refund Approved',
      rejected: '❌ Refund Rejected', executed: '💰 Refund Submitted',
      completed: '✅ Refund Completed', chargeback: '⚠️ Chargeback Filed',
    };
    const bodyMap = {
      requested: `Refund request ${refund.request_reference} submitted for review`,
      approved: `Your refund ${refund.request_reference} has been approved`,
      rejected: `Your refund ${refund.request_reference} has been rejected`,
      executed: `Refund ${refund.request_reference} submitted to payment provider`,
      completed: `Refund ${refund.request_reference} completed — UGX ${Number(refund.refunded_amount || refund.approved_amount).toLocaleString()}`,
      chargeback: `Chargeback filed for refund ${refund.request_reference}`,
    };
    if (refund.buyer_id) {
      await admin.from('notifications').insert({
        user_id: refund.buyer_id, title: titleMap[type] || 'Refund Update',
        body: bodyMap[type] || `Refund ${refund.request_reference} updated to ${type}`,
        type: 'refund_update', data: { refundId: refund.id, request_reference: refund.request_reference, status: refund.status },
        is_read: false, created_at: new Date().toISOString(),
      });
    }
  } catch (e) { console.error('sendRefundNotification error', e); }
}

async function calculateEligibility(admin, ticketId, reasonCode, requestedAmount, installmentPlanId) {
  const { data: ticket, error: ticketError } = await admin.from('tickets').select('*').eq('id', ticketId).maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket) throw Object.assign(new Error('Ticket not found'), { statusCode: 404 });

  let { data: event, error: eventError } = await admin.from('events').select('*').eq('slug', ticket.event_id || ticket.event_slug).maybeSingle();
  if (!event && !eventError && ticket.event_id) {
    const fallback = await admin.from('events').select('*').eq('id', ticket.event_id).maybeSingle();
    event = fallback.data; eventError = fallback.error;
  }
  if (eventError) throw eventError;
  if (!event) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

  if (['used', 'refunded'].includes(ticket.status)) {
    throw Object.assign(new Error('Used or already refunded tickets are not eligible'), { statusCode: 409 });
  }

  const eventStatus = String(event.event_status || '').toLowerCase();
  if (reasonCode === 'event_cancelled' && eventStatus !== 'cancelled') {
    throw Object.assign(new Error('The event is not marked as cancelled'), { statusCode: 422 });
  }
  if (reasonCode === 'event_postponed' && eventStatus !== 'postponed') {
    throw Object.assign(new Error('The event is not marked as postponed'), { statusCode: 422 });
  }

  let installmentPlan = null;
  let amount = amountNumber(requestedAmount);
  if (reasonCode === 'installments_incomplete') {
    const planId = installmentPlanId || ticket.installment_plan_id;
    let { data: plans, error: planError } = await admin.from('ticket_installment_plans')
      .select('*').eq('id', planId || '').limit(1);
    if (!plans?.length && !planError) {
      const fallback = await admin.from('ticket_installment_plans').select('*')
        .eq('buyer_email', ticket.buyer_email).eq('event_id', ticket.event_id)
        .order('created_at', { ascending: false }).limit(1);
      plans = fallback.data; planError = fallback.error;
    }
    if (planError) throw planError;
    installmentPlan = plans?.[0] || null;
    if (!installmentPlan || Number(installmentPlan.installments_paid) >= (installmentPlan.installments || []).length) {
      throw Object.assign(new Error('This installment plan is complete or unavailable'), { statusCode: 422 });
    }
    if (new Date(event.date) > new Date()) {
      throw Object.assign(new Error('Installment refunds are available only after the event ends'), { statusCode: 422 });
    }
    const paid = (installmentPlan.installments || []).filter((i) => i.status === 'paid');
    const paidBeforeFees = paid.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const paidServiceFees = paid.reduce((sum, i) => sum + Number(i.serviceFee ?? Math.round(Number(i.amount || 0) * 0.08)), 0);
    amount = Math.floor(((paidBeforeFees + paidServiceFees) - paidServiceFees) * 2 / 5);
  } else if (!amount) {
    amount = Math.max(0, amountNumber(ticket.total_amount || ticket.base_price || 0) - amountNumber(ticket.gateway_fee || 0));
  }

  if (amount <= 0) throw Object.assign(new Error('Refund amount is zero'), { statusCode: 422 });
  return { ticket, event, installmentPlan, amount };
}

async function submitPesaPal(refund) {
  const apiUrl = process.env.PESAPAL_API_URL || 'https://pay.pesapal.com/v3/api';
  const key = process.env.PESAPAL_CONSUMER_KEY;
  const secret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('PesaPal credentials are not configured');
  if (!refund.processor_confirmation_code) throw new Error('PesaPal confirmation code is missing');
  const tokenResponse = await fetch(`${apiUrl}/Auth/RequestToken`, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.token) throw new Error('Unable to authenticate with PesaPal');
  const response = await fetch(`${apiUrl}/Transactions/RefundRequest`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${tokenData.token}` },
    body: JSON.stringify({
      confirmation_code: refund.processor_confirmation_code,
      amount: String(refund.approved_amount),
      username: refund.reviewed_by || 'YoVibe Admin',
      remarks: `YoVibe refund ${refund.request_reference}`,
    }),
  });
  const payload = await response.json();
  if (!response.ok || String(payload.status || payload.error) === '500') {
    throw new Error(payload.message || 'PesaPal rejected the refund request');
  }
  return { externalRefundId: payload.refund_id || payload.reference || refund.request_reference, status: 'submitted', payload };
}

async function submitPawaPay(refund) {
  const token = process.env.PAWAPAY_API_KEY;
  if (!token) throw new Error('PawaPay API key is not configured');
  const externalRefundId = refund.external_refund_id || uuid();
  const response = await fetch(`${PAWAPAY_BASE_URL}/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refundId: externalRefundId, depositId: refund.processor_reference,
      amount: String(refund.approved_amount), currency: refund.currency || 'UGX',
      clientReferenceId: refund.request_reference,
      ...(process.env.PAWAPAY_REFUND_CALLBACK_URL ? { callbackUrl: process.env.PAWAPAY_REFUND_CALLBACK_URL } : {}),
      metadata: [{ orderId: refund.payment_reference || refund.request_reference }],
    }),
  });
  const payload = await response.json();
  if (!response.ok || ['REJECTED', 'FAILED'].includes(payload.status)) {
    throw new Error(payload.rejectionReason?.rejectionMessage || payload.failureReason?.failureMessage || 'PawaPay rejected the refund');
  }
  return { externalRefundId, status: payload.status === 'COMPLETED' ? 'completed' : 'submitted', payload };
}

async function executeProviderRefund(admin, refund, authUser) {
  await transition(admin, refund, 'processing', authUser.id, 'admin', 'Manual processor submission started');
  try {
    const result = refund.payment_provider === 'pawapay'
      ? await submitPawaPay({ ...refund, approved_amount: refund.approved_amount, reviewed_by: authUser.email })
      : await submitPesaPal({ ...refund, approved_amount: refund.approved_amount, reviewed_by: authUser.email });
    const status = result.status === 'completed' ? 'completed' : 'submitted';
    const finalRefund = await transition(admin, { ...refund, status: 'processing' }, status, authUser.id, 'admin',
      'Refund submitted manually to payment provider',
      { external_refund_id: result.externalRefundId, processor_payload: result.payload, submitted_at: new Date().toISOString(), completed_at: status === 'completed' ? new Date().toISOString() : null });
    await sendRefundNotification(admin, status === 'completed' ? 'completed' : 'executed', finalRefund);
    return finalRefund;
  } catch (error) {
    const failed = await transition(admin, { ...refund, status: 'processing' }, 'needs_attention', authUser.id, 'admin', error.message);
    return failed;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { admin, authUser, profile } = await requireUser(event);
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'request';

    if (action === 'request') {
      const reasonCode = body.reasonCode;
      if (!['event_cancelled', 'event_postponed', 'installments_incomplete'].includes(reasonCode)) {
        return json(422, { error: 'Refunds are only available for event cancellation, postponement, or incomplete installments after the event.' });
      }
      const eligibility = await calculateEligibility(admin, body.ticketId, reasonCode, body.requestedAmount, body.installmentPlanId);
      const idempotencyKey = body.idempotencyKey || `${authUser.id}:${body.ticketId}:${reasonCode}`;
      const { data: existing } = await admin.from('refund_requests').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
      if (existing) return json(409, { error: 'A refund request with the same details already exists', refund: existing });
      const row = {
        request_reference: reference(), buyer_id: authUser.id, buyer_email: authUser.email,
        event_id: eligibility.ticket.event_id || eligibility.ticket.event_slug,
        ticket_id: eligibility.ticket.id, ticket_ids: eligibility.installmentPlan?.ticket_ids || [eligibility.ticket.id],
        installment_plan_id: eligibility.installmentPlan?.id || null,
        payment_provider: eligibility.ticket.payment_provider || (eligibility.ticket.pawapay_deposit_id ? 'pawapay' : 'pesapal'),
        payment_reference: eligibility.ticket.payment_reference || null,
        processor_reference: eligibility.ticket.pawapay_deposit_id || eligibility.ticket.payment_id || null,
        processor_confirmation_code: eligibility.ticket.pesapal_confirmation_code || null,
        reason_code: reasonCode, requested_amount: eligibility.amount, currency: 'UGX',
        idempotency_key: idempotencyKey, buyer_note: body.note || null,
      };
      const { data: refund, error } = await admin.from('refund_requests').insert(row).select('*').single();
      if (error) throw error;
      await addHistory(admin, refund.id, null, 'pending_admin_review', authUser.id, 'buyer', 'Refund request submitted');
      await sendRefundNotification(admin, 'requested', refund);
      return json(201, { refund });
    }

    if (!isAdmin(profile)) return json(403, { error: 'Admin access required' });

    if (action === 'list') {
      let query = admin.from('refund_requests').select('*', { count: 'exact' });
      if (body.status) query = query.eq('status', body.status);
      if (body.search) query = query.or(`request_reference.ilike.%${body.search}%,buyer_email.ilike.%${body.search}%`);
      query = query.order('created_at', { ascending: false });
      if (body.limit) query = query.limit(body.limit);
      if (body.offset) query = query.range(body.offset, body.offset + (body.limit || 50) - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      return json(200, { refunds: data || [], total: count });
    }

    if (!body.refundId) return json(400, { error: 'refundId is required' });
    const { data: refund, error: refundError } = await admin.from('refund_requests').select('*').eq('id', body.refundId).single();
    if (refundError) throw refundError;

    if (action === 'reject') {
      if (!['pending_admin_review', 'approved'].includes(refund.status)) return json(409, { error: 'Refund cannot be rejected in its current state' });
      const updated = await transition(admin, refund, 'rejected', authUser.id, 'admin', body.note || 'Rejected by admin',
        { reviewed_by: authUser.id, reviewed_at: new Date().toISOString(), admin_note: body.note || null });
      await sendRefundNotification(admin, 'rejected', updated);
      return json(200, { refund: updated });
    }

    if (action === 'approve') {
      if (refund.status !== 'pending_admin_review') return json(409, { error: 'Refund is not awaiting review' });
      const approvedAmount = amountNumber(body.approvedAmount || refund.requested_amount);
      if (approvedAmount <= 0 || approvedAmount > Number(refund.requested_amount)) return json(422, { error: 'Approved amount is invalid' });
      const updated = await transition(admin, refund, 'approved', authUser.id, 'admin', body.note || 'Approved by admin',
        { approved_amount: approvedAmount, reviewed_by: authUser.id, reviewed_at: new Date().toISOString(), admin_note: body.note || null });
      await sendRefundNotification(admin, 'approved', updated);
      return json(200, { refund: updated });
    }

    if (action === 'execute') {
      if (refund.status !== 'approved') return json(409, { error: 'Refund must be approved before execution' });
      try {
        const finalRefund = await executeProviderRefund(admin, refund, authUser);
        if (finalRefund.status === 'needs_attention') return json(502, { error: 'Provider rejected the refund', refund: finalRefund });
        return json(200, { refund: finalRefund });
      } catch (error) {
        return json(502, { error: error.message, refund: refund });
      }
    }

    if (action === 'retry') {
      if (!['needs_attention', 'failed', 'submitted'].includes(refund.status)) return json(409, { error: 'Only failed or attention-requiring refunds can be retried' });
      const retryCount = (refund.retry_count || 0) + 1;
      try {
        const result = refund.payment_provider === 'pawapay'
          ? await submitPawaPay({ ...refund, approved_amount: refund.approved_amount, reviewed_by: authUser.email })
          : await submitPesaPal({ ...refund, approved_amount: refund.approved_amount, reviewed_by: authUser.email });
        const status = result.status === 'completed' ? 'completed' : 'submitted';
        const finalRefund = await transition(admin, refund, status, authUser.id, 'admin', `Retry #${retryCount} submitted`,
          { external_refund_id: result.externalRefundId, processor_payload: result.payload, submitted_at: new Date().toISOString(), completed_at: status === 'completed' ? new Date().toISOString() : null, retry_count: retryCount });
        await sendRefundNotification(admin, status === 'completed' ? 'completed' : 'executed', finalRefund);
        return json(200, { refund: finalRefund });
      } catch (error) {
        const failed = await transition(admin, refund, 'needs_attention', authUser.id, 'admin', `Retry #${retryCount} failed: ${error.message}`, { retry_count: retryCount });
        return json(502, { error: error.message, refund: failed });
      }
    }

    if (action === 'chargeback') {
      if (!['pending_admin_review', 'approved'].includes(refund.status)) return json(409, { error: 'Refund must be pending or approved to file a chargeback' });
      const updated = await transition(admin, refund, 'needs_attention', authUser.id, 'admin', body.note || 'Chargeback disputed',
        { reason_code: 'chargeback', chargeback_dispute_id: uuid(), chargeback_reason: body.note || 'Chargeback filed', chargeback_filed_at: new Date().toISOString() });
      await sendRefundNotification(admin, 'chargeback', updated);
      return json(200, { refund: updated });
    }

    return json(400, { error: 'Unsupported refund action' });
  } catch (error) {
    console.error('refund-ticket error', error);
    return json(error.statusCode || 500, { error: error.message || 'Refund operation failed' });
  }
};
