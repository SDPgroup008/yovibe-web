const { getAdminClient, json } = require('../shared/supabaseAdmin');
const { sendTransactionalEmail } = require('../shared/transactionalEmail');
const {
  normaliseEmail, cleanRecipient, hashSecret, issueOtp, verifyOtp, issueRecipients,
} = require('../shared/guestTicketAllocations');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function reply(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function payload(event) { try { return JSON.parse(event.body || '{}'); } catch { throw Object.assign(new Error('Invalid request'), { statusCode: 400 }); } }
function requester(event) { return String(event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for'] || 'anonymous').split(',')[0].trim(); }

async function rateLimit(admin, scope, subject) {
  const subjectHash = hashSecret(`rate:${subject}`);
  const now = Date.now();
  const { data, error } = await admin.from('ticket_public_rate_limits').select('*').eq('scope', scope).eq('subject_hash', subjectHash).maybeSingle();
  if (error) throw error;
  if (!data || now - new Date(data.window_started_at).getTime() > 15 * 60 * 1000) {
    const { error: upsertError } = await admin.from('ticket_public_rate_limits').upsert({ scope, subject_hash: subjectHash, window_started_at: new Date().toISOString(), attempts: 1, updated_at: new Date().toISOString() }, { onConflict: 'scope,subject_hash' });
    if (upsertError) throw upsertError;
    return;
  }
  if (Number(data.attempts || 0) >= 10) throw Object.assign(new Error('Too many attempts. Please wait 15 minutes and try again.'), { statusCode: 429 });
  const { error: updateError } = await admin.from('ticket_public_rate_limits').update({ attempts: Number(data.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq('id', data.id);
  if (updateError) throw updateError;
}

async function lookupClaim(admin, token) {
  const { data: tokenRow, error } = await admin.from('ticket_allocation_claim_tokens').select('*, ticket_allocations(*)').eq('token_hash', hashSecret(`claim:${token}`)).maybeSingle();
  if (error) throw error;
  if (!tokenRow?.ticket_allocations) throw Object.assign(new Error('This claim link is invalid or no longer available'), { statusCode: 404 });
  const allocation = tokenRow.ticket_allocations;
  if (!['active', 'ready_for_distribution'].includes(allocation.status) || (allocation.starts_at && new Date(allocation.starts_at) > new Date()) || (allocation.expires_at && new Date(allocation.expires_at) <= new Date())) throw Object.assign(new Error('This claim link is no longer active'), { statusCode: 410 });
  const { data: event, error: eventError } = await admin.from('events').select('name,date,time,venue_name,poster_image_url,entry_fees').eq('slug', allocation.event_slug).maybeSingle();
  if (eventError) throw eventError;
  return { tokenRow, allocation, event };
}

function publicClaimDetails({ tokenRow, allocation, event }) {
  const fee = (event.entry_fees || []).find((item) => item.name === allocation.entry_fee_type) || {};
  return {
    allocation: { name: allocation.allocation_name, category: allocation.entry_fee_type, remaining: tokenRow.show_remaining ? allocation.reserved_quantity : null, expiresAt: allocation.expires_at, customMessage: tokenRow.custom_message, maxPerClaim: tokenRow.max_per_claim, recipientRequirements: tokenRow.recipient_requirements, requiresPassword: Boolean(tokenRow.password_hash), requiresEmailVerification: Boolean(allocation.eligibility?.requireEmailVerification) },
    event: { name: event.name, date: event.date, time: event.time, venueName: event.venue_name, posterUrl: event.poster_image_url, categoryPrice: fee.amount || null },
  };
}

async function validateClaimRecipient(admin, tokenRow, allocation, body) {
  const recipient = cleanRecipient(body.recipient || body);
  const requirements = tokenRow.recipient_requirements || {};
  if (requirements.email && !recipient.email) throw Object.assign(new Error('Email is required for this allocation'), { statusCode: 422 });
  if (requirements.phone && !recipient.phone) throw Object.assign(new Error('Phone is required for this allocation'), { statusCode: 422 });
  const quantity = Math.max(1, Math.floor(Number(body.quantity || 1)));
  if (quantity > Number(tokenRow.max_per_claim || 1)) throw Object.assign(new Error(`You can claim up to ${tokenRow.max_per_claim} tickets at once`), { statusCode: 422 });
  if (tokenRow.password_hash && tokenRow.password_hash !== hashSecret(`password:${String(body.password || '').trim()}`)) throw Object.assign(new Error('Incorrect access password'), { statusCode: 422 });
  if (recipient.email) {
    const emailHash = hashSecret(`email:${recipient.email}`);
    if ((tokenRow.approved_email_hashes || []).length && !(tokenRow.approved_email_hashes || []).includes(emailHash)) throw Object.assign(new Error('This email address is not approved for this allocation'), { statusCode: 403 });
    const domain = recipient.email.split('@')[1];
    if ((tokenRow.allowed_email_domains || []).length && !(tokenRow.allowed_email_domains || []).includes(domain)) throw Object.assign(new Error('Use an email address from an approved organisation'), { statusCode: 403 });
    if (allocation.eligibility?.requireEmailVerification) await verifyOtp(admin, allocation.id, recipient.email, body.otp);
    if (tokenRow.max_per_email) {
      const { data: previous, error } = await admin.from('ticket_allocation_claims').select('quantity').eq('allocation_id', allocation.id).eq('recipient_email', recipient.email).eq('status', 'issued');
      if (error) throw error;
      const used = (previous || []).reduce((sum, claim) => sum + Number(claim.quantity || 0), 0);
      if (used + quantity > tokenRow.max_per_email) throw Object.assign(new Error('This email has reached its claim limit'), { statusCode: 409 });
    }
  }
  return { recipient, quantity };
}

async function createClaim(admin, body) {
  const token = String(body.token || '').trim();
  if (!token) throw Object.assign(new Error('Claim link is required'), { statusCode: 422 });
  const { tokenRow, allocation } = await lookupClaim(admin, token);
  const { recipient, quantity } = await validateClaimRecipient(admin, tokenRow, allocation, body);
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (!idempotencyKey || idempotencyKey.length < 16) throw Object.assign(new Error('Invalid claim request'), { statusCode: 422 });
  const { data: existing, error: existingError } = await admin.from('ticket_allocation_claims').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === 'issued') return { ticketIds: existing.ticket_ids, alreadyIssued: true };
  if (existing) {
    const { data: recovered, error: recoveryError } = await admin.from('tickets').select('id,ticket_ref').eq('claim_id', existing.id);
    if (recoveryError) throw recoveryError;
    if (recovered?.length) {
      const ids = recovered.map((ticket) => ticket.id);
      await admin.from('ticket_allocation_claims').update({ ticket_ids: ids, status: 'issued', updated_at: new Date().toISOString() }).eq('id', existing.id);
      return { ticketIds: ids, tickets: recovered.map((ticket) => ({ id: ticket.id, ticketRef: ticket.ticket_ref })), alreadyIssued: true };
    }
  }
  let claim = existing;
  if (!claim) {
    const { data, error } = await admin.from('ticket_allocation_claims').insert({ allocation_id: allocation.id, claim_token_id: tokenRow.id, idempotency_key: idempotencyKey, recipient_name: recipient.name, recipient_email: recipient.email, recipient_phone: recipient.phone, quantity, verified_email_at: allocation.eligibility?.requireEmailVerification ? new Date().toISOString() : null }).select('*').single();
    if (error && error.code === '23505') return createClaim(admin, body);
    if (error) throw error;
    claim = data;
  }
  const recipients = Array.from({ length: quantity }, () => recipient);
  const issued = await issueRecipients(admin, { allocationId: allocation.id, recipients, actorId: 'public-claim', claimId: claim.id });
  return { ticketIds: issued.ids, tickets: issued.tickets.map((ticket) => ({ id: ticket.id, ticketRef: ticket.ticket_ref })), alreadyIssued: false };
}

async function redeem(admin, body) {
  const eventSlug = String(body.eventSlug || '').trim();
  const rawCode = String(body.code || '').trim().toUpperCase();
  const recipient = cleanRecipient(body.recipient || body);
  if (!eventSlug || !rawCode) throw Object.assign(new Error('Event and redemption code are required'), { statusCode: 422 });
  const { data, error } = await admin.rpc('consume_ticket_redemption_code', { p_code_hash: hashSecret(`code:${rawCode}`), p_event_slug: eventSlug, p_email_hash: recipient.email ? hashSecret(`email:${recipient.email}`) : null });
  if (error) throw Object.assign(new Error(error.message.includes('CODE') ? 'This redemption code is invalid, expired, or already used.' : error.message), { statusCode: 422 });
  const quantity = Number(data.ticketsPerRedemption || 1);
  const issued = await issueRecipients(admin, { allocationId: data.allocationId, recipients: Array.from({ length: quantity }, () => recipient), actorId: 'public-redemption' });
  return { ticketIds: issued.ids, tickets: issued.tickets.map((ticket) => ({ id: ticket.id, ticketRef: ticket.ticket_ref })) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const body = payload(event);
    const action = String(body.action || 'details');
    const admin = getAdminClient();
    await rateLimit(admin, action, `${requester(event)}:${body.token || body.code || ''}`);
    if (action === 'details') return reply(200, publicClaimDetails(await lookupClaim(admin, String(body.token || '').trim())));
    if (action === 'send_otp') {
      const { allocation } = await lookupClaim(admin, String(body.token || '').trim());
      if (!allocation.eligibility?.requireEmailVerification) throw Object.assign(new Error('Email verification is not required for this allocation'), { statusCode: 422 });
      const otp = await issueOtp(admin, allocation.id, body.email);
      const sent = await sendTransactionalEmail({ to: otp.email, subject: 'Your YoVibe ticket verification code', html: `<p>Your YoVibe verification code is <strong>${otp.code}</strong>.</p><p>It expires in 10 minutes. Do not share it.</p>`, text: `Your YoVibe verification code is ${otp.code}. It expires in 10 minutes.` });
      if (!sent.ok) throw Object.assign(new Error('Unable to send verification email'), { statusCode: 502 });
      return reply(200, { success: true, expiresInSeconds: 600 });
    }
    if (action === 'claim') return reply(201, await createClaim(admin, body));
    if (action === 'redeem') return reply(201, await redeem(admin, body));
    if (action === 'claim_tickets') {
      const key = String(body.idempotencyKey || '').trim();
      if (key.length < 16) throw Object.assign(new Error('Invalid ticket access request'), { statusCode: 422 });
      const { data: claim, error: claimError } = await admin.from('ticket_allocation_claims').select('ticket_ids,allocation_id').eq('idempotency_key', key).eq('status', 'issued').maybeSingle();
      if (claimError) throw claimError;
      if (!claim?.ticket_ids?.length) throw Object.assign(new Error('Tickets are still being prepared'), { statusCode: 404 });
      const { data: tickets, error: ticketError } = await admin.from('tickets').select('id,event_slug,event_name,venue_name,entry_fee_type,ticket_ref,event_start_time,qr_code_data_url,seat_number,table_number').in('id', claim.ticket_ids);
      if (ticketError) throw ticketError;
      const eventSlug = tickets?.[0]?.event_slug;
      const { data: eventRow } = eventSlug ? await admin.from('events').select('time,poster_image_url,entry_fees,ticket_design').eq('slug', eventSlug).maybeSingle() : { data: null };
      return reply(200, { tickets: tickets || [], event: eventRow || null });
    }
    throw Object.assign(new Error('Unknown action'), { statusCode: 400 });
  } catch (error) {
    console.error('[GuestTicketClaim]', error.message);
    return reply(error.statusCode || 500, { error: error.message || 'Unable to process this request' });
  }
};
