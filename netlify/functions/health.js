// netlify/functions/health.js
//
// Phase 5 (5.1): health check. Returns which critical env vars are configured
// (presence only — never values) and whether the database is reachable.
// Used by uptime monitors and by us when debugging deployments.

const { getAdminClient, json } = require('../shared/supabaseAdmin');

const CRITICAL_VARS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'QR_HMAC_SECRET',
  'PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'PESAPAL_NOTIFICATION_ID',
  'PAWAPAY_API_KEY', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'RESEND_API_KEY', 'ZEPTOMAIL_TOKEN', 'SITE_URL',
];

exports.handler = async (event) => {
  const env = {};
  let missing = [];
  for (const key of CRITICAL_VARS) {
    const present = Boolean(process.env[key] && !String(process.env[key]).includes('your_') && !String(process.env[key]).includes('placeholder'));
    env[key] = present ? 'SET' : 'MISSING_OR_PLACEHOLDER';
    if (!present) missing.push(key);
  }

  let dbOk = false;
  let dbError = null;
  try {
    const admin = getAdminClient();
    const { error } = await admin.from('events').select('slug', { count: 'exact', head: true });
    dbOk = !error;
    dbError = error ? error.message : null;
  } catch (e) {
    dbError = e.message;
  }

  const healthy = dbOk && missing.length === 0;
  return json(healthy ? 200 : 503, {
    ok: healthy,
    db: dbOk ? 'reachable' : `unreachable: ${dbError || 'unknown'}`,
    missingEnv: missing,
    env,
    timestamp: new Date().toISOString(),
  });
};
