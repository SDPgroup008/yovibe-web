const crypto = require('crypto');
const { getAdminClient } = require('../shared/supabaseAdmin');
const {
  buildRefundRow,
  calculateRefundEligibility,
  findActiveRefund,
  isValidEmail,
  loadEventForTicket,
  normalizeEmail,
  normalizeTicketRef,
  reasonForEventStatus,
  safeEqual,
  signGuestRefundToken,
  verifyGuestRefundToken,
} = require('../shared/refundPolicy');
const { sendTransactionalEmail } = require('../shared/transactionalEmail');
const { getSiteUrl } = require('../shared/runtimeConfig');

const GENERIC_RESPONSE = 'If those details match an eligible order, a secure refund link will be sent to the purchase email.';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 3;
const requestAttempts = new Map();

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(body),
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function rateLimitKey(event, ticketRef, email) {
  const ip = event.headers?.['x-nf-client-connection-ip']
    || event.headers?.['x-forwarded-for']?.split(',')[0]
    || 'unknown';
  return crypto.createHash('sha256').update(`${ip}|${ticketRef}|${email}`).digest('hex');
}

function isRateLimited(key) {
  const now = Date.now();
  if (requestAttempts.size > 1000) {
    for (const [storedKey, storedAttempts] of requestAttempts) {
      if (!storedAttempts.some((time) => now - time < RATE_WINDOW_MS)) requestAttempts.delete(storedKey);
    }
  }
  const attempts = (requestAttempts.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS);
  attempts.push(now);
  requestAttempts.set(key, attempts);
  return attempts.length > RATE_LIMIT;
}

async function genericAfter(startedAt) {
  const remaining = Math.max(0, 300 - (Date.now() - startedAt));
  if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining));
  return response(200, { message: GENERIC_RESPONSE });
}

async function addGuestHistory(admin, refundId) {
  const { error } = await admin.from('refund_status_history').insert({
    refund_request_id: refundId,
    from_status: null,
    to_status: 'pending_admin_review',
    actor_id: null,
    actor_type: 'guest_buyer',
    note: 'Refund request submitted using verified order email link',
    processor_payload: null,
  });
  if (error) console.warn('guest-refund history insert failed:', error.message);
}

async function sendAccessLink(ticket, link) {
  const email = normalizeEmail(ticket.buyer_email);
  const eventLabel = escapeHtml(ticket.event_name || 'your event');
  return sendTransactionalEmail({
    to: email,
    subject: 'Your secure YoVibe refund link',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222"><h2>Refund request access</h2><p>A refund link was requested for ticket <strong>${escapeHtml(ticket.ticket_ref)}</strong> for ${eventLabel}.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#e53935;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Continue refund request</a></p><p>This link expires in 15 minutes and can only be used for this order. Refunds are available only when the event is cancelled or postponed and remain subject to administrator review.</p><p>If you did not request this link, you can ignore this email.</p></div>`,
    text: `A refund link was requested for ticket ${ticket.ticket_ref}. Continue within 15 minutes: ${link}\n\nRefunds are available only when the event is cancelled or postponed and remain subject to administrator review. If you did not request this link, ignore this email.`,
  });
}

async function sendAcknowledgement(refund) {
  return sendTransactionalEmail({
    to: refund.buyer_email,
    subject: `YoVibe refund request ${refund.request_reference}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222"><h2>Refund request received</h2><p>Your request <strong>${escapeHtml(refund.request_reference)}</strong> has been submitted for administrator review.</p><p>If approved, the refund will be sent to the original payment method where technically possible. Processing time depends on the payment provider.</p></div>`,
    text: `Your refund request ${refund.request_reference} has been submitted for administrator review. If approved, it will be returned to the original payment method where technically possible.`,
  });
}

async function requestLink(event, body) {
  const startedAt = Date.now();
  const ticketRef = normalizeTicketRef(body.ticketRef);
  const email = normalizeEmail(body.email);
  if (!ticketRef || ticketRef.length > 64 || !isValidEmail(email)) return genericAfter(startedAt);
  if (isRateLimited(rateLimitKey(event, ticketRef, email))) return genericAfter(startedAt);

  try {
    const admin = getAdminClient();
    const { data: ticket, error } = await admin.from('tickets')
      .select('*').ilike('ticket_ref', ticketRef).maybeSingle();
    if (error || !ticket || !safeEqual(normalizeEmail(ticket.buyer_email), email)) return genericAfter(startedAt);

    const linkedEvent = await loadEventForTicket(admin, ticket);
    const reasonCode = reasonForEventStatus(linkedEvent.event_status);
    if (!reasonCode) return genericAfter(startedAt);
    await calculateRefundEligibility(admin, ticket.id, reasonCode);
    if (await findActiveRefund(admin, ticket.id)) return genericAfter(startedAt);

    const token = signGuestRefundToken({ ticketId: ticket.id, email });
    const siteUrl = getSiteUrl();
    const sendResult = await sendAccessLink(ticket, `${siteUrl}/refund-request?token=${encodeURIComponent(token)}`);
    if (!sendResult.ok) console.error('guest-refund access email failed:', sendResult.error);
  } catch (error) {
    // Do not reveal whether a ticket, email, or eligible event exists.
    if (error.statusCode >= 500) console.error('guest-refund access failed:', error.message);
  }
  return genericAfter(startedAt);
}

async function submitRequest(body) {
  const claims = verifyGuestRefundToken(body.token);
  const admin = getAdminClient();
  const { data: ticket, error: ticketError } = await admin.from('tickets')
    .select('*').eq('id', claims.ticketId).maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket || !safeEqual(normalizeEmail(ticket.buyer_email), normalizeEmail(claims.email))) {
    return response(401, { error: 'Invalid or expired refund link' });
  }

  const linkedEvent = await loadEventForTicket(admin, ticket);
  const reasonCode = reasonForEventStatus(linkedEvent.event_status);
  if (!reasonCode) return response(422, { error: 'Refunds are available only when an event is cancelled or postponed.' });
  const eligibility = await calculateRefundEligibility(admin, ticket.id, reasonCode);
  const existing = await findActiveRefund(admin, ticket.id);
  if (existing) return response(409, { error: 'An active refund request already exists for this ticket.', reference: existing.request_reference });

  const row = buildRefundRow({
    eligibility,
    buyerId: ticket.buyer_id || null,
    buyerEmail: ticket.buyer_email,
    idempotencyKey: `ticket-refund:${ticket.id}`,
    note: body.note,
  });
  const { data: refund, error } = await admin.from('refund_requests').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') return response(409, { error: 'A refund request already exists for this ticket.' });
    throw error;
  }
  await addGuestHistory(admin, refund.id);
  const sendResult = await sendAcknowledgement(refund);
  if (!sendResult.ok) console.error('guest-refund acknowledgement email failed:', sendResult.error);
  return response(201, {
    message: 'Your refund request was submitted for administrator review.',
    reference: refund.request_reference,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return response(400, { error: 'Invalid JSON body' });
  }

  try {
    if (body.action === 'request_link') return await requestLink(event, body);
    if (body.action === 'submit') return await submitRequest(body);
    return response(400, { error: 'Unsupported guest refund action' });
  } catch (error) {
    console.error('guest-refund error:', error.message);
    return response(error.statusCode || 500, { error: error.message || 'Refund request failed' });
  }
};
