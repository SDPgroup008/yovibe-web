const { appEnvironment, requiredEnv, assertPawaPayUrl } = require('../shared/runtimeConfig');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function operationSummary(operationTypes) {
  const entries = Array.isArray(operationTypes) ? operationTypes : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    if (entry.operationType) {
      return [{ type: entry.operationType, status: entry.status || null }];
    }
    return Object.entries(entry).map(([type, value]) => ({
      type,
      status: value && typeof value === 'object' ? value.status || null : null,
    }));
  });
}

function sanitizeConfiguration(payload) {
  return {
    signedRequestsOnly: Boolean(payload?.signatureConfiguration?.signedRequestsOnly),
    signedCallbacks: Boolean(payload?.signatureConfiguration?.signedCallbacks),
    countries: (Array.isArray(payload?.countries) ? payload.countries : []).map((country) => ({
      country: country.country,
      providers: (Array.isArray(country.providers) ? country.providers : []).map((provider) => ({
        provider: provider.provider,
        displayName: provider.displayName,
        currencies: (Array.isArray(provider.currencies) ? provider.currencies : []).map((currency) => ({
          currency: currency.currency,
          operations: operationSummary(currency.operationTypes),
        })),
      })),
    })),
  };
}

exports.handler = async (event) => {
  if (appEnvironment() !== 'staging') return json(404, { error: 'Not found' });
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const baseUrl = assertPawaPayUrl(requiredEnv('PAWAPAY_API_URL'));
    const apiKey = requiredEnv('PAWAPAY_API_KEY');
    const country = String(event.queryStringParameters?.country || 'UGA').toUpperCase();
    const operationType = String(event.queryStringParameters?.operationType || 'DEPOSIT').toUpperCase();
    if (!/^[A-Z]{3}$/.test(country)) return json(400, { error: 'country must be an ISO alpha-3 code' });
    if (!['DEPOSIT', 'PAYOUT', 'REFUND'].includes(operationType)) return json(400, { error: 'Unsupported operation type' });

    const url = new URL(`${baseUrl}/active-conf`);
    url.searchParams.set('country', country);
    url.searchParams.set('operationType', operationType);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(response.status, {
        error: payload?.failureReason?.failureMessage || 'Unable to read pawaPay active configuration',
        failureCode: payload?.failureReason?.failureCode || null,
      });
    }
    return json(200, sanitizeConfiguration(payload));
  } catch (error) {
    console.error('[PawaPayActiveConfig] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to read pawaPay active configuration' });
  }
};

module.exports = { handler: exports.handler, sanitizeConfiguration, operationSummary };
