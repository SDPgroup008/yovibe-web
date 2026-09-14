const originalEnv = { ...process.env };
const originalFetch = global.fetch;

jest.mock('uuid', () => ({ v4: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));

describe('staging server-to-server function authentication', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.APP_ENV = 'staging';
    process.env.SITE_URL = 'https://yovibe-stagging.netlify.app';
    process.env.FULFILLMENT_WORKER_SECRET = 'test-only-fulfillment-secret-with-at-least-32-bytes';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  test('authenticates internal payment verification calls through the staging gate', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'completed' }),
    });
    const { verifyPawaPayDepositViaFunction } = require('../../../netlify/shared/ticketFulfillment');

    await expect(verifyPawaPayDepositViaFunction('deposit-id')).resolves.toEqual(
      expect.objectContaining({ status: 'completed' }),
    );
    expect(global.fetch.mock.calls[0][1].headers).toEqual(expect.objectContaining({
      'X-Fulfillment-Worker-Secret': process.env.FULFILLMENT_WORKER_SECRET,
    }));
  });

  test('authenticates ticket email delivery through the staging gate', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    const { sendTicketEmail } = require('../../../netlify/shared/ticketFulfillment');

    await expect(sendTicketEmail({ buyerEmail: 'guest@example.test' })).resolves.toEqual({ success: true });
    expect(global.fetch.mock.calls[0][1].headers).toEqual(expect.objectContaining({
      'Content-Type': 'application/json',
      'X-Fulfillment-Worker-Secret': process.env.FULFILLMENT_WORKER_SECRET,
    }));
  });
});
