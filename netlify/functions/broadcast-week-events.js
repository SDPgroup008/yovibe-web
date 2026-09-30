const { getAdminClient } = require('../shared/supabaseAdmin');
const { sendEventSummaryBroadcast } = require('../shared/eventSummaryBroadcast');

exports.handler = async () => {
  if (process.env.APP_ENV !== 'production' || process.env.NOTIFICATION_DISPATCH_ENABLED !== 'true') {
    return { statusCode: 204, body: '' };
  }

  try {
    const result = await sendEventSummaryBroadcast({
      supabase: getAdminClient(),
      mode: 'week',
      slot: new Date(Date.now() + 3 * 60 * 60 * 1000).getUTCHours() < 16 ? '11' : '20',
    });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error('[broadcast-week-events] failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
