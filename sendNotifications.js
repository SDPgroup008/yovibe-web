/**
 * Manual fallback for the production event-summary broadcasts.
 *
 * Usage:
 *   node sendNotifications.js today
 *   node sendNotifications.js week
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS
 *   SITE_URL
 */

const { createClient } = require('@supabase/supabase-js');
const { sendEventSummaryBroadcast } = require('./netlify/shared/eventSummaryBroadcast');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function main() {
  const mode = process.argv[2] || process.env.MODE || 'week';
  if (mode !== 'today' && mode !== 'week') {
    throw new Error('Mode must be "today" or "week"');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const now = new Date();
  const kampalaHour = new Date(now.getTime() + 3 * 60 * 60 * 1000).getUTCHours();
  const slot = mode === 'today'
    ? (kampalaHour < 13 ? '09' : '18')
    : (kampalaHour < 16 ? '11' : '20');

  const result = await sendEventSummaryBroadcast({ supabase, mode, slot, now });
  console.log(JSON.stringify({ mode, ...result }));
}

main().catch((error) => {
  console.error('[sendNotifications] failed:', error.message);
  process.exitCode = 1;
});
