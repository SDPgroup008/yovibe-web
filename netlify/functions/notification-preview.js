const { getAdminClient } = require('../shared/supabaseAdmin');
const { parseEventPreviews, renderNotificationCollage } = require('../shared/notificationCollage');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    'Content-Disposition': 'inline; filename="yovibe-event-summary.png"',
    'X-Content-Type-Options': 'nosniff',
  };
  const notificationId = event.queryStringParameters?.notificationId;
  if (!notificationId || !/^[0-9a-f-]{20,}$/i.test(notificationId)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid notification id' }) };
  }

  try {
    const { data, error } = await getAdminClient()
      .from('notifications')
      .select('id,user_id,type,data')
      .eq('id', notificationId)
      .is('user_id', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.type !== 'promotion') return { statusCode: 404, headers, body: '' };
    const previews = parseEventPreviews(data.data?.eventPreviews);
    const image = await renderNotificationCollage(previews);
    return { statusCode: 200, headers, isBase64Encoded: true, body: image.toString('base64') };
  } catch (error) {
    console.error('[notification-preview] failed:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Unable to render notification preview' }) };
  }
};
