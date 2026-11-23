// Return only the approximate country; never expose or persist the visitor's IP.
export default async (_request: Request, context: { geo?: { country?: { code?: string } } }) => {
  const code = String(context.geo?.country?.code || '').trim().toUpperCase();
  return new Response(JSON.stringify({ countryCode: /^[A-Z]{2}$/.test(code) ? code : null }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Vary': 'Cookie',
    },
  });
};
