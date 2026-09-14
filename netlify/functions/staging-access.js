const crypto = require('crypto');
const { appEnvironment, requiredEnv } = require('../shared/runtimeConfig');

const COOKIE_NAME = 'yovibe_staging';
const MAX_AGE_SECONDS = 12 * 60 * 60;
const attempts = new Map();

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function clientKey(event) {
  return String(event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
}

function rateLimited(event) {
  const key = clientKey(event);
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 8;
}

function sign(expiry) {
  const secret = requiredEnv('STAGING_ACCESS_SECRET');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('STAGING_ACCESS_SECRET must be at least 32 bytes');
  return crypto.createHmac('sha256', secret).update(String(expiry)).digest('base64url');
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (appEnvironment() !== 'staging') return json(404, { error: 'Not found' });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }
  if (body.action === 'logout') {
    return json(200, { ok: true }, {
      'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
    });
  }
  if (rateLimited(event)) return json(429, { error: 'Too many attempts. Try again later.' });

  const supplied = String(body.password || '');
  const expected = requiredEnv('STAGING_ACCESS_PASSWORD');
  if (!supplied || !safeEqual(supplied, expected)) {
    return json(401, { error: 'Invalid staging access password' });
  }
  const expiry = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const value = `${expiry}.${sign(expiry)}`;
  return json(200, { ok: true }, {
    'Set-Cookie': `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`,
  });
};
