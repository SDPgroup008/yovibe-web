// netlify/functions/health.js
//
// Phase 5 (5.1): health check. Returns which critical env vars are configured
// (presence only — never values) and whether the database is reachable.
// Used by uptime monitors and by us when debugging deployments.

const { getAdminClient, json } = require('../shared/supabaseAdmin');
const {
  appEnvironment,
  assertSupabaseUrl,
  assertPesapalUrl,
  assertPawaPayUrl,
  assertSiteUrl,
  assertR2Config,
} = require('../shared/runtimeConfig');

const CRITICAL_VARS = [
  'APP_ENV', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'QR_HMAC_SECRET',
  'PESAPAL_CONSUMER_KEY', 'PESAPAL_CONSUMER_SECRET', 'PESAPAL_NOTIFICATION_ID',
  'PESAPAL_API_URL', 'PESAPAL_BASE_URL', 'PAWAPAY_API_KEY', 'PAWAPAY_API_URL',
  'R2_ENDPOINT', 'R2_PRIVATE_BUCKET_NAME', 'R2_PRIVATE_ACCESS_KEY_ID', 'R2_PRIVATE_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BUCKET_NAME', 'R2_PUBLIC_ACCESS_KEY_ID', 'R2_PUBLIC_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL',
  'SITE_URL', 'REFUND_LINK_SECRET', 'PAYOUT_OTP_SECRET',
  'FULFILLMENT_WORKER_SECRET', 'STAGING_ACCESS_SECRET', 'STAGING_ACCESS_PASSWORD',
  'TICKET_EMAIL_FROM', 'PAYOUT_EMAIL_FROM',
  'FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT',
];

exports.handler = async (event) => {
  const env = {};
  let missing = [];
  for (const key of CRITICAL_VARS) {
    const present = Boolean(process.env[key] && !String(process.env[key]).includes('your_') && !String(process.env[key]).includes('placeholder'));
    env[key] = present ? 'SET' : 'MISSING_OR_PLACEHOLDER';
    if (!present) missing.push(key);
  }
  const hasEmailProvider = Boolean(process.env.RESEND_API_KEY || process.env.ZEPTOMAIL_TOKEN);
  env.EMAIL_PROVIDER = hasEmailProvider ? 'SET' : 'MISSING_OR_PLACEHOLDER';
  if (!hasEmailProvider) missing.push('RESEND_API_KEY or ZEPTOMAIL_TOKEN');

  let isolationError = null;
  try {
    appEnvironment();
    if (process.env.SUPABASE_URL) assertSupabaseUrl(process.env.SUPABASE_URL);
    if (process.env.PESAPAL_API_URL) assertPesapalUrl(process.env.PESAPAL_API_URL);
    if (process.env.PESAPAL_BASE_URL) assertPesapalUrl(process.env.PESAPAL_BASE_URL);
    if (process.env.PAWAPAY_API_URL) assertPawaPayUrl(process.env.PAWAPAY_API_URL);
    if (process.env.SITE_URL) assertSiteUrl(process.env.SITE_URL);
    if (process.env.R2_ENDPOINT && process.env.R2_PRIVATE_BUCKET_NAME) {
      assertR2Config({ kind: 'private', endpoint: process.env.R2_ENDPOINT, bucket: process.env.R2_PRIVATE_BUCKET_NAME, publicUrl: null });
    }
    if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_BUCKET_NAME) {
      assertR2Config({ kind: 'public', endpoint: process.env.R2_ENDPOINT, bucket: process.env.R2_PUBLIC_BUCKET_NAME, publicUrl: process.env.R2_PUBLIC_URL });
    }
    for (const secretName of ['REFUND_LINK_SECRET', 'QR_HMAC_SECRET', 'PAYOUT_OTP_SECRET', 'FULFILLMENT_WORKER_SECRET', 'STAGING_ACCESS_SECRET']) {
      if (process.env[secretName] && Buffer.byteLength(process.env[secretName], 'utf8') < 32) {
        throw new Error(`${secretName} must be at least 32 bytes`);
      }
    }
    if (process.env.STAGING_ACCESS_PASSWORD && Buffer.byteLength(process.env.STAGING_ACCESS_PASSWORD, 'utf8') < 16) {
      throw new Error('STAGING_ACCESS_PASSWORD must be at least 16 bytes');
    }
  } catch (error) {
    isolationError = error.message;
  }

  // quick=1: uptime monitors should use this — env check only, no DB ping,
  // so cold-start latency is minimal and transient platform 503s are rare.
  const quick = (event.queryStringParameters && event.queryStringParameters.quick === '1');

  let dbOk = false;
  let dbError = null;
  if (!quick) {
    try {
      const admin = getAdminClient();
      const { error } = await admin.from('events').select('slug', { count: 'exact', head: true });
      dbOk = !error;
      dbError = error ? error.message : null;
    } catch (e) {
      dbError = e.message;
    }
  } else {
    dbOk = true; // not checked in quick mode
  }

  const healthy = dbOk && missing.length === 0 && !isolationError;
  return json(healthy ? 200 : 503, {
    ok: healthy,
    mode: quick ? 'quick' : 'full',
    db: quick ? 'skipped' : (dbOk ? 'reachable' : `unreachable: ${dbError || 'unknown'}`),
    missingEnv: missing,
    isolation: isolationError ? `unsafe: ${isolationError}` : 'safe',
    env,
    timestamp: new Date().toISOString(),
  });
};
