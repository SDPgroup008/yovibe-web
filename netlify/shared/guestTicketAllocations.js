const crypto = require('crypto');
const { requiredEnv } = require('./runtimeConfig');
const {
  createTicketServerSide,
  enqueueTicketEmailJobs,
  loadEvent,
  calculateGatewayFee,
  calculateRevenueSplit,
  siteBaseUrl,
} = require('./ticketFulfillment');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function secret() {
  return requiredEnv('GUEST_TICKET_SECRET', 'PAYOUT_OTP_SECRET');
}

function hashSecret(value) {
  return crypto.createHmac('sha256', secret()).update(String(value).trim()).digest('hex');
}

function normaliseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function randomCode(prefix = '') {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)]).join('');
  const cleanPrefix = String(prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return cleanPrefix ? `${cleanPrefix}-${chars}` : chars;
}

function maskCode(code) {
  const value = String(code || '');
  return value.length <= 4 ? '••••' : `${value.slice(0, Math.min(4, value.length - 4))}••••${value.slice(-4)}`;
}

function ownerIds(authUser, profile) {
  return [authUser?.id, profile?.id, profile?.uid].filter(Boolean).map(String);
}

async function assertEventOwner(admin, authUser, profile, eventSlug) {
  const { data: event, error } = await admin.from('events').select('*').eq('slug', eventSlug).maybeSingle();
  if (error) throw error;
  if (!event) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  if (profile?.user_type !== 'admin' && !ownerIds(authUser, profile).includes(String(event.created_by || '')) && !ownerIds(authUser, profile).includes(String(event.created_by_auth || ''))) {
    throw Object.assign(new Error('You do not have permission to manage guest tickets for this event'), { statusCode: 403 });
  }
  return event;
}

function entryFee(event, entryFeeType) {
  const fee = (event.entry_fees || []).find((item) => item && item.name === entryFeeType);
  if (!fee) throw Object.assign(new Error('Ticket category not found'), { statusCode: 422 });
  const amount = Number(String(fee.amount || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount) || amount < 0) throw Object.assign(new Error('Ticket category has an invalid price'), { statusCode: 422 });
  return { ...fee, amount };
}

function cleanRecipient(input = {}) {
  const name = String(input.name || input.fullName || '').trim();
  const email = normaliseEmail(input.email);
  const phone = String(input.phone || '').trim() || null;
  if (!name) throw Object.assign(new Error('Each recipient needs a full name'), { statusCode: 422 });
  return { name, email, phone, organisation: String(input.organisation || '').trim() || null, notes: String(input.notes || '').trim() || null };
}

function allocationStatusFor(fundingType) {
  return fundingType === 'sponsored' ? 'awaiting_funding' : 'active';
}

async function createAllocation(admin, actor, input) {
  const quantity = Math.max(1, Math.floor(Number(input.quantity || input.totalQuantity || 0)));
  const reserveQuantity = Math.max(0, Math.floor(Number(input.reserveQuantity ?? quantity)));
  const { data, error } = await admin.rpc('create_ticket_allocation', {
    p_event_slug: input.eventSlug,
    p_organiser_id: String(actor),
    p_name: String(input.name || '').trim() || `${input.entryFeeType} guest allocation`,
    p_funding_type: input.fundingType || 'complimentary',
    p_distribution_method: input.distributionMethod,
    p_entry_fee_type: input.entryFeeType,
    p_total_quantity: quantity,
    p_reserve_quantity: reserveQuantity,
    p_beneficiary_organisation: input.beneficiaryOrganisation || null,
    p_issuance_reason: input.issuanceReason || null,
    p_internal_notes: input.internalNotes || null,
    p_eligibility: input.eligibility || {},
    p_starts_at: input.startsAt || null,
    p_expires_at: input.expiresAt || null,
    p_initial_status: input.initialStatus || allocationStatusFor(input.fundingType),
  });
  if (error) throw Object.assign(new Error(error.message), { statusCode: 409 });
  return data;
}

async function buildGuestRows(admin, event, allocation, recipients, actorId, sponsorOrderId) {
  const fee = entryFee(event, allocation.entry_fee_type);
  const rows = [];
  for (const recipient of recipients) {
    const row = await createTicketServerSide(admin, {
      event,
      attendeeName: recipient.name,
      payerEmail: recipient.email || '',
      deliveryEmail: recipient.email || '',
      buyerId: null,
      buyerPhone: recipient.phone,
      totalAmount: 0,
      unitPrice: 0,
      lateFeePercent: 0,
      isTableEntry: false,
      payment: { method: 'complimentary', ticketType: allocation.entry_fee_type },
      sharedPaymentId: `guest-${allocation.id}`,
      salePayoutEligible: false,
    });
    rows.push({
      ...row,
      total_amount: 0,
      base_price: 0,
      late_fee: 0,
      venue_revenue: 0,
      app_commission: 0,
      gateway_fee: 0,
      payment_status: 'not_required',
      payment_method: 'complimentary',
      payout_eligible: false,
      payout_status: 'not_eligible',
      original_face_value: fee.amount,
      beneficiary_amount_paid: 0,
      allocation_id: allocation.id,
      sponsorship_order_id: sponsorOrderId || null,
      funding_type: allocation.funding_type,
      distribution_method: allocation.distribution_method,
      issuance_reason: allocation.issuance_reason,
      issued_by: actorId,
    });
  }
  return rows;
}

async function issueRecipients(admin, { allocationId, recipients, actorId, claimId, sponsorOrderId }) {
  const { data: allocation, error: allocationError } = await admin.from('ticket_allocations').select('*').eq('id', allocationId).maybeSingle();
  if (allocationError) throw allocationError;
  if (!allocation) throw Object.assign(new Error('Allocation not found'), { statusCode: 404 });
  const event = await loadEvent(admin, allocation.event_slug);
  if (!event) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  const rows = await buildGuestRows(admin, event, allocation, recipients, actorId, sponsorOrderId);
  if (claimId) rows.forEach((row) => { row.claim_id = claimId; });
  let ids;
  try {
    const result = await admin.rpc('issue_ticket_allocation_batch', { p_allocation_id: allocationId, p_rows: rows, p_actor_id: String(actorId) });
    if (result.error) throw result.error;
    ids = result.data || rows.map((row) => row.id);
  } catch (error) {
    throw Object.assign(new Error(error.message || 'Unable to issue guest tickets'), { statusCode: 409 });
  }
  const recipientRows = recipients.map((recipient, index) => ({
    allocation_id: allocationId, full_name: recipient.name, email: recipient.email, phone: recipient.phone,
    organisation: recipient.organisation, notes: recipient.notes, quantity: 1, ticket_ids: [ids[index]],
    delivery_status: recipient.email ? 'queued' : 'not_requested', status: 'issued',
  }));
  if (recipientRows.length) await admin.from('ticket_allocation_recipients').insert(recipientRows);
  if (claimId) await admin.from('ticket_allocation_claims').update({ ticket_ids: ids, status: 'issued', updated_at: new Date().toISOString() }).eq('id', claimId);
  // An unassigned bulk ticket is valid but intentionally has no recipient yet;
  // do not create a permanently failing email job for an empty address.
  const deliverableRows = rows.filter((row) => String(row.delivery_email || '').trim());
  if (deliverableRows.length) await enqueueTicketEmailJobs(admin, event, deliverableRows, '', `guest:${allocationId}`);
  return { ids, tickets: rows, allocation };
}

async function issueOtp(admin, allocationId, email) {
  const normalized = normaliseEmail(email);
  if (!normalized) throw Object.assign(new Error('A valid email address is required'), { statusCode: 422 });
  const emailHash = hashSecret(`email:${normalized}`);
  const now = new Date();
  const { data: recent } = await admin.from('ticket_claim_otps').select('id').eq('allocation_id', allocationId).eq('email_hash', emailHash).gt('created_at', new Date(now.getTime() - 15 * 60 * 1000).toISOString());
  if ((recent || []).length >= 3) throw Object.assign(new Error('Too many verification requests. Try again in 15 minutes.'), { statusCode: 429 });
  const code = crypto.randomInt(100000, 1000000).toString();
  const { error } = await admin.from('ticket_claim_otps').insert({ allocation_id: allocationId, email_hash: emailHash, otp_hash: hashSecret(`otp:${allocationId}:${emailHash}:${code}`), expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString() });
  if (error) throw error;
  return { code, email: normalized };
}

async function verifyOtp(admin, allocationId, email, code) {
  const normalized = normaliseEmail(email);
  const emailHash = hashSecret(`email:${normalized}`);
  const { data, error } = await admin.from('ticket_claim_otps').select('*').eq('allocation_id', allocationId).eq('email_hash', emailHash).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data || data.attempts >= 5 || data.otp_hash !== hashSecret(`otp:${allocationId}:${emailHash}:${String(code || '').trim()}`)) {
    if (data) await admin.from('ticket_claim_otps').update({ attempts: (data.attempts || 0) + 1 }).eq('id', data.id);
    throw Object.assign(new Error('Invalid or expired verification code'), { statusCode: 422 });
  }
  await admin.from('ticket_claim_otps').update({ used_at: new Date().toISOString() }).eq('id', data.id);
  return normalized;
}

module.exports = {
  assertEventOwner, entryFee, cleanRecipient, createAllocation, issueRecipients,
  normaliseEmail, randomToken, randomCode, maskCode, hashSecret, issueOtp, verifyOtp,
  calculateGatewayFee, calculateRevenueSplit, siteBaseUrl,
};
