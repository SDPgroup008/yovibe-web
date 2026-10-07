const { requiredEnv, assertPawaPayUrl } = require('../shared/runtimeConfig');
const { requireUser } = require('../shared/supabaseAdmin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function isAdmin(profile) {
  return String(profile?.user_type || '').toLowerCase() === 'admin';
}

function operationSummary(operationTypes) {
  const entries = Array.isArray(operationTypes) ? operationTypes : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const toSummary = (type, value) => {
      const details = value && typeof value === 'object' ? value : entry;
      return {
        type,
        status: details.status || null,
        minTransactionLimit: details.minTransactionLimit ?? null,
        maxTransactionLimit: details.maxTransactionLimit ?? null,
        decimalsInAmount: details.decimalsInAmount ?? null,
        authType: details.authType ?? null,
        pinPrompt: details.pinPrompt ?? null,
        pinPromptRevivable: details.pinPromptRevivable ?? null,
      };
    };
    if (entry.operationType) return [toSummary(entry.operationType, entry)];
    return Object.entries(entry).map(([type, value]) => toSummary(type, value));
  });
}

function sanitizeConfiguration(payload) {
  return {
    companyName: payload?.companyName || null,
    signedRequestsOnly: Boolean(payload?.signatureConfiguration?.signedRequestsOnly),
    signedCallbacks: Boolean(payload?.signatureConfiguration?.signedCallbacks),
    countries: (Array.isArray(payload?.countries) ? payload.countries : []).map((country) => ({
      country: country.country,
      displayName: country.displayName || null,
      prefix: country.prefix || null,
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
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const { profile } = await requireUser(event);
    if (!isAdmin(profile)) return json(403, { error: 'Admin access required' });

    const baseUrl = assertPawaPayUrl(requiredEnv('PAWAPAY_API_URL'));
    const apiKey = requiredEnv('PAWAPAY_API_KEY');
    const query = event.queryStringParameters || {};
    const country = query.country ? String(query.country).toUpperCase() : '';
    const operationType = query.operationType ? String(query.operationType).toUpperCase() : '';
    if (country && !/^[A-Z]{3}$/.test(country)) return json(400, { error: 'country must be an ISO alpha-3 code' });
    if (operationType && !['DEPOSIT', 'PAYOUT', 'REMITTANCE', 'PUSH_DEPOSIT', 'REFUND', 'NAME_LOOKUP'].includes(operationType)) {
      return json(400, { error: 'Unsupported operation type' });
    }

    const url = new URL(`${baseUrl}/active-conf`);
    if (country) url.searchParams.set('country', country);
    if (operationType) url.searchParams.set('operationType', operationType);
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
