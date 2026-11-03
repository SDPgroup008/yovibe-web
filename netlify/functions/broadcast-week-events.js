const { getAdminClient } = require('../shared/supabaseAdmin');
const { sendEventSummaryBroadcast } = require('../shared/eventSummaryBroadcast');
const { isScheduledWorkerEnabled, disabledResponse } = require('../shared/stagingScheduledWorkerGate');

exports.handler = async () => {
  if (!isScheduledWorkerEnabled()) {
    return disabledResponse('broadcast-week-events');
  }

  const appEnv = String(process.env.APP_ENV || '').toLowerCase();
  if (!['production', 'staging'].includes(appEnv) || process.env.NOTIFICATION_DISPATCH_ENABLED !== 'true') {
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
    const code = /^[a-z0-9_\/-]{1,80}$/i.test(String(error.code || '')) ? error.code : 'delivery_error';
    console.error('[broadcast-week-events] failed', { code });
    return { statusCode: 500, body: JSON.stringify({ error: 'Event broadcast failed' }) };
  }
};
