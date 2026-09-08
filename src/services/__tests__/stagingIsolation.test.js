const originalEnv = { ...process.env };

describe('staging fail-closed isolation', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, APP_ENV: 'staging' };
    jest.resetModules();
  });

  afterAll(() => { process.env = originalEnv; });

  test('rejects known production service endpoints', () => {
    const { assertSupabaseUrl, assertSiteUrl, assertPesapalUrl, assertPawaPayUrl } = require('../../../netlify/shared/runtimeConfig');
    expect(() => assertSupabaseUrl('https://uqukizjohackrcwrtefk.supabase.co')).toThrow(/production Supabase/i);
    expect(() => assertSiteUrl('https://yovibe.net')).toThrow(/production site/i);
    expect(() => assertPesapalUrl('https://pay.pesapal.com/v3/api')).toThrow(/cybqa/i);
    expect(() => assertPawaPayUrl('https://api.pawapay.net')).toThrow(/sandbox/i);
  });

  test('accepts explicit sandbox and staging endpoints', () => {
    const { assertSupabaseUrl, assertSiteUrl, assertPesapalUrl, assertPawaPayUrl } = require('../../../netlify/shared/runtimeConfig');
    expect(assertSupabaseUrl('https://staging-ref.supabase.co')).toContain('staging-ref');
    expect(assertSiteUrl('https://example-staging.netlify.app')).toContain('netlify.app');
    expect(assertPesapalUrl('https://cybqa.pesapal.com/pesapalv3/api')).toContain('cybqa');
    expect(assertPawaPayUrl('https://api.sandbox.pawapay.io')).toContain('sandbox');
  });

  test('stores payout OTPs as keyed hashes', () => {
    process.env.PAYOUT_OTP_SECRET = 'test-only-payout-secret-with-at-least-32-bytes';
    const { hashOtp, otpMatches } = require('../../../netlify/shared/payoutOtp');
    const stored = hashOtp('user-1', '123456');
    expect(stored).not.toContain('123456');
    expect(otpMatches('user-1', '123456', stored)).toBe(true);
    expect(otpMatches('user-2', '123456', stored)).toBe(false);
  });
});
