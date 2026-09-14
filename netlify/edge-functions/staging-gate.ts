const COOKIE_NAME = 'yovibe_staging';
const EXEMPT_PATHS = new Set([
  '/staging-access.html',
  '/favicon.png',
  '/.netlify/functions/staging-access',
  '/.netlify/functions/health',
  '/.netlify/functions/pesapal-ipn',
  '/.netlify/functions/pesapal-refund-callback',
  '/.netlify/functions/pesapal-payout-callback',
  '/.netlify/functions/pawapay-deposit-callback',
  '/.netlify/functions/pawapay-payout-callback',
  '/.netlify/functions/pawapay-refund-callback',
  '/.netlify/functions/pawapay-checkout-callback',
  '/.netlify/functions/process-ticket-fulfillment-background',
  '/.netlify/functions/retry-installment-fulfillment',
]);

function readCookie(request: Request): string | null {
  const cookie = request.headers.get('cookie') || '';
  for (const pair of cookie.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

function base64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function validCookie(value: string | null): Promise<boolean> {
  if (!value) return false;
  const [expiryText, signature] = value.split('.');
  const expiry = Number(expiryText);
  if (!Number.isInteger(expiry) || expiry <= Math.floor(Date.now() / 1000) || !signature) return false;
  const secret = Deno.env.get('STAGING_ACCESS_SECRET');
  if (!secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = base64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expiryText)));
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function validInternalFunctionRequest(request: Request): boolean {
  const expected = Deno.env.get('FULFILLMENT_WORKER_SECRET') || '';
  const supplied = request.headers.get('x-fulfillment-worker-secret') || '';
  return expected.length >= 32 && supplied.length > 0 && timingSafeTextEqual(supplied, expected);
}

export default async (request: Request, context: any) => {
  if ((Deno.env.get('APP_ENV') || '').toLowerCase() !== 'staging') return context.next();
  const url = new URL(request.url);
  if (EXEMPT_PATHS.has(url.pathname)) return context.next();
  if (url.pathname.startsWith('/.netlify/functions/') && validInternalFunctionRequest(request)) {
    return context.next();
  }
  if (await validCookie(readCookie(request))) return context.next();

  if (url.pathname.startsWith('/.netlify/functions/')) {
    return new Response(JSON.stringify({ error: 'Staging access required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const login = new URL('/staging-access.html', url.origin);
  login.searchParams.set('next', `${url.pathname}${url.search}`);
  return Response.redirect(login, 302);
};
