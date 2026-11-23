// pawaPay Active Configuration: https://docs.pawapay.io/v2/api-reference/toolkit/active-configuration
// These are the countries/currencies approved for discovery; this list does not
// imply that a provider or operation is enabled on the merchant account.
const { requiredEnv, assertPawaPayUrl } = require('./runtimeConfig');

const { COUNTRY_CURRENCIES } = require('../../shared/paymentMarkets');

function extractOperation(entry, type) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (String(entry.operationType || '').toUpperCase() === type) return entry;
  const nested = entry[type];
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : null;
}

/**
 * Return only merchant-configured operations. CLOSED/DELAYED are included so
 * callers can display their status, but are not marked available for payment.
 * Amount limits remain decimal strings; never coerce money to floating point.
 */
function configuredOperations(payload, countryCode, currencyCode, operationType) {
  const country = COUNTRY_CURRENCIES[String(countryCode || '').toUpperCase()];
  const currency = String(currencyCode || '').toUpperCase();
  const type = String(operationType || '').toUpperCase();
  if (!country || !country.currencies.includes(currency) || !['DEPOSIT', 'PAYOUT', 'REFUND'].includes(type)) return [];
  if (!Array.isArray(payload?.countries)) throw new Error('Invalid pawaPay active configuration');

  const rows = [];
  for (const item of payload.countries) {
    if (String(item?.country || '').toUpperCase() !== country.alpha3) continue;
    for (const provider of Array.isArray(item.providers) ? item.providers : []) {
      const providerCode = typeof provider?.provider === 'string' ? provider.provider : '';
      if (!country.providers.includes(providerCode)) continue;
      for (const denomination of Array.isArray(provider.currencies) ? provider.currencies : []) {
        if (String(denomination?.currency || '').toUpperCase() !== currency) continue;
        // pawaPay documents both an array of operation records and a keyed
        // object such as { DEPOSIT: {...} } in its deposit guide.
        const operationTypes = denomination.operationTypes;
        const entries = Array.isArray(operationTypes)
          ? operationTypes
          : operationTypes && typeof operationTypes === 'object' ? [operationTypes] : [];
        for (const operation of entries) {
          const details = extractOperation(operation, type);
          if (!details) continue;
          const status = String(details.status || '').toUpperCase();
          rows.push({
            country: country.alpha3,
            countryCode: String(countryCode).toUpperCase(),
            currency,
            provider: providerCode,
            displayName: typeof provider.displayName === 'string' ? provider.displayName : providerCode,
            prefix: typeof item.prefix === 'string' ? item.prefix : null,
            operation: type,
            status: status || null,
            available: status === 'OPERATIONAL',
            minimum: (details.minTransactionLimit ?? details.minAmount) == null ? null : String(details.minTransactionLimit ?? details.minAmount),
            maximum: (details.maxTransactionLimit ?? details.maxAmount) == null ? null : String(details.maxTransactionLimit ?? details.maxAmount),
            decimalsInAmount: details.decimalsInAmount || null,
            authType: details.authType || null,
            instructions: details.pinPromptInstructions?.channels?.flatMap(channel => (channel.instructions?.en || []).map(item => item.text).filter(text => typeof text === 'string')) || [],
          });
        }
      }
    }
  }
  return rows;
}

/** Read the current merchant configuration using server-side credentials. */
async function fetchConfiguredOperations(countryCode, currencyCode, operationType, fetchImpl = globalThis.fetch) {
  const code = String(countryCode || '').trim().toUpperCase();
  const currency = String(currencyCode || '').trim().toUpperCase();
  const type = String(operationType || '').trim().toUpperCase();
  const country = COUNTRY_CURRENCIES[code];
  if (!country || !country.currencies.includes(currency) || !['DEPOSIT', 'PAYOUT', 'REFUND'].includes(type)) {
    throw Object.assign(new Error('Unsupported country, currency or operation'), { statusCode: 400 });
  }

  const baseUrl = assertPawaPayUrl(requiredEnv('PAWAPAY_API_URL'));
  const apiKey = requiredEnv('PAWAPAY_API_KEY');
  const url = new URL(`${baseUrl}/active-conf`);
  url.searchParams.set('country', country.alpha3);
  url.searchParams.set('operationType', type);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Unable to retrieve pawaPay active configuration');
    const payload = await response.json();
    return configuredOperations(payload, code, currency, type);
  } catch {
    // Do not expose the provider response, credentials, or fetch internals.
    throw Object.assign(new Error('Unable to retrieve pawaPay active configuration'), { statusCode: 503 });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { COUNTRY_CURRENCIES, configuredOperations, fetchConfiguredOperations };
