const { COUNTRY_CURRENCIES, fetchConfiguredOperations } = require('../shared/pawapayCountryConfig');
const cache = new Map();
const CACHE_MS = 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

// Read-only configuration for checkout. This does not initiate a transaction.
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const country = String(event.queryStringParameters?.country || '').trim().toUpperCase();
  const currency = String(event.queryStringParameters?.currency || '').trim().toUpperCase();
  const operation = String(event.queryStringParameters?.operation || 'DEPOSIT').trim().toUpperCase();
  if (!COUNTRY_CURRENCIES[country]?.currencies.includes(currency) || !['DEPOSIT', 'PAYOUT', 'REFUND'].includes(operation)) {
    return json(400, { error: 'Unsupported country, currency or operation' });
  }
  try {
    const key = `${country}:${currency}:${operation}`;
    const current = cache.get(key);
    let providers;
    if (current && current.expiresAt > Date.now()) {
      providers = current.providers;
    } else {
      providers = await fetchConfiguredOperations(country, currency, operation);
      cache.set(key, { providers, expiresAt: Date.now() + CACHE_MS });
    }
    return json(200, { country, currency, operation, providers });
  } catch (error) {
    console.warn('[MobileMoneyOptions] Configuration unavailable');
    return json(503, { error: 'Mobile money options are temporarily unavailable' });
  }
};
