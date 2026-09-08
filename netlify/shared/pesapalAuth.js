// ─── Shared PesaPal Auth Token (cached, with retry and clear logging) ───────
// Caches the bearer token for its 5-minute lifetime (minus 30s buffer).
// All PesaPal functions should call getPesapalToken() instead of acquiring
// their own token, so concurrent invocations reuse a single auth call.

let cachedToken = null;
let tokenExpiresAt = 0;
const { requiredEnv, assertPesapalUrl } = require('./runtimeConfig');

/**
 * Acquire (or return cached) PesaPal OAuth token.
 *
 * Console output when successfully authenticated with LIVE credentials:
 *   [PesaPalAuth] ✅ Authenticated successfully
 *   [PesaPalAuth]    Token expires at: 2026-07-27T15:28:00.000Z
 *   [PesaPalAuth]    Environment: configured explicitly
 *
 * Console output when sandbox credentials are detected:
 *   [PesaPalAuth] ⚠️ Using SANDBOX environment (cybqa.pesapal.com)
 */
async function getPesapalToken() {
  // Return cached token if still valid (30s buffer before actual expiry)
  if (cachedToken && Date.now() < tokenExpiresAt) {
    /* console.log('[PesaPalAuth] ✅ Using cached token (expires at', new Date(tokenExpiresAt + 30000).toISOString(), ')'); */
    return cachedToken;
  }

  const consumerKey = requiredEnv('PESAPAL_CONSUMER_KEY');
  const consumerSecret = requiredEnv('PESAPAL_CONSUMER_SECRET');
  const apiUrl = assertPesapalUrl(requiredEnv('PESAPAL_API_URL'));

  // Detect environment for logging
  const isSandbox = apiUrl.includes('cybqa');
  const envLabel = isSandbox ? 'SANDBOX' : 'LIVE';

  /* console.log('[PesaPalAuth] 🔑 Acquiring new token...'); */
  /* console.log('[PesaPalAuth]    API URL:', apiUrl); */
  /* console.log('[PesaPalAuth]    Environment:', envLabel); */

  const response = await fetch(`${apiUrl}/Auth/RequestToken`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    }),
  });

  const bodyText = await response.text();
  /* console.log('[PesaPalAuth]    HTTP status:', response.status); */

  if (!response.ok) {
    throw new Error(`PesaPal authentication failed: HTTP ${response.status} — ${bodyText.substring(0, 200)}`);
  }

  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`PesaPal authentication failed: invalid JSON response — ${bodyText.substring(0, 200)}`);
  }

  if (!json.token) {
    const apiMsg = json.error?.message || json.message || 'Unknown error';
    throw new Error(`PesaPal authentication failed: ${apiMsg}`);
  }

  // Cache token with 30s safety margin
  const expiresMs = json.expiryDate ? new Date(json.expiryDate).getTime() - 30000 : Date.now() + 270000;
  cachedToken = json.token;
  tokenExpiresAt = expiresMs;

  /* console.log(`[PesaPalAuth] ✅ Authenticated successfully`); */
  /* console.log(`[PesaPalAuth]    Token expires at:`, json.expiryDate || new Date(expiresMs + 30000).toISOString()); */
  /* console.log(`[PesaPalAuth]    Environment: ${envLabel} (${isSandbox ? 'cybqa' : 'pay'}.pesapal.com)`); */

  return json.token;
}

/**
 * Invalidate the cached token. Call after receiving a 401 to force re-auth.
 */
function invalidatePesapalToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
  /* console.log('[PesaPalAuth] 🔄 Token invalidated — next call will re-authenticate'); */
}

module.exports = { getPesapalToken, invalidatePesapalToken };
