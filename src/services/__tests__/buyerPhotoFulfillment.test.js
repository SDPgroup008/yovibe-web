const originalEnv = { ...process.env };

jest.mock('uuid', () => ({ v4: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('../../../netlify/shared/r2', () => ({
  uploadObject: jest.fn(async (_kind, input) => `r2-private://${input.key}`),
  privateKeyFromReference: jest.fn(),
  presignR2: jest.fn(),
}));

describe('buyer security-photo fulfillment', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ])('uploads a %s data URL into private R2', async (mime, extension) => {
    const { uploadImageDataUrl } = require('../../../netlify/shared/ticketFulfillment');
    const result = await uploadImageDataUrl(
      `data:${mime};base64,${Buffer.from('synthetic-photo').toString('base64')}`,
      'buyer-photos',
      'purchase_test',
    );

    expect(result).toBe(`r2-private://buyer-photos/purchase_test.${extension}`);
    const { uploadObject } = require('../../../netlify/shared/r2');
    expect(uploadObject).toHaveBeenCalledWith('private', expect.objectContaining({
      key: `buyer-photos/purchase_test.${extension}`,
      contentType: mime,
    }));
  });

  test('rejects an oversized security photo', async () => {
    const { uploadImageDataUrl } = require('../../../netlify/shared/ticketFulfillment');
    const tooLarge = Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64');

    await expect(uploadImageDataUrl(
      `data:image/jpeg;base64,${tooLarge}`,
      'buyer-photos',
      'purchase_large',
    )).rejects.toThrow('between 1 byte and 4 MB');
  });
});
