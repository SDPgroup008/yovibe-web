// netlify/functions/ticket-qr.js
//
// Server-side QR payload signing and verification for ticket QR codes.
//
// The HMAC secret (QR_HMAC_SECRET) lives ONLY in server-side environment
// variables and is never shipped to the client bundle. The client calls this
// function to sign a ticket QR at creation time and to verify a QR at scan
// time, so a forged QR cannot be produced from the web bundle.
//
// Format: {SITE_URL}/t/{ticketId}?s={base64url-hmac-sha256}&ts={issuedAt}
//
// Endpoints:
//   POST { action: "sign",   ticketId } -> { ok, url, signature, issuedAt }
//   POST { action: "verify", qrText   } -> { ok, valid, ticketId?, format?, reason? }
//        format: "signed" (a SITE_URL/t/ URL was detected)
//                "unknown" (not a signed-URL QR — caller rejects it)

const crypto = require('crypto');
const { requiredEnv, getSiteUrl } = require('../shared/runtimeConfig');

function getSecret() {
  const secret = requiredEnv('QR_HMAC_SECRET');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('QR_HMAC_SECRET must be at least 32 bytes');
  return secret;
}

function hmacSign(ticketId, issuedAt, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${ticketId}:${issuedAt}`)
    .digest('base64url'); // base64url, unpadded — matches the legacy client encoding
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sign(ticketId) {
  const issuedAt = Date.now();
  const signature = hmacSign(ticketId, issuedAt, getSecret());
  return {
    url: `${getSiteUrl()}/t/${ticketId}?s=${signature}&ts=${issuedAt}`,
    signature,
    issuedAt,
  };
}

function verify(qrText) {
  let parsed;
  try {
    parsed = new URL(String(qrText));
  } catch {
    return { format: 'unknown', valid: false };
  }

  if (parsed.origin !== new URL(getSiteUrl()).origin) {
    return { format: 'signed', valid: false, reason: 'wrong_ticket_host' };
  }

  const match = parsed.pathname.match(/^\/t\/(.+)$/);
  if (!match) return { format: 'unknown', valid: false };

  const ticketId = match[1];
  const signature = parsed.searchParams.get('s');
  const tsParam = parsed.searchParams.get('ts');

  if (!signature || !tsParam) {
    return { format: 'signed', valid: false, reason: 'missing_signature_parameters' };
  }

  const issuedAt = parseInt(tsParam, 10);
  if (!Number.isFinite(issuedAt)) {
    return { format: 'signed', valid: false, reason: 'invalid_timestamp' };
  }

  const secret = getSecret();
  const expected = hmacSign(ticketId, issuedAt, secret);

  if (safeEqual(expected, signature)) {
    return { format: 'signed', valid: true, ticketId };
  }

  return { format: 'signed', valid: false, reason: 'bad_signature' };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    if (action === 'sign') {
      // Ticket signing is performed inside the trusted fulfillment process.
      // A public signer would let anyone mint a valid QR for a known ticket id.
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Ticket signing is not public' }) };
    }

    if (action === 'verify') {
      const qrText = typeof body.qrText === 'string' ? body.qrText : '';
      if (!qrText || qrText.length > 4096) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid qrText' }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...verify(qrText) }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Unknown action' }) };
  } catch (error) {
    console.error('[TicketQR] Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};

module.exports = { handler: exports.handler, verify, sign };
