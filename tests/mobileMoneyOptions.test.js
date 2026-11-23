jest.mock('../netlify/shared/pawapayCountryConfig', () => ({
  COUNTRY_CURRENCIES: { UG: { currencies: ['UGX'] } },
  fetchConfiguredOperations: jest.fn(),
}));

const { fetchConfiguredOperations } = require('../netlify/shared/pawapayCountryConfig');
const { handler } = require('../netlify/functions/mobile-money-options');

beforeEach(() => jest.resetAllMocks());

test('only returns server-verified provider configuration for the requested operation', async () => {
  fetchConfiguredOperations.mockResolvedValue([{ provider: 'MTN_MOMO_UGA', available: true }]);
  const response = await handler({ httpMethod: 'GET', queryStringParameters: { country: 'ug', currency: 'ugx', operation: 'PAYOUT' } });
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ country: 'UG', currency: 'UGX', operation: 'PAYOUT', providers: [{ provider: 'MTN_MOMO_UGA', available: true }] });
  expect(fetchConfiguredOperations).toHaveBeenCalledWith('UG', 'UGX', 'PAYOUT');
  expect(response.headers['Cache-Control']).toBe('no-store');
});

test('invalid requests and configuration failures never expose credentials', async () => {
  expect((await handler({ httpMethod: 'POST' })).statusCode).toBe(405);
  expect((await handler({ httpMethod: 'GET', queryStringParameters: { country: 'UG', currency: 'USD' } })).statusCode).toBe(400);
  expect(fetchConfiguredOperations).not.toHaveBeenCalled();
  fetchConfiguredOperations.mockRejectedValue(new Error('secret-token'));
  const response = await handler({ httpMethod: 'GET', queryStringParameters: { country: 'UG', currency: 'UGX', operation: 'REFUND' } });
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toContain('secret-token');
});
