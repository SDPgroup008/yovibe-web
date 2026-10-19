const { getAdminClient, json } = require('../shared/supabaseAdmin');
const { optionalAuthUser, resolveInstallation } = require('./notification-feed');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request body' }); }
    if (!UUID_RE.test(String(body.notificationId || ''))) return json(400, { error: 'Invalid notification' });
    const admin = getAdminClient();
    const [user, installation] = await Promise.all([
      optionalAuthUser(admin, event),
      resolveInstallation(admin, body.installationId, body.installationSecret),
    ]);
    if (!installation) return json(403, { error: 'Notification installation required' });
    const { data: notification, error } = await admin.from('notifications')
      .select('id,user_id,created_at').eq('id', body.notificationId).maybeSingle();
    if (error) throw error;
    const allowed = notification && (notification.user_id
      ? notification.user_id === user?.id
      : notification.created_at && Date.parse(notification.created_at) >= Date.parse(installation.broadcasts_from));
    if (!allowed) return json(404, { error: 'Notification not found' });
    const { error: insertError } = await admin.from('notification_installation_opens')
      .upsert({ notification_id: notification.id, installation_id: installation.id },
        { onConflict: 'notification_id,installation_id', ignoreDuplicates: true });
    if (insertError) throw insertError;
    return json(200, { recorded: true });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[NotificationOpen] failed:', error.code || 'unknown');
    return json(status, { error: status >= 500 ? 'Unable to record notification open' : error.message });
  }
};
