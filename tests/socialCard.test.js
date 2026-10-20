const socialCard = require('../netlify/functions/social-card');

describe('social-card function', () => {
  test('renders an approved card as a cacheable PNG', async () => {
    const response = await socialCard.handler({ httpMethod: 'GET', queryStringParameters: { kind: 'events' } });
    expect(response.statusCode).toBe(200);
    expect(response.isBase64Encoded).toBe(true);
    expect(response.headers['Content-Type']).toBe('image/png');
    expect(response.headers['Cache-Control']).toContain('s-maxage=86400');
    expect(Buffer.from(response.body, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  test('supports HEAD and rejects unknown card types', async () => {
    const head = await socialCard.handler({ httpMethod: 'HEAD', queryStringParameters: { kind: 'about' } });
    const unknown = await socialCard.handler({ httpMethod: 'GET', queryStringParameters: { kind: 'profile' } });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(unknown.statusCode).toBe(404);
  });

  test('keeps the fallback contract explicit for renderer failures', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../netlify/functions/social-card.js'), 'utf8');
    expect(source).toContain("Location: 'https://yovibe.net/assets/og-image.png'");
    expect(source).toContain("require('@resvg/resvg-js')");
  });
});
