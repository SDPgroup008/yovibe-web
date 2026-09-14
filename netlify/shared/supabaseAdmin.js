const { createClient } = require('@supabase/supabase-js');
const { requiredEnv, assertSupabaseUrl, isStaging } = require('./runtimeConfig');

function getAdminClient() {
  const url = assertSupabaseUrl(requiredEnv('SUPABASE_URL'));
  const key = requiredEnv('SUPABASE_SECRET_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireUser(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Invalid authentication token'), { statusCode: 401 });
  if (isStaging()) {
    const allowed = requiredEnv('STAGING_ALLOWED_EMAILS').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
    const email = String(data.user.email || '').trim().toLowerCase();
    if (!email || !allowed.includes(email)) {
      throw Object.assign(new Error('This account is not approved for staging certification'), { statusCode: 403 });
    }
  }

  // Match profiles the same way the app does (getUserProfileOrNull): the
  // `users` table keeps the auth id in `uid` (row `id` is a separate key), so
  // look up by `uid` first and fall back to `id`.
  let profile = null;
  const { data: byUid, error: uidError } = await admin
    .from('users')
    .select('id,uid,user_type,email')
    .eq('uid', data.user.id)
    .maybeSingle();
  if (uidError) throw uidError;
  if (byUid) {
    profile = byUid;
  } else {
    const { data: byId, error: idError } = await admin
      .from('users')
      .select('id,uid,user_type,email')
      .eq('id', data.user.id)
      .maybeSingle();
    if (idError) throw idError;
    profile = byId;
  }
  return { admin, authUser: data.user, profile };
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

module.exports = { getAdminClient, requireUser, json };
