const { createClient } = require('@supabase/supabase-js');

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireUser(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Invalid authentication token'), { statusCode: 401 });
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id,user_type,email')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  return { admin, authUser: data.user, profile };
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

module.exports = { getAdminClient, requireUser, json };
