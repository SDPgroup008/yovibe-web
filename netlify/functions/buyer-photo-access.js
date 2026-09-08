const { getAdminClient, json } = require('../shared/supabaseAdmin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
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
    return json(200, { success: true, status: 'valid', ticketId: ticket.id });
  } catch (error) {
    console.error('[BuyerPhotoAccess] Error:', error.message);
    return json(500, { error: 'Unable to validate photo link' });
  }
};
