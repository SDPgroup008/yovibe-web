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

// pawaPay may return display/status text as a locale map (for example
// { en: 'Uganda', fr: 'Ouganda' }). Netlify returns this payload to React,
// so reduce localized values to a scalar before they reach JSX.
function displayText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(', ') || null;
  if (typeof value === 'object') {
    for (const key of ['en', 'en-UG', 'default', 'name', 'value']) {
      if (value[key] !== undefined && value[key] !== null) {
        const text = displayText(value[key]);
        if (text) return text;
      }
    }
  }
  return null;
}

function operationSummary(operationTypes) {
  const entries = Array.isArray(operationTypes)
    ? operationTypes
    : operationTypes && typeof operationTypes === 'object'
      ? Object.entries(operationTypes).map(([type, value]) => ({ [type]: value }))
      : [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const toSummary = (type, value) => {
      const details = value && typeof value === 'object' ? value : entry;
      return {
        type: displayText(type) || 'UNKNOWN',
        status: displayText(details.status),
        minTransactionLimit: displayText(details.minTransactionLimit),
        maxTransactionLimit: displayText(details.maxTransactionLimit),
        decimalsInAmount: displayText(details.decimalsInAmount),
        authType: displayText(details.authType),
        pinPrompt: displayText(details.pinPrompt),
        pinPromptRevivable: details.pinPromptRevivable ?? null,
      };
    };
    if (entry.operationType) return [toSummary(entry.operationType, entry)];
    return Object.entries(entry).map(([type, value]) => toSummary(type, value));
  });
}

function sanitizeConfiguration(payload) {
  return {
    companyName: displayText(payload?.companyName),
    signedRequestsOnly: Boolean(payload?.signatureConfiguration?.signedRequestsOnly),
    signedCallbacks: Boolean(payload?.signatureConfiguration?.signedCallbacks),
    countries: (Array.isArray(payload?.countries) ? payload.countries : []).map((country) => ({
      country: country.country,
      displayName: displayText(country.displayName),
      prefix: displayText(country.prefix),
      providers: (Array.isArray(country.providers) ? country.providers : []).map((provider) => ({
        provider: displayText(provider.provider) || 'UNKNOWN',
        displayName: displayText(provider.displayName),
        currencies: (Array.isArray(provider.currencies) ? provider.currencies : []).map((currency) => ({
          currency: displayText(currency.currency) || 'UNKNOWN',
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
