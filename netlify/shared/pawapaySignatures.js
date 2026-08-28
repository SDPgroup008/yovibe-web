// netlify/shared/pawapaySignatures.js
//
// PawaPay signed-callback verification per RFC 9421 (HTTP Message Signatures).
//
// When "signed callbacks" is enabled in the PawaPay dashboard, every callback
// carries these headers:
//   Content-Digest : sha-512=:base64:           (hash of the raw request body)
//   Signature-Date : <RFC3339><epoch>;expires=<epoch>
//   Signature      : sig-pp=:base64:
//   Signature-Input: sig-pp=("..." "...");alg="...";keyid="...";created=...;expires=...
//
// Verification steps:
//   1. Recompute Content-Digest over the raw body and compare (integrity).
//   2. Parse Signature-Input (covered components, alg, keyid, created, expires).
//   3. Reject if `expires` has passed (replay protection).
//   4. Rebuild the signature base from the ACTUAL request components:
//        "@method": POST
//        "@authority": <host[:port]>
//        "@path": /callback-path
//        "signature-date": <RFC3339 part of the Signature-Date header>
//        "content-digest": <Content-Digest header value>
//        "content-type": <Content-Type header value>
//        "@signature-params": (<covered components>);alg="...";keyid="...";...
//   5. Verify the signature with PawaPay's public key for `keyid`, fetched from
//      GET /v2/public-key/http and cached briefly.
//
// Enablement: set PAWAPAY_SIGNED_CALLBACKS=true. While off, callbacks are
// accepted without signature checks (the handlers still re-query PawaPay's API
// for the authoritative status, so ticket integrity does not depend on this).

const crypto = require('crypto');

const keyCache = new Map(); // keyId -> { key, fetchedAt }
const CACHE_TTL_MS = 10 * 60 * 1000;

function isSigningEnabled() {
  const flag = process.env.PAWAPAY_SIGNED_CALLBACKS;
  return flag === 'true' || flag === '1' || flag === 'yes' || flag === 'on';
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

/**
 * Parse a Signature-Input header:
 *   sig-pp=("@method" "@authority" ...);alg="...";keyid="...";created=...;expires=...
 * Returns { id, coveredRaw, covered[], paramsRaw, params{} } or null.
 */
function parseSignatureInput(value) {
  const eq = value.indexOf('=');
  if (eq < 0) return null;
  const id = value.substring(0, eq).trim();
  const rest = value.substring(eq + 1).trim();
  if (!rest.startsWith('(')) return null;
  const close = rest.indexOf(')');
  if (close < 0) return null;
  const coveredRaw = rest.substring(1, close).trim();
  const paramsRaw = rest.substring(close + 1); // starts with ';'

  const covered = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(coveredRaw)) !== null) covered.push(m[1]);

  const params = {};
  const paramRe = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|(\d+))/g;
  let pm;
  while ((pm = paramRe.exec(paramsRaw)) !== null) {
    params[pm[1]] = pm[2] !== undefined ? pm[2] : pm[3];
  }

  if (!params.alg || !params.keyid) return null;
  return { id, coveredRaw, covered, paramsRaw, params };
}

/**
 * Parse a Signature header:
 *   sig-pp=:base64:
 * Returns { id, signature } (signature is the raw base64 string) or null.
 */
function parseSignatureHeader(value) {
  const eq = value.indexOf('=');
  if (eq < 0) return null;
  const id = value.substring(0, eq).trim();
  let rest = value.substring(eq + 1).trim();
  if (rest.startsWith(':')) rest = rest.slice(1);
  if (rest.endsWith(':')) rest = rest.slice(0, -1);
  if (!rest) return null;
  return { id, signature: rest };
}

/**
 * Parse a Content-Digest header:
 *   sha-512=:base64:      (optionally several comma-separated entries)
 * Returns { algorithm, digest } or null.
 */
function parseContentDigest(value) {
  const entries = String(value || '').split(',');
  for (const entry of entries) {
    const m = /^([A-Za-z0-9_-]+)=:(.+):$/.exec(entry.trim());
    if (m) return { algorithm: m[1], digest: m[2] };
  }
  return null;
}

/**
 * The RFC 3339 prefix of a PawaPay Signature-Date header. PawaPay appends the
 * epoch + ";expires=..." to the timestamp; their signature base uses only the
 * RFC 3339 part (see docs.pawapay.io signatures example).
 */
function extractRfc3339Part(value) {
  const m = /^\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/.exec(String(value || ''));
  return m ? m[1] : String(value || '').trim();
}

/**
 * Fetch PawaPay's public key for a keyid from GET /public-key/http (cached).
 */
async function getPawaPayPublicKey(keyId) {
  const cached = keyCache.get(keyId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.key;

  const apiKey = process.env.PAWAPAY_API_KEY;
  if (!apiKey) throw new Error('PAWAPAY_API_KEY is not configured');
  const base = process.env.PAWAPAY_API_URL || 'https://api.pawapay.io/v2';

  const response = await fetch(`${base}/public-key/http`, {
    headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`PawaPay public-keys fetch failed: ${response.status}`);
  }
  const data = await response.json();
  const item = Array.isArray(data) ? data.find((k) => k.id === keyId) : undefined;
  if (!item || !item.key) {
    throw new Error(`PawaPay public key not found for keyid: ${keyId}`);
  }
  keyCache.set(keyId, { key: item.key, fetchedAt: Date.now() });
  return item.key;
}

/**
 * Build the RFC 9421 signature base from the actual request components.
 * `covered` are the components listed in Signature-Input (in order);
 * `paramsRaw` is the exact `;alg=...;keyid=...` suffix from the header.
 */
function buildSignatureBase({ method, authority, path, query, covered, paramsRaw, headers, signatureDateBase }) {
  const lines = [];
  for (const component of covered) {
    const name = component.toLowerCase();
    let value;
    if (name === '@method') value = method;
    else if (name === '@authority') value = authority;
    else if (name === '@path') value = path;
    else if (name === '@query') value = query || '';
    else if (name === 'signature-date') value = signatureDateBase;
    else value = getHeader(headers, name) || '';
    lines.push(`"${name}": ${value}`);
  }
  // @signature-params is always the last line, using the header value verbatim
  // (covered components + params), e.g. ("@method" ...);alg="...";keyid="...";created=...
  const coveredString = covered.map((c) => `"${c}"`).join(' ');
  lines.push(`"@signature-params": (${coveredString})${paramsRaw}`);
  return lines.join('\n');
}

/**
 * Verify a signature buffer against the public key using the RFC 9421 algorithm
 * name from Signature-Input.
 */
function verifyWithAlgorithm(signatureBase, signatureBuffer, publicKeyPem, alg) {
  const data = Buffer.from(signatureBase, 'utf8');
  switch (alg) {
    case 'rsa-pss-sha512':
      return crypto.verify(
        'sha512',
        data,
        { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST },
        signatureBuffer
      );
    case 'rsa-v1_5-sha256':
      return crypto.verify('sha256', data, publicKeyPem, signatureBuffer);
    case 'ecdsa-p256-sha256':
      return crypto.verify('sha256', data, publicKeyPem, signatureBuffer);
    case 'ecdsa-p384-sha384':
      return crypto.verify('sha384', data, publicKeyPem, signatureBuffer);
    default:
      throw new Error(`Unsupported signature algorithm: ${alg}`);
  }
}

/**
 * Verify a PawaPay signed callback.
 *
 * @param {object} event The raw Netlify function event (headers, body,
 *                       httpMethod, path, rawQuery).
 * @returns {Promise<{ok:boolean, verified:boolean, reason?:string, keyId?:string}>}
 *
 * - When signing is disabled: { ok:true, verified:false, reason:'signing_disabled' }.
 * - When enabled and headers are missing/malformed or verification fails:
 *   { ok:false, verified:false, error } — callers must reject the callback (401).
 */
async function verifyCallbackSignature(event) {
  if (!isSigningEnabled()) {
    return { ok: true, verified: false, reason: 'signing_disabled' };
  }

  const headers = event.headers || {};
  const signatureInput = getHeader(headers, 'signature-input');
  const signatureHeader = getHeader(headers, 'signature');
  const contentDigest = getHeader(headers, 'content-digest');
  const signatureDate = getHeader(headers, 'signature-date');
  const contentType = getHeader(headers, 'content-type');

  if (!signatureInput || !signatureHeader || !contentDigest || !signatureDate) {
    return {
      ok: false,
      verified: false,
      error: 'Signed callbacks enabled but the callback is missing signature headers',
    };
  }

  // 1. Body integrity via Content-Digest.
  const digest = parseContentDigest(contentDigest);
  if (!digest) return { ok: false, verified: false, error: 'Invalid Content-Digest header' };
  const hashAlg = digest.algorithm.toLowerCase().replace('-', '');
  if (hashAlg !== 'sha256' && hashAlg !== 'sha512') {
    return { ok: false, verified: false, error: `Unsupported digest algorithm: ${digest.algorithm}` };
  }
  const bodyBytes = Buffer.from(event.body || '', 'utf8');
  const expectedDigest = crypto.createHash(hashAlg).update(bodyBytes).digest('base64');
  if (expectedDigest !== digest.digest) {
    return { ok: false, verified: false, error: 'Content-Digest mismatch — callback body tampered' };
  }

  // 2. Parse Signature-Input and Signature.
  const input = parseSignatureInput(signatureInput);
  const sig = parseSignatureHeader(signatureHeader);
  if (!input || !sig || input.id !== sig.id) {
    return { ok: false, verified: false, error: 'Invalid Signature/Signature-Input headers' };
  }

  // 3. Replay protection.
  if (input.params.expires) {
    const expires = parseInt(input.params.expires, 10);
    if (!isNaN(expires) && Math.floor(Date.now() / 1000) > expires) {
      return { ok: false, verified: false, error: 'Signature expired' };
    }
  }

  // 4. Authority (Host header as seen by us) and request-target.
  const authority = getHeader(headers, 'host') || event.requestContext?.domainName || '';
  if (!authority) {
    return { ok: false, verified: false, error: 'Missing Host header for signature authority' };
  }
  const path = event.path || '';
  const query = event.rawQuery || '';

  // 5. Rebuild the signature base from actual components.
  const signatureBase = buildSignatureBase({
    method: (event.httpMethod || 'POST').toUpperCase(),
    authority,
    path,
    query,
    covered: input.covered,
    paramsRaw: input.paramsRaw,
    headers,
    signatureDateBase: extractRfc3339Part(signatureDate),
  });

  // 6. Fetch PawaPay's public key and verify.
  const publicKey = await getPawaPayPublicKey(input.params.keyid);
  const signatureBuffer = Buffer.from(sig.signature, 'base64');
  let verified = false;
  try {
    verified = verifyWithAlgorithm(signatureBase, signatureBuffer, publicKey, input.params.alg);
  } catch (e) {
    return { ok: false, verified: false, error: `Signature verification error: ${e.message}` };
  }
  if (!verified) {
    return { ok: false, verified: false, error: 'Signature verification failed' };
  }

  return { ok: true, verified: true, keyId: input.params.keyid, alg: input.params.alg };
}

module.exports = {
  isSigningEnabled,
  getHeader,
  parseSignatureInput,
  parseSignatureHeader,
  parseContentDigest,
  extractRfc3339Part,
  buildSignatureBase,
  verifyWithAlgorithm,
  getPawaPayPublicKey,
  verifyCallbackSignature,
  clearPawaPayKeyCache: () => keyCache.clear(),
};
