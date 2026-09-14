const { getAdminClient } = require('../shared/supabaseAdmin');
const { presignR2, privateReference } = require('../shared/r2');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON body' }); }
  const ticketId = String(body.ticketId || '').trim();
  const token = String(body.token || '').trim();
  const key = String(body.key || '');
  const contentType = String(body.contentType || '').toLowerCase();
  if (!ticketId || !token || key !== `buyer-photos/${ticketId}.jpg` || !/^[a-zA-Z0-9._-]{1,160}$/.test(ticketId)) {
    return response(400, { error: 'Invalid buyer photo request' });
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return response(415, { error: 'Unsupported image type' });

  try {
    const admin = getAdminClient();
    const { data: ticket, error: ticketError } = await admin.from('tickets')
      .select('id, buyer_photo_url, photo_upload_token_expires_at')
      .eq('id', ticketId).eq('photo_upload_token', token).maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket || ticket.buyer_photo_url) return response(403, { error: 'Photo link is invalid or already used' });
    if (!ticket.photo_upload_token_expires_at || new Date(ticket.photo_upload_token_expires_at) <= new Date()) {
      return response(410, { error: 'Photo link has expired' });
    }
    const uploadUrl = presignR2({ kind: 'private', method: 'PUT', key, contentType, expiresSeconds: 900 });
    return response(200, {
      success: true,
      uploadUrl,
      key,
      photoReference: privateReference(key),
    });
  } catch (error) {
    console.error('[PresignBuyerPhoto] Error:', error.message);
    return response(500, { error: 'Unable to prepare photo upload' });
  }
};
