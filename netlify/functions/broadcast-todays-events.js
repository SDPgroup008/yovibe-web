const { getAdminClient } = require('../shared/supabaseAdmin');
const { sendEventSummaryBroadcast } = require('../shared/eventSummaryBroadcast');

exports.handler = async () => {
  if (process.env.APP_ENV !== 'production' || process.env.NOTIFICATION_DISPATCH_ENABLED !== 'true') {
    return { statusCode: 204, body: '' };
  }

  try {
    const result = await sendEventSummaryBroadcast({
      supabase: getAdminClient(),
      mode: 'today',
      slot: new Date(Date.now() + 3 * 60 * 60 * 1000).getUTCHours() < 13 ? '09' : '18',
    });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    const code = /^[a-z0-9_\/-]{1,80}$/i.test(String(error.code || '')) ? error.code : 'delivery_error';
    console.error('[broadcast-todays-events] failed', { code });
    return { statusCode: 500, body: JSON.stringify({ error: 'Event broadcast failed' }) };
  }
};
