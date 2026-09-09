const STAGING_ORIGIN = 'https://yovibe-stagging.netlify.app';
const PRIVATE_R2_ORIGIN = 'https://fa2758d1964bd534d143d8716fd37928.r2.cloudflarestorage.com';

const probes = [
  { name: 'health-contract', method: 'GET', path: '/.netlify/functions/health', accept: (r, body) => [200, 503].includes(r.status) && body.includes('"db"') },
  { name: 'staging-edge-gate', method: 'GET', path: '/events', accept: (r) => r.status === 302 && (r.headers.get('location') || '').includes('/staging-access.html') },
  { name: 'generic-r2-upload-denied', method: 'POST', path: '/.netlify/functions/uploadR2', body: '{}', accept: (r) => r.status === 401 },
  { name: 'buyer-photo-presign-denied', method: 'POST', path: '/.netlify/functions/presign-buyer-photo', body: '{}', accept: (r) => r.status === 401 },
  { name: 'private-ticket-asset-denied', method: 'GET', path: '/.netlify/functions/ticket-private-asset', accept: (r) => r.status === 401 },
  { name: 'admin-payout-denied', method: 'POST', path: '/.netlify/functions/admin-payout-action', body: '{}', accept: (r) => r.status === 401 },
  { name: 'unsigned-deposit-callback-denied', method: 'POST', path: '/.netlify/functions/pawapay-deposit-callback', body: '{}', accept: (r) => r.status === 401 },
  { name: 'unsigned-payout-callback-denied', method: 'POST', path: '/.netlify/functions/pawapay-payout-callback', body: '{}', accept: (r) => r.status === 401 },
  { name: 'unsigned-refund-callback-denied', method: 'POST', path: '/.netlify/functions/pawapay-refund-callback', body: '{}', accept: (r) => r.status === 401 },
  { name: 'unsigned-checkout-callback-denied', method: 'POST', path: '/.netlify/functions/pawapay-checkout-callback', body: '{}', accept: (r) => r.status === 401 },
];

async function runProbe(probe) {
  const target = new URL(probe.path, STAGING_ORIGIN);
  if (target.origin !== STAGING_ORIGIN) throw new Error(`Unsafe probe host rejected: ${target.origin}`);
  const response = await fetch(target, {
    method: probe.method,
    body: probe.body,
    redirect: 'manual',
    headers: probe.body ? { 'Content-Type': 'application/json', 'User-Agent': 'YoVibe-Staging-Security-Probe/1.0' } : { 'User-Agent': 'YoVibe-Staging-Security-Probe/1.0' },
  });
  const body = await response.text();
  return { name: probe.name, status: response.status, passed: probe.accept(response, body) };
}

async function main() {
  const results = [];
  for (const probe of probes) results.push(await runProbe(probe));

  const privateObject = new URL('/yovibe-stagging/buyer-photos/certification-nonexistent.jpg', PRIVATE_R2_ORIGIN);
  const privateResponse = await fetch(privateObject, { redirect: 'manual', headers: { 'User-Agent': 'YoVibe-Staging-Security-Probe/1.0' } });
  results.push({
    name: 'private-r2-anonymous-read-denied',
    status: privateResponse.status,
    passed: [400, 401, 403, 404].includes(privateResponse.status),
  });

  console.log(JSON.stringify({ origin: STAGING_ORIGIN, results }, null, 2));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
