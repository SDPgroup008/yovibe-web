const crypto = require('crypto');
const { getAdminClient, json } = require('../shared/supabaseAdmin');

const INSTALLATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    throw Object.assign(new Error('Invalid request body'), { statusCode: 400 });
  }
}

async function optionalAuthUser(admin, event) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Invalid authentication token'), { statusCode: 401 });
  return data.user;
}

async function resolveInstallation(admin, installationId, installationSecret) {
  if (!installationId && !installationSecret) return null;
  if (!INSTALLATION_ID_RE.test(String(installationId || '')) || typeof installationSecret !== 'string' || installationSecret.length < 32) {
    throw Object.assign(new Error('Invalid notification installation'), { statusCode: 400 });
  }
  const { data, error } = await admin
    .from('notification_installations')
    .select('id,secret_hash,broadcasts_from')
    .eq('id', installationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !safeEqual(data.secret_hash, hashSecret(installationSecret))) {
    throw Object.assign(new Error('Notification installation is not registered'), { statusCode: 403 });
  }
  return data;
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || '50'), 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(parsed, 200));
}

async function loadNotifications(admin, { installation, authUserId, limit }) {
  const requests = [];
  if (installation) {
    requests.push(
      admin
        .from('notifications')
        .select('id,user_id,title,body,type,data,image_url,deep_link,is_read,created_at,read_at,opened_at')
        .is('user_id', null)
        .gte('created_at', installation.broadcasts_from)
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  }
  if (authUserId) {
    requests.push(
      admin
        .from('notifications')
        .select('id,user_id,title,body,type,data,image_url,deep_link,is_read,created_at,read_at,opened_at')
        .eq('user_id', authUserId)
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  }
  if (!requests.length) return [];
  const results = await Promise.all(requests);
  for (const result of results) {
    if (result.error) throw result.error;
  }
  const unique = new Map();
  results.flatMap((result) => result.data || []).forEach((row) => unique.set(row.id, row));
  return [...unique.values()]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, limit);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = parseBody(event);
    const admin = getAdminClient();
    const [authUser, installation] = await Promise.all([
      optionalAuthUser(admin, event),
      resolveInstallation(admin, body.installationId, body.installationSecret),
    ]);
    const notifications = await loadNotifications(admin, {
      installation,
      authUserId: authUser?.id || null,
      limit: normalizeLimit(body.limit),
    });
    return json(200, {
      notifications,
      broadcastsEnabled: Boolean(installation),
      broadcastsFrom: installation?.broadcasts_from || null,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error('[notification-feed] failed:', error.message);
    return json(statusCode, { error: statusCode >= 500 ? 'Unable to load notifications' : error.message });
  }
};

module.exports = { handler: exports.handler, hashSecret, normalizeLimit, loadNotifications };
