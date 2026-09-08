const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe('pawaPay v2 integration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.APP_ENV = 'staging';
    process.env.PAWAPAY_API_URL = 'https://api.sandbox.pawapay.io';
    process.env.PAWAPAY_API_KEY = 'sandbox-test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('sends a normalized Uganda deposit to the versioned endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ depositId: '11111111-1111-4111-8111-111111111111', status: 'ACCEPTED' }),
    });
    const { handler } = require('../../../netlify/functions/create-pawapay-deposit');

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ amount: 1000, currency: 'UGX', phoneNumber: '0753456789', provider: 'AIRTEL_OAPI_UGA' }),
    });

    expect(response.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.sandbox.pawapay.io/v2/deposits');
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      amount: '1000',
      currency: 'UGX',
      payer: { type: 'MMO', accountDetails: { phoneNumber: '256753456789', provider: 'AIRTEL_OAPI_UGA' } },
    }));
  });

  it('rejects invalid input before contacting pawaPay', async () => {
    global.fetch = jest.fn();
    const { handler } = require('../../../netlify/functions/create-pawapay-deposit');
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ amount: 1000.5, currency: 'UGX', phoneNumber: '123', provider: 'UNKNOWN' }),
    });
    expect(response.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('parses the v2 payout status wrapper', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'FOUND', data: { payoutId: 'payout-id', status: 'COMPLETED', amount: '850', currency: 'UGX' } }),
    });
    const { handler } = require('../../../netlify/functions/verify-pawapay-payout');
    const response = await handler({ httpMethod: 'GET', queryStringParameters: { payoutId: 'payout-id' } });
    expect(JSON.parse(response.body)).toEqual(expect.objectContaining({ status: 'completed', payoutId: 'payout-id' }));
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.sandbox.pawapay.io/v2/payouts/payout-id');
  });
});
