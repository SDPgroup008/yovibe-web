const { getAdminClient, json } = require('../shared/supabaseAdmin');
const { privateReference } = require('../shared/r2');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action === 'complete' ? 'complete' : 'validate';
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!ticketId || !token) return json(400, { error: 'Ticket and token are required' });

    const admin = getAdminClient();
    const { data: ticket, error } = await admin.from('tickets')
      .select('id, buyer_photo_url, photo_upload_token_expires_at')
      .eq('id', ticketId).eq('photo_upload_token', token).maybeSingle();
    if (error) throw error;
    if (!ticket) return json(404, { error: 'Invalid photo link' });
    if (ticket.buyer_photo_url) return json(200, { success: true, status: 'done', ticketId: ticket.id });
    if (!ticket.photo_upload_token_expires_at || new Date(ticket.photo_upload_token_expires_at) <= new Date()) {
      return json(410, { error: 'Photo link has expired', status: 'expired' });
    }
    if (action === 'complete') {
      const expectedReference = privateReference(`buyer-photos/${ticket.id}.jpg`);
      const { data: updated, error: updateError } = await admin.from('tickets')
        .update({
          buyer_photo_url: expectedReference,
          photo_upload_token: null,
          photo_upload_token_expires_at: null,
        })
        .eq('id', ticket.id)
        .eq('photo_upload_token', token)
        .is('buyer_photo_url', null)
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return json(409, { error: 'Photo link is no longer valid' });
      return json(200, { success: true, status: 'done', ticketId: ticket.id });
    }

    return json(200, { success: true, status: 'valid', ticketId: ticket.id });
  } catch (error) {
    console.error('[BuyerPhotoAccess] Error:', error.message);
    return json(500, { error: 'Unable to validate photo link' });
  }
};
