const { createClient } = require('@supabase/supabase-js');
const { requiredEnv, assertSupabaseUrl, isStaging } = require('./runtimeConfig');

function getAdminClient() {
  const url = assertSupabaseUrl(requiredEnv('SUPABASE_URL'));
  // Production historically names this credential SUPABASE_SERVICE_ROLE_KEY
  // (and some deployments use SUPABASE_SERVICE_KEY). Keep the canonical
  // SUPABASE_SECRET_KEY name first for staging, while accepting those existing
  // server-only aliases without exposing any credential to the client.
  const key = requiredEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isMissingRevocationTable(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || (message.includes('relation') && message.includes('does not exist'));
}

async function hasActiveAccessRevocation(admin, authUserId) {
  const { data, error } = await admin
    .from('account_access_revocations')
    .select('auth_user_id')
    .eq('auth_user_id', authUserId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  // A deploy can precede the additive migration. Existing protected functions
  // remain available, while hard deletion itself fails closed until it exists.
  if (error && isMissingRevocationTable(error)) return false;
  if (error) throw error;
  return Boolean(data);
}

async function requireUser(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Invalid authentication token'), { statusCode: 401 });
  if (await hasActiveAccessRevocation(admin, data.user.id)) {
    throw Object.assign(new Error('This session has been revoked'), { statusCode: 401 });
  }
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
    .select('id,uid,user_type,email,is_deleted')
    .eq('uid', data.user.id)
    .maybeSingle();
  if (uidError) throw uidError;
  if (byUid) {
    profile = byUid;
  } else {
    const { data: byId, error: idError } = await admin
      .from('users')
      .select('id,uid,user_type,email,is_deleted')
      .eq('id', data.user.id)
      .maybeSingle();
    if (idError) throw idError;
    profile = byId;
  }
  if (profile?.is_deleted === true) {
    throw Object.assign(new Error('This account is no longer available'), { statusCode: 403 });
  }
  return { admin, authUser: data.user, profile };
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

module.exports = { getAdminClient, requireUser, json, hasActiveAccessRevocation, isMissingRevocationTable };
