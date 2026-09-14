const crypto = require('crypto');

const REFUND_REASONS = Object.freeze({
  cancelled: 'event_cancelled',
  postponed: 'event_postponed',
  installmentsIncomplete: 'installments_incomplete',
});
const ACTIVE_REFUND_STATUSES = [
  'pending_admin_review', 'approved', 'processing', 'submitted', 'completed', 'needs_attention',
];
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTicketRef(value) {
  return String(value || '').trim().toUpperCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function ticketBelongsToUser(ticket, authUser, profile) {
  if (!ticket || !authUser) return false;
  const ownerId = String(ticket.buyer_id || '');
  const validIds = new Set([authUser.id, profile?.id, profile?.uid].filter(Boolean).map(String));

  // An assigned buyer id is authoritative. Never fall back to an email match
  // when the ticket belongs to a different account.
  if (ownerId) return validIds.has(ownerId);

  const accountEmails = [authUser.email, profile?.email]
    .filter(Boolean)
    .map(normalizeEmail);
  const ticketEmail = normalizeEmail(ticket.buyer_email);
  return Boolean(ticketEmail && accountEmails.some((email) => safeEqual(ticketEmail, email)));
}

function reasonForEventStatus(status) {
  return REFUND_REASONS[String(status || '').trim().toLowerCase()] || null;
}

async function loadEventForTicket(admin, ticket) {
  let event = null;
  let eventError = null;
  const slug = ticket.event_slug || ticket.event_id;
  if (slug) {
    const result = await admin.from('events').select('*').eq('slug', slug).maybeSingle();
    event = result.data;
    eventError = result.error;
  }
  if (!event && !eventError && ticket.event_id) {
    const fallback = await admin.from('events').select('*').eq('id', ticket.event_id).maybeSingle();
    event = fallback.data;
    eventError = fallback.error;
  }
  if (eventError) throw eventError;
  if (!event) throw httpError('Event not found', 404);
  return event;
}

async function calculateRefundEligibility(admin, ticketId, reasonCode, requestedAmount, installmentPlanId) {
  if (!Object.values(REFUND_REASONS).includes(reasonCode)) {
    throw httpError('Refunds are available only when an event is cancelled or postponed.', 422);
  }

  const { data: ticket, error: ticketError } = await admin
    .from('tickets').select('*').eq('id', ticketId).maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket) throw httpError('Ticket not found', 404);

  const event = await loadEventForTicket(admin, ticket);
  if (['used', 'refunded'].includes(String(ticket.status || '').toLowerCase())) {
    throw httpError('Used or already refunded tickets are not eligible', 409);
  }
  if (ticket.payment_status && String(ticket.payment_status).toLowerCase() !== 'completed') {
    throw httpError('Only paid tickets are eligible for a refund', 422);
  }

  const eventStatus = String(event.event_status || '').toLowerCase();
  if (reasonCode !== REFUND_REASONS.installmentsIncomplete && reasonForEventStatus(eventStatus) !== reasonCode) {
    throw httpError('The event is not eligible for this refund reason', 422);
  }

  let installmentPlan = null;
  let amount = Number(requestedAmount);
  if (reasonCode === REFUND_REASONS.installmentsIncomplete) {
    const planId = installmentPlanId || ticket.installment_plan_id;
    let { data: plans, error: planError } = await admin.from('ticket_installment_plans')
      .select('*').eq('id', planId || '').limit(1);
    if (!plans?.length && !planError) {
      const fallback = await admin.from('ticket_installment_plans').select('*')
        .eq('buyer_email', ticket.buyer_email).eq('event_id', ticket.event_id)
        .order('created_at', { ascending: false }).limit(1);
      plans = fallback.data;
      planError = fallback.error;
    }
    if (planError) throw planError;
    installmentPlan = plans?.[0] || null;
    if (!installmentPlan || Number(installmentPlan.installments_paid) >= (installmentPlan.installments || []).length) {
      throw httpError('This installment plan is complete or unavailable', 422);
    }
    if (new Date(event.date) > new Date()) {
      throw httpError('Installment refunds are available only after the event ends', 422);
    }
    const paid = (installmentPlan.installments || []).filter((installment) => installment.status === 'paid');
    const paidBeforeFees = paid.reduce((sum, installment) => sum + Number(installment.amount || 0), 0);
    const paidServiceFees = paid.reduce((sum, installment) => sum + Number(installment.serviceFee ?? Math.round(Number(installment.amount || 0) * 0.08)), 0);
    amount = Math.floor(((paidBeforeFees + paidServiceFees) - paidServiceFees) * 2 / 5);
  } else if (!Number.isFinite(amount) || amount <= 0) {
    amount = Math.max(
      0,
      Number(ticket.total_amount || ticket.base_price || 0) - Number(ticket.gateway_fee || 0),
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) throw httpError('Refund amount is zero', 422);

  return {
    ticket,
    event,
    installmentPlan,
    amount: Math.round(amount * 100) / 100,
    eventStatus,
    reasonCode,
  };
}

async function findActiveRefund(admin, ticketId) {
  const { data, error } = await admin.from('refund_requests')
    .select('*')
    .eq('ticket_id', ticketId)
    .in('status', ACTIVE_REFUND_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

function getMagicLinkSecret() {
  const secret = String(process.env.REFUND_LINK_SECRET || '');
  if (Buffer.byteLength(secret) < 32) {
    throw httpError('Guest refund access is not configured', 503);
  }
  return secret;
}

function signGuestRefundToken({ ticketId, email, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    ticketId: String(ticketId),
    email: normalizeEmail(email),
    exp: nowSeconds + MAGIC_LINK_TTL_SECONDS,
    nonce: crypto.randomBytes(12).toString('hex'),
  })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getMagicLinkSecret())
    .update(`guest-refund.${payload}`)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyGuestRefundToken(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra || payload.length > 2048) throw httpError('Invalid or expired refund link', 401);
  const expected = crypto
    .createHmac('sha256', getMagicLinkSecret())
    .update(`guest-refund.${payload}`)
    .digest('base64url');
  if (!safeEqual(signature, expected)) throw httpError('Invalid or expired refund link', 401);

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw httpError('Invalid or expired refund link', 401);
  }
  if (claims.v !== 1 || !claims.ticketId || !isValidEmail(claims.email) || !Number.isInteger(claims.exp) || claims.exp < nowSeconds) {
    throw httpError('Invalid or expired refund link', 401);
  }
  return claims;
}

function refundReference() {
  return `RF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function sanitizeBuyerNote(value) {
  const note = String(value || '').trim();
  return note ? note.slice(0, 1000) : null;
}

function buildRefundRow({ eligibility, buyerId, buyerEmail, idempotencyKey, note }) {
  const { ticket, event, amount } = eligibility;
  return {
    request_reference: refundReference(),
    buyer_id: buyerId || null,
    buyer_email: normalizeEmail(buyerEmail || ticket.buyer_email),
    event_id: ticket.event_id || ticket.event_slug || event.id || event.slug,
    ticket_id: ticket.id,
    ticket_ids: eligibility.installmentPlan?.ticket_ids || [ticket.id],
    installment_plan_id: eligibility.installmentPlan?.id || null,
    payment_provider: ticket.payment_provider || (ticket.pawapay_deposit_id ? 'pawapay' : 'pesapal'),
    payment_reference: ticket.payment_reference || null,
    processor_reference: ticket.pawapay_deposit_id || ticket.payment_id || null,
    processor_confirmation_code: ticket.pesapal_confirmation_code || null,
    reason_code: eligibility.reasonCode || reasonForEventStatus(eligibility.eventStatus),
    requested_amount: amount,
    currency: 'UGX',
    idempotency_key: idempotencyKey,
    buyer_note: sanitizeBuyerNote(note),
  };
}

module.exports = {
  ACTIVE_REFUND_STATUSES,
  MAGIC_LINK_TTL_SECONDS,
  REFUND_REASONS,
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
  ticketBelongsToUser,
  verifyGuestRefundToken,
};
