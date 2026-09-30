const { getAdminClient } = require('../shared/supabaseAdmin');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const GUEST_ID = /^[a-z0-9][a-z0-9_-]{15,127}$/i;

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

async function optionalProfile(admin, event) {
  const value = event.headers?.authorization || event.headers?.Authorization || '';
  const token = value.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id')
    .eq('uid', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  return profile || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;
    const guestVisitorId = String(body.guestVisitorId || '').trim();
    const platform = body.platform === 'mobile' ? 'mobile' : 'web';
    if (!GUEST_ID.test(guestVisitorId)) return response(400, { error: 'Invalid visitor identifier' });
    if (!['start', 'touch', 'end', 'promote'].includes(action)) return response(400, { error: 'Invalid analytics action' });

    const admin = getAdminClient();
    const profile = await optionalProfile(admin, event);
    const canonicalVisitorKey = profile ? `account:${profile.id}` : `guest:${guestVisitorId}`;

    if (action === 'promote' && !profile) return response(401, { error: 'Authentication required' });
    if (action === 'promote') {
      const { data, error } = await admin.rpc('promote_analytics_session', {
        p_session_id: body.sessionId,
        p_guest_visitor_id: guestVisitorId,
        p_account_user_id: profile.id,
      });
      if (error) throw error;
      return response(200, { sessionId: data, canonicalVisitorKey });
    }

    if (action === 'end') {
      const { error } = await admin.rpc('end_analytics_session', {
        p_session_id: body.sessionId,
        p_canonical_visitor_key: canonicalVisitorKey,
      });
      if (error) throw error;
      return response(200, { ended: true });
    }

    const { data, error } = await admin.rpc('record_analytics_session', {
      p_canonical_visitor_key: canonicalVisitorKey,
      p_guest_visitor_id: guestVisitorId,
      p_account_user_id: profile?.id || null,
      p_platform: platform,
      p_user_agent: String(event.headers?.['user-agent'] || '').slice(0, 512) || null,
    });
    if (error) throw error;
    return response(200, { sessionId: data, canonicalVisitorKey });
  } catch (error) {
    console.error('analytics-session failed', error?.message || error);
    return response(error?.statusCode || 500, { error: 'Analytics session could not be recorded' });
  }
};
