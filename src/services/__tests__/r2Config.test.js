const originalEnv = { ...process.env };

describe('R2 configuration compatibility', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('production accepts the legacy public R2 variable names', () => {
    process.env = {
      ...originalEnv,
      APP_ENV: 'production',
      R2_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
      R2_BUCKET_NAME: 'yovibe',
      R2_ACCESS_KEY_ID: 'legacy-access-key',
      R2_SECRET_ACCESS_KEY: 'legacy-secret-key',
      R2_PUBLIC_URL: 'https://pub-example.r2.dev',
      R2_PUBLIC_BUCKET_NAME: '',
      R2_PUBLIC_ACCESS_KEY_ID: '',
      R2_PUBLIC_SECRET_ACCESS_KEY: '',
    };
    const { getR2Config } = require('../../../netlify/shared/r2');
    expect(getR2Config('public')).toMatchObject({
      bucket: 'yovibe',
      accessKeyId: 'legacy-access-key',
      secretAccessKey: 'legacy-secret-key',
    });
  });

  test('staging does not fall back to legacy public R2 variables', () => {
    process.env = {
      ...originalEnv,
      APP_ENV: 'staging',
      R2_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
      R2_BUCKET_NAME: 'yovibe',
      R2_ACCESS_KEY_ID: 'legacy-access-key',
      R2_SECRET_ACCESS_KEY: 'legacy-secret-key',
      R2_PUBLIC_URL: 'https://pub-example.r2.dev',
      R2_PUBLIC_BUCKET_NAME: '',
      R2_PUBLIC_ACCESS_KEY_ID: '',
      R2_PUBLIC_SECRET_ACCESS_KEY: '',
    };
    const { getR2Config } = require('../../../netlify/shared/r2');
    expect(() => getR2Config('public')).toThrow(/R2_PUBLIC_BUCKET_NAME/i);
  });
});
