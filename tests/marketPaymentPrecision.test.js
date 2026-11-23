jest.mock('../netlify/shared/pawapayCountryConfig', () => ({ fetchConfiguredOperations: jest.fn() }));
const { fetchConfiguredOperations } = require('../netlify/shared/pawapayCountryConfig');
const { paymentRoute } = require('../netlify/shared/marketPayments');

test('accepts the TWO_PLACES precision reported by the staging MTN Uganda configuration', async () => {
  fetchConfiguredOperations.mockResolvedValue([{ provider: 'MTN_MOMO_UGA', available: true,
    decimalsInAmount: 'TWO_PLACES', minimum: '500', maximum: '5000000', prefix: '256' }]);
  const options = { country: 'UG', currency: 'UGX', provider: 'MTN_MOMO_UGA',
    operation: 'DEPOSIT', amount: '5000000', phoneNumber: '0772123456' };
  await expect(paymentRoute(options)).resolves.toMatchObject({ amount: '5000000.00' });
  await expect(paymentRoute({ ...options, amount: '5000000.01' })).rejects.toThrow();
});
