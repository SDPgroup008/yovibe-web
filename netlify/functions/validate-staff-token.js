const { getAdminClient, json } = require('../shared/supabaseAdmin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { valid: false, error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const tokenValue = typeof body.token === 'string' ? body.token.trim() : '';
    if (!tokenValue) return json(400, { valid: false, error: 'Scanner token is required' });
    const admin = getAdminClient();
    const { data: token, error } = await admin.from('event_staff_tokens')
      .select('event_id').eq('token', tokenValue)
      .gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!token) return json(401, { valid: false, error: 'This scanner link is invalid or expired' });
    const { data: scanEvent, error: eventError } = await admin.from('events')
      .select('name, slug').eq('slug', token.event_id).maybeSingle();
    if (eventError) throw eventError;
    if (!scanEvent) return json(404, { valid: false, error: 'Event not found' });
    return json(200, {
      valid: true,
      eventId: token.event_id,
      eventSlug: scanEvent.slug,
      eventName: scanEvent.name,
    });
  } catch (error) {
    console.error('[ValidateStaffToken] Error:', error.message);
    return json(500, { valid: false, error: 'Unable to validate scanner link' });
  }
};
