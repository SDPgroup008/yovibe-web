process.env.QR_HMAC_SECRET = 'test-only-qr-secret-with-sufficient-entropy';

const { sign, verify, handler } = require('../../../netlify/functions/ticket-qr');

describe('ticket QR security boundary', () => {
  test('accepts a server-signed QR and rejects tampering', () => {
    const signed = sign('ticket-123');
    expect(verify(signed.url)).toMatchObject({ valid: true, ticketId: 'ticket-123' });
    expect(verify(signed.url.replace('ticket-123', 'ticket-999'))).toMatchObject({ valid: false });
  });

  test('does not expose ticket signing through the public function', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ action: 'sign', ticketId: 'ticket-123' }),
    });
    expect(response.statusCode).toBe(403);
  });
});
