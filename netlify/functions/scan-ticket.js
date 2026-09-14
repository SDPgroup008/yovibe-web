const { getAdminClient, requireUser, json } = require('../shared/supabaseAdmin');
const { verify } = require('./ticket-qr');
const { privateKeyFromReference, presignR2 } = require('../shared/r2');

function ticketDetails(ticket) {
  const privateKey = privateKeyFromReference(ticket.buyer_photo_url);
  return {
    ticketRef: ticket.ticket_ref,
    entryFeeType: ticket.entry_fee_type,
    seatNumber: ticket.seat_number,
    tableNumber: ticket.table_number,
    buyerName: ticket.buyer_name,
    buyerPhotoUrl: privateKey
      ? presignR2({ kind: 'private', method: 'GET', key: privateKey, expiresSeconds: 120 })
      : ticket.buyer_photo_url,
  };
}

async function authorizeScanner(event, admin, eventId, staffToken) {
  if (staffToken) {
    const { data: token, error } = await admin.from('event_staff_tokens').select('id, event_id')
      .eq('token', String(staffToken)).eq('event_id', eventId)
      .gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!token) throw Object.assign(new Error('Scanner link is invalid or expired'), { statusCode: 401 });
    return { validatorId: `staff:${token.id}` };
  }

  const { authUser, profile } = await requireUser(event);
  if (profile?.user_type === 'admin') return { validatorId: authUser.id };
  const { data: scanEvent, error } = await admin.from('events').select('created_by, created_by_auth')
    .eq('slug', eventId).maybeSingle();
  if (error) throw error;
  if (!scanEvent) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  const ids = [authUser.id, profile?.uid, profile?.id].filter(Boolean).map(String);
  if (!ids.includes(String(scanEvent.created_by || '')) && !ids.includes(String(scanEvent.created_by_auth || ''))) {
    throw Object.assign(new Error('You do not own this event'), { statusCode: 403 });
  }
  return { validatorId: authUser.id };
}

async function logValidation(admin, ticket, validatorId, location, status, reason) {
  const row = {
    ticketId: ticket.id,
    eventId: ticket.event_slug || ticket.event_id,
    validatedAt: new Date().toISOString(),
    validatedBy: validatorId,
    location: location || null,
    status,
    reason: reason || null,
    event_slug: ticket.event_slug || ticket.event_id,
  };
  const { error } = await admin.from('ticket_validations').insert(row);
  if (error) console.warn('[ScanTicket] Validation log failed:', error.message);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { success: false, reason: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
    const qrText = typeof body.qrText === 'string' ? body.qrText : '';
    if (!eventId || !qrText) return json(400, { success: false, reason: 'eventId and qrText are required' });

    const admin = getAdminClient();
    const { validatorId } = await authorizeScanner(event, admin, eventId, body.staffToken);
    const qr = verify(qrText);
    if (!qr.valid || !qr.ticketId) return json(422, { success: false, reason: 'Invalid QR code' });
    if (body.ticketId && String(body.ticketId) !== String(qr.ticketId)) {
      return json(422, { success: false, reason: 'QR code does not match the pending ticket' });
    }

    const { data: ticket, error: ticketError } = await admin.from('tickets').select('*').eq('id', qr.ticketId).maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) return json(404, { success: false, reason: 'Ticket not found' });
    const details = ticketDetails(ticket);
    if (![ticket.event_slug, ticket.event_id].map(String).includes(eventId)) {
      await logValidation(admin, ticket, validatorId, body.location, 'denied', 'Wrong event');
      return json(403, { success: false, reason: 'Ticket is for a different event', ...details });
    }
    if (ticket.payment_status !== 'completed') {
      await logValidation(admin, ticket, validatorId, body.location, 'denied', 'Payment is not completed');
      return json(409, { success: false, reason: 'Ticket payment is not completed', ...details });
    }
    if (ticket.expires_at && new Date(ticket.expires_at) < new Date()) {
      await admin.from('tickets').update({ status: 'expired' }).eq('id', ticket.id).eq('status', 'active');
      await logValidation(admin, ticket, validatorId, body.location, 'denied', 'Ticket has expired');
      return json(409, { success: false, reason: 'Ticket has expired', ...details });
    }

    if (ticket.status === 'used' && ticket.reentry_pass && ticket.reentry_pass.used === false) {
      const nextPass = { ...ticket.reentry_pass, used: true };
      const { data: consumed } = await admin.from('tickets').update({ reentry_pass: nextPass })
        .eq('id', ticket.id).eq('status', 'used').eq('reentry_pass->>used', 'false').select('id');
      if (consumed?.length === 1) {
        await logValidation(admin, ticket, validatorId, body.location, 'granted', 'Authorized re-entry');
        return json(200, {
          success: true, isReentry: true, ...details,
          reentryGrantedByName: ticket.reentry_pass.grantedByName,
          reentryGrantedAt: ticket.reentry_pass.grantedAt,
        });
      }
    }
    if (ticket.status !== 'active' || ticket.is_scanned) {
      const reason = ticket.status === 'used' || ticket.is_scanned ? 'Ticket already used' : `Ticket is ${ticket.status}`;
      await logValidation(admin, ticket, validatorId, body.location, 'denied', reason);
      return json(409, { success: false, reason, ...details });
    }

    if (body.action !== 'confirm-photo' && ticket.buyer_photo_url) {
      return json(200, {
        success: true, needsPhotoVerification: true, ticketDocId: ticket.id, ...details,
      });
    }
    if (body.action === 'confirm-photo' && !ticket.buyer_photo_url) {
      return json(409, { success: false, reason: 'This ticket does not require photo confirmation', ...details });
    }

    const now = new Date().toISOString();
    const { data: redeemed, error: redeemError } = await admin.from('tickets').update({
      status: 'used', is_scanned: true, scanned_at: now,
      payout_eligible: true, payout_status: 'pending',
    }).eq('id', ticket.id).eq('status', 'active').eq('is_scanned', false)
      .eq('payment_status', 'completed').select('id');
    if (redeemError) throw redeemError;
    if (!redeemed || redeemed.length !== 1) {
      await logValidation(admin, ticket, validatorId, body.location, 'denied', 'Ticket already used');
      return json(409, { success: false, reason: 'Ticket already used', ...details });
    }
    await logValidation(admin, ticket, validatorId, body.location, 'granted',
      body.action === 'confirm-photo' ? 'Photo verification confirmed' : null);
    return json(200, { success: true, ...details });
  } catch (error) {
    console.error('[ScanTicket] Error:', error.message);
    return json(error.statusCode || 500, { success: false, reason: error.message || 'Validation failed' });
  }
};
