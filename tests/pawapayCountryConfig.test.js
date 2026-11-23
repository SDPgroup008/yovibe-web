const { configuredOperations, fetchConfiguredOperations } = require('../netlify/shared/pawapayCountryConfig');

const config = { countries: [{ country: 'COD', prefix: '243', providers: [{
  provider: 'AIRTEL_COD', displayName: 'Test', currencies: [
    { currency: 'USD', operationTypes: [
      { DEPOSIT: { status: 'OPERATIONAL', minTransactionLimit: '0.01', maxTransactionLimit: '100.25', decimalsInAmount: 'TWO' } },
      { operationType: 'PAYOUT', status: 'CLOSED', minTransactionLimit: '1', maxTransactionLimit: '20' },
    ] },
    { currency: 'CDF', operationTypes: [{ operationType: 'DEPOSIT', status: 'DELAYED' }] },
  ],
}] }] };

test('selects country, currency and operation independently with exact limits', () => {
  expect(configuredOperations(config, 'CD', 'USD', 'DEPOSIT')).toEqual([expect.objectContaining({
    provider: 'AIRTEL_COD', country: 'COD', currency: 'USD', available: true,
    minimum: '0.01', maximum: '100.25',
  })]);
  expect(configuredOperations(config, 'CD', 'USD', 'PAYOUT')[0].available).toBe(false);
  expect(configuredOperations(config, 'CD', 'CDF', 'DEPOSIT')[0].available).toBe(false);
});

test('does not infer unavailable countries, currencies, providers or operations', () => {
  expect(configuredOperations(config, 'UG', 'UGX', 'DEPOSIT')).toEqual([]);
  expect(configuredOperations(config, 'CD', 'UGX', 'DEPOSIT')).toEqual([]);
  expect(configuredOperations(config, 'CD', 'USD', 'REFUND')).toEqual([]);
  const unknown = { countries: [{ country: 'COD', providers: [{ provider: 'UNLISTED_COD', currencies: [{ currency: 'USD', operationTypes: [{ operationType: 'DEPOSIT', status: 'OPERATIONAL' }] }] }] }] };
  expect(configuredOperations(unknown, 'CD', 'USD', 'DEPOSIT')).toEqual([]);
  expect(() => configuredOperations({}, 'CD', 'USD', 'DEPOSIT')).toThrow('Invalid pawaPay active configuration');
});

test('supports keyed operationTypes and minAmount/maxAmount from the deposit guide', () => {
  const guideShape = { countries: [{ country: 'BEN', providers: [{ provider: 'MOOV_BEN', currencies: [{
    currency: 'XOF', operationTypes: { DEPOSIT: { status: 'OPERATIONAL', minAmount: '100', maxAmount: '2000000', decimalsInAmount: 'NONE' } },
  }] }] }] };
  expect(configuredOperations(guideShape, 'BJ', 'XOF', 'DEPOSIT')).toEqual([expect.objectContaining({
    provider: 'MOOV_BEN', minimum: '100', maximum: '2000000', available: true,
  })]);
});

test('reads only the selected country and operation using server credentials', async () => {
  const old = { ...process.env };
  process.env.APP_ENV = 'staging';
  process.env.PAWAPAY_API_URL = 'https://api.sandbox.pawapay.io/v2';
  process.env.PAWAPAY_API_KEY = 'test-api-key';
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => config });
  try {
    const result = await fetchConfiguredOperations('CD', 'USD', 'DEPOSIT', fetchMock);
    expect(result[0].provider).toBe('AIRTEL_COD');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sandbox.pawapay.io/v2/active-conf?country=COD&operationType=DEPOSIT');
    expect(options.headers.Authorization).toBe('Bearer test-api-key');
    expect(JSON.stringify(result)).not.toContain('test-api-key');
  } finally {
    process.env = old;
  }
});

test('fails closed on a provider error and rejects unsupported selections before fetching', async () => {
  const old = { ...process.env };
  process.env.APP_ENV = 'staging';
  process.env.PAWAPAY_API_URL = 'https://api.sandbox.pawapay.io/v2';
  process.env.PAWAPAY_API_KEY = 'test-api-key';
  const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401 });
  try {
    await expect(fetchConfiguredOperations('TZ', 'TZS', 'DEPOSIT', fetchMock)).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(fetchConfiguredOperations('UG', 'UGX', 'DEPOSIT', fetchMock)).rejects.toMatchObject({ statusCode: 503 });
  } finally {
    process.env = old;
  }
});
