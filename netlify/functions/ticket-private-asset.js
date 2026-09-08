const { requireUser, json } = require('../shared/supabaseAdmin');
const { privateKeyFromReference, presignR2 } = require('../shared/r2');

function ownsTicket(ticket, authUser, profile) {
  const ids = [authUser.id, profile?.id, profile?.uid].filter(Boolean).map(String);
  const email = String(authUser.email || profile?.email || '').toLowerCase();
  return ids.includes(String(ticket.buyer_id || '')) ||
    (email && email === String(ticket.buyer_email || '').toLowerCase());
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { admin, authUser, profile } = await requireUser(event);
    const body = JSON.parse(event.body || '{}');
    const ticketId = String(body.ticketId || '').trim();
    const asset = body.asset === 'photo' ? 'photo' : 'qr';
    if (!ticketId) return json(400, { error: 'ticketId is required' });

    const { data: ticket, error } = await admin.from('tickets')
      .select('id, buyer_id, buyer_email, buyer_photo_url, qr_code_data_url, event_slug, event_id')
      .eq('id', ticketId).maybeSingle();
    if (error) throw error;
    if (!ticket) return json(404, { error: 'Ticket not found' });

    let authorized = profile?.user_type === 'admin' || ownsTicket(ticket, authUser, profile);
    if (!authorized) {
      const eventId = ticket.event_slug || ticket.event_id;
      const { data: ownedEvent, error: eventError } = await admin.from('events')
        .select('slug').eq('slug', eventId)
        .or(`created_by_auth.eq.${authUser.id},created_by.eq.${profile?.id || authUser.id}`)
        .maybeSingle();
      if (eventError) throw eventError;
      authorized = Boolean(ownedEvent);
    }
    if (!authorized) return json(403, { error: 'Not authorized for this ticket asset' });

    const reference = asset === 'photo' ? ticket.buyer_photo_url : ticket.qr_code_data_url;
    const key = privateKeyFromReference(reference);
    if (!key) return json(200, { url: reference || null, expiresInSeconds: null });
    return json(200, {
      url: presignR2({ kind: 'private', method: 'GET', key, expiresSeconds: 300 }),
      expiresInSeconds: 300,
    });
  } catch (error) {
    console.error('[TicketPrivateAsset] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to access ticket asset' });
  }
};
