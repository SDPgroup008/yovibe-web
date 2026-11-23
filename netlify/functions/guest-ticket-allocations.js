const { getAdminClient, requireUser, json } = require('../shared/supabaseAdmin');
const { sendTransactionalEmail } = require('../shared/transactionalEmail');
const {
  assertEventOwner, entryFee, cleanRecipient, createAllocation, issueRecipients,
  randomToken, randomCode, maskCode, hashSecret,
  calculateRevenueSplit, siteBaseUrl,
} = require('../shared/guestTicketAllocations');

function bodyOf(event) {
  try { return JSON.parse(event.body || '{}'); } catch { throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }); }
}

function publicUrl(path) { return `${siteBaseUrl()}${path}`; }

async function listOverview(admin, eventSlug) {
  const [allocations, tickets, sponsorships] = await Promise.all([
    admin.from('ticket_allocations').select('*').eq('event_slug', eventSlug).order('created_at', { ascending: false }),
    admin.from('tickets').select('id,status,funding_type,distribution_method,original_face_value,entry_fee_type,is_scanned,allocation_id,buyer_name,buyer_email,ticket_ref,issued_at').eq('event_slug', eventSlug).not('allocation_id', 'is', null).order('issued_at', { ascending: false }).limit(500),
    admin.from('ticket_sponsorship_orders').select('*, ticket_allocations!inner(event_slug)').eq('ticket_allocations.event_slug', eventSlug),
  ]);
  if (allocations.error) throw allocations.error;
  if (tickets.error) throw tickets.error;
  if (sponsorships.error) throw sponsorships.error;
  const all = tickets.data || [];
  const summary = {
    complimentaryIssued: all.filter((ticket) => ticket.funding_type === 'complimentary').length,
    sponsoredDistributed: all.filter((ticket) => ticket.funding_type === 'sponsored').length,
    reserved: (allocations.data || []).reduce((total, allocation) => total + Number(allocation.reserved_quantity || 0), 0),
    cancelled: all.filter((ticket) => ticket.status === 'cancelled').length,
    checkedIn: all.filter((ticket) => ticket.is_scanned || ticket.status === 'used').length,
    faceValue: all.reduce((total, ticket) => total + Number(ticket.original_face_value || 0), 0),
    sponsorshipRevenue: (sponsorships.data || []).filter((order) => order.payment_status === 'paid').reduce((total, order) => total + Number(order.amount_paid || 0), 0),
  };
  return { allocations: allocations.data || [], guests: all, sponsorships: sponsorships.data || [], summary };
}

async function createDirect(admin, actorId, input, event) {
  const recipients = (input.recipients || []).map(cleanRecipient);
  if (!recipients.length) throw Object.assign(new Error('Add at least one recipient'), { statusCode: 422 });
  if (recipients.some((recipient) => !recipient.email)) throw Object.assign(new Error('Every recipient needs a valid email address for ticket delivery'), { statusCode: 422 });
  entryFee(event, input.entryFeeType);
  const allocationId = await createAllocation(admin, actorId, {
    ...input, eventSlug: event.slug, quantity: recipients.length, reserveQuantity: 0,
    fundingType: 'complimentary', distributionMethod: 'direct', name: input.name || `Direct issue — ${input.entryFeeType}`,
  });
  return issueRecipients(admin, { allocationId, recipients, actorId });
}

async function createBulk(admin, actorId, input, event) {
  const recipients = (input.recipients || []).map(cleanRecipient);
  if (!recipients.length) throw Object.assign(new Error('Add at least one recipient'), { statusCode: 422 });
  if (recipients.some((recipient) => !recipient.email)) throw Object.assign(new Error('Every bulk recipient needs a valid email address for ticket delivery'), { statusCode: 422 });
  if (Math.max(0, Math.floor(Number(input.unassignedQuantity || 0))) > 0) throw Object.assign(new Error('Unassigned tickets are unavailable because every guest ticket must be delivered by email'), { statusCode: 422 });
  entryFee(event, input.entryFeeType);
  const allocationId = await createAllocation(admin, actorId, {
    ...input, eventSlug: event.slug, quantity: recipients.length, reserveQuantity: recipients.length,
    fundingType: 'complimentary', distributionMethod: 'bulk', name: input.name || `Bulk guest list — ${input.entryFeeType}`,
  });
  const issued = await issueRecipients(admin, { allocationId, recipients, actorId });
  return { allocationId, issued: issued.ids.length };
}

async function createClaimLink(admin, actorId, input, event) {
  entryFee(event, input.entryFeeType);
  const quantity = Math.max(1, Math.floor(Number(input.quantity || 0)));
  const allocationId = await createAllocation(admin, actorId, {
    ...input, eventSlug: event.slug, quantity, reserveQuantity: quantity, fundingType: 'complimentary', distributionMethod: 'claim_link',
    name: input.name || `Claim link — ${input.entryFeeType}`,
  });
  const token = randomToken();
  const password = String(input.password || '').trim();
  const approvedEmails = (input.approvedEmails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean).map((email) => hashSecret(`email:${email}`));
  const domains = (input.allowedEmailDomains || []).map((domain) => String(domain || '').trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  const { error } = await admin.from('ticket_allocation_claim_tokens').insert({
    allocation_id: allocationId, token_hash: hashSecret(`claim:${token}`), password_hash: password ? hashSecret(`password:${password}`) : null,
    max_per_claim: Math.max(1, Math.floor(Number(input.maxPerClaim || 1))), max_per_email: input.maxPerEmail ? Math.max(1, Math.floor(Number(input.maxPerEmail))) : null,
    allowed_email_domains: domains, approved_email_hashes: approvedEmails, recipient_requirements: { ...(input.recipientRequirements || {}), name: true, email: true },
    show_remaining: input.showRemaining !== false, custom_message: String(input.customMessage || '').trim() || null,
  });
  if (error) throw error;
  return { allocationId, claimUrl: publicUrl(`/claim/${token}`) };
}

async function createCodes(admin, actorId, input, event) {
  entryFee(event, input.entryFeeType);
  const codeCount = Math.max(1, Math.min(5000, Math.floor(Number(input.codeCount || 0))));
  const ticketsPerRedemption = Math.max(1, Math.floor(Number(input.ticketsPerRedemption || 1)));
  const maxRedemptions = Math.max(1, Math.floor(Number(input.maxRedemptions || 1)));
  const totalQuantity = codeCount * ticketsPerRedemption * maxRedemptions;
  const allocationId = await createAllocation(admin, actorId, {
    ...input, eventSlug: event.slug, quantity: totalQuantity, reserveQuantity: totalQuantity, fundingType: 'complimentary', distributionMethod: 'redemption_code',
    name: input.name || `Codes — ${input.entryFeeType}`,
  });
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  const codes = [];
  const records = [];
  const unique = new Set();
  while (codes.length < codeCount) {
    const code = randomCode(input.prefix);
    if (unique.has(code)) continue;
    unique.add(code);
    const assignment = assignments[codes.length] || {};
    const email = assignment.email ? String(assignment.email).trim().toLowerCase() : null;
    records.push({ allocation_id: allocationId, code_hash: hashSecret(`code:${code.toUpperCase()}`), masked_code: maskCode(code), recipient_email_hash: email ? hashSecret(`email:${email}`) : null, tickets_per_redemption: ticketsPerRedemption, max_redemptions: maxRedemptions, starts_at: input.startsAt || null, expires_at: input.expiresAt || null, status: input.startsAt && new Date(input.startsAt) > new Date() ? 'scheduled' : 'available' });
    codes.push(code);
  }
  const { error } = await admin.from('ticket_redemption_codes').insert(records);
  if (error) throw error;
  return { allocationId, codes, redeemUrl: publicUrl(`/redeem/${encodeURIComponent(event.slug)}`) };
}

async function createSponsorship(admin, actorId, input, event) {
  const quantity = Math.max(1, Math.floor(Number(input.quantity || 0)));
  const sponsorName = String(input.sponsorName || '').trim();
  const sponsorEmail = String(input.sponsorEmail || '').trim().toLowerCase();
  if (!sponsorName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sponsorEmail)) {
    throw Object.assign(new Error('A sponsor name and valid sponsor email are required'), { statusCode: 422 });
  }
  const fee = entryFee(event, input.entryFeeType);
  const discount = Math.max(0, Math.min(fee.amount * quantity, Number(input.discountAmount || 0)));
  const subtotal = fee.amount * quantity - discount;
  const split = calculateRevenueSplit(subtotal, require("../../shared/eventMoney").priceScale(event.country_code, event.currency));
  const allocationId = await createAllocation(admin, actorId, {
    ...input, eventSlug: event.slug, expiresAt: input.paymentDeadline || input.expiresAt || null, quantity, reserveQuantity: quantity, fundingType: 'sponsored', distributionMethod: input.distributionMethod || 'claim_link',
    name: input.name || `Sponsored allocation — ${input.entryFeeType}`, initialStatus: 'awaiting_funding',
  });
  const paymentToken = randomToken();
  const { data: order, error } = await admin.from('ticket_sponsorship_orders').insert({
    allocation_id: allocationId, sponsor_name: sponsorName, sponsor_organisation: String(input.sponsorOrganisation || '').trim() || null,
    sponsor_email: sponsorEmail, sponsor_phone: String(input.sponsorPhone || '').trim() || null,
    sponsor_message: String(input.sponsorMessage || '').trim() || null, payment_token_hash: hashSecret(`sponsor:${paymentToken}`), payment_token_expires_at: input.paymentDeadline || null,
    payment_method: null, face_value: fee.amount * quantity, discount_amount: discount, platform_fee: split.appCommission, gateway_fee: 0,
    amount_paid: subtotal, organiser_net: split.venueRevenue, payment_deadline: input.paymentDeadline || null,
  }).select('*').single();
  if (error) throw error;
  return { allocationId, order, paymentUrl: publicUrl(`/sponsor/pay/${paymentToken}`) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = bodyOf(event);
    const { admin, authUser, profile } = await requireUser(event);
    const action = String(body.action || 'overview');
    const eventSlug = String(body.eventSlug || '').trim();
    if (!eventSlug) throw Object.assign(new Error('Event is required'), { statusCode: 422 });
    const eventRow = await assertEventOwner(admin, authUser, profile, eventSlug);
    const actorId = String(profile?.id || profile?.uid || authUser.id);

    if (action === 'overview') return json(200, await listOverview(admin, eventSlug));
    if (action === 'issue_direct') return json(201, await createDirect(admin, actorId, body, eventRow));
    if (action === 'bulk_generate') return json(201, await createBulk(admin, actorId, body, eventRow));
    if (action === 'create_claim_link') return json(201, await createClaimLink(admin, actorId, body, eventRow));
    if (action === 'generate_codes') return json(201, await createCodes(admin, actorId, body, eventRow));
    if (action === 'create_sponsorship') return json(201, await createSponsorship(admin, actorId, body, eventRow));
    if (action === 'create_sponsored_claim_link') {
      const { data: allocation, error } = await admin.from('ticket_allocations').select('*').eq('id', body.allocationId).eq('event_slug', eventSlug).maybeSingle();
      if (error) throw error;
      if (!allocation || allocation.funding_type !== 'sponsored') throw Object.assign(new Error('Sponsored allocation not found'), { statusCode: 404 });
      if (allocation.status !== 'ready_for_distribution') throw Object.assign(new Error('This allocation becomes distributable only after sponsor payment is verified'), { statusCode: 409 });
      if (allocation.distribution_method !== 'claim_link') throw Object.assign(new Error('This sponsored allocation was configured for a different distribution method'), { statusCode: 422 });
      const token = randomToken();
      const { error: tokenError } = await admin.from('ticket_allocation_claim_tokens').insert({ allocation_id: allocation.id, token_hash: hashSecret(`claim:${token}`), max_per_claim: Math.max(1, Math.min(allocation.reserved_quantity, Number(body.maxPerClaim || 1))), recipient_requirements: { ...(body.recipientRequirements || {}), name: true, email: true }, custom_message: body.customMessage || null });
      if (tokenError) {
        if (tokenError.code === '23505') throw Object.assign(new Error('A claim link has already been created for this sponsored allocation'), { statusCode: 409 });
        throw tokenError;
      }
      return json(201, { claimUrl: publicUrl(`/claim/${token}`) });
    }
    if (action === 'release_allocation') {
      const { data, error } = await admin.rpc('release_ticket_allocation_reservation', { p_allocation_id: body.allocationId, p_actor_id: actorId, p_reason: body.reason || null });
      if (error) throw error;
      return json(200, { released: data });
    }
    if (action === 'cancel_ticket') {
      const { data: ticket, error: lookupError } = await admin.from('tickets').select('id,status,allocation_id,event_slug,is_scanned').eq('id', body.ticketId).eq('event_slug', eventSlug).maybeSingle();
      if (lookupError) throw lookupError;
      if (!ticket) throw Object.assign(new Error('Ticket not found'), { statusCode: 404 });
      if (ticket.is_scanned || ticket.status === 'used') throw Object.assign(new Error('Checked-in tickets cannot be cancelled'), { statusCode: 409 });
      const { error } = await admin.from('tickets').update({ status: 'cancelled', payout_eligible: false, payout_status: 'not_eligible' }).eq('id', ticket.id).in('status', ['active', 'pending']);
      if (error) throw error;
      if (ticket.allocation_id) {
        const { data: allocation, error: allocationError } = await admin.from('ticket_allocations').select('issued_quantity,cancelled_quantity').eq('id', ticket.allocation_id).maybeSingle();
        if (allocationError) throw allocationError;
        if (allocation) {
          const { error: allocationUpdateError } = await admin.from('ticket_allocations').update({
            issued_quantity: Math.max(0, Number(allocation.issued_quantity || 0) - 1),
            cancelled_quantity: Number(allocation.cancelled_quantity || 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', ticket.allocation_id);
          if (allocationUpdateError) throw allocationUpdateError;
        }
      }
      await admin.from('ticket_issuance_audits').insert({ allocation_id: ticket.allocation_id, event_slug: eventSlug, actor_id: actorId, action: 'ticket_cancelled', entity_type: 'ticket', entity_id: ticket.id });
      return json(200, { success: true });
    }
    if (action === 'resend_ticket') {
      const { data: ticket, error } = await admin.from('tickets').select('*').eq('id', body.ticketId).eq('event_slug', eventSlug).maybeSingle();
      if (error) throw error;
      if (!ticket?.delivery_email) throw Object.assign(new Error('This guest does not have a delivery email'), { statusCode: 422 });
      const response = await fetch(`${siteBaseUrl()}/.netlify/functions/request-ticket-resend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ticket.delivery_email }) });
      if (!response.ok) throw Object.assign(new Error('Unable to queue ticket delivery'), { statusCode: 502 });
      return json(200, { success: true });
    }
    if (action === 'send_sponsor_link') {
      const { data: order, error } = await admin.from('ticket_sponsorship_orders').select('sponsor_email,payment_token_hash').eq('id', body.orderId).maybeSingle();
      if (error) throw error;
      if (!order) throw Object.assign(new Error('Sponsor order not found'), { statusCode: 404 });
      // Tokens are intentionally not recoverable. Reissue a fresh link instead.
      const token = randomToken();
      await admin.from('ticket_sponsorship_orders').update({ payment_token_hash: hashSecret(`sponsor:${token}`), updated_at: new Date().toISOString() }).eq('id', body.orderId);
      const link = publicUrl(`/sponsor/pay/${token}`);
      const sent = await sendTransactionalEmail({ to: order.sponsor_email, subject: 'Complete your YoVibe sponsorship', html: `<p>Your sponsored ticket allocation is ready for payment.</p><p><a href="${link}">Complete secure payment</a></p>`, text: `Complete secure payment: ${link}` });
      if (!sent.ok) throw Object.assign(new Error('Unable to send sponsor payment link'), { statusCode: 502 });
      return json(200, { success: true });
    }
    throw Object.assign(new Error('Unknown action'), { statusCode: 400 });
  } catch (error) {
    console.error('[GuestTicketAllocations]', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to process guest ticket request' });
  }
};
