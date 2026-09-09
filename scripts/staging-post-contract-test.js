/*
 * Safe POST contract checks for the isolated staging site.
 *
 * Every payload is intentionally invalid or refers to synthetic data. The
 * checks stop before payment-provider calls, database writes, or ticket
 * scans. Never point this script at production.
 */
const ORIGIN = 'https://yovibe-stagging.netlify.app';
const USER_AGENT = 'YoVibe-Staging-POST-Contract/1.0';

const contracts = [
  { name: 'pawaPay deposit validation', path: '/.netlify/functions/create-pawapay-deposit', body: {}, statuses: [400, 401] },
  { name: 'PesaPal order validation', path: '/.netlify/functions/create-pesapal-order', body: {}, statuses: [400, 401, 500] },
  { name: 'guest refund action validation', path: '/.netlify/functions/guest-refund', body: {}, statuses: [400, 401] },
  { name: 'authenticated refund authorization', path: '/.netlify/functions/refund-ticket', body: {}, statuses: [401] },
  { name: 'fulfillment validation', path: '/.netlify/functions/fulfill-purchase', body: {}, statuses: [400, 401] },
  { name: 'staff token validation', path: '/.netlify/functions/validate-staff-token', body: {}, statuses: [400, 401] },
  { name: 'ticket scan validation', path: '/.netlify/functions/scan-ticket', body: {}, statuses: [400, 401] },
  { name: 'generic R2 upload authorization', path: '/.netlify/functions/uploadR2', body: {}, statuses: [401] },
  { name: 'buyer photo presign validation', path: '/.netlify/functions/presign-buyer-photo', body: {}, statuses: [400, 401] },
  { name: 'unsigned pawaPay deposit callback', path: '/.netlify/functions/pawapay-deposit-callback', body: {}, statuses: [401] },
  { name: 'unsigned pawaPay payout callback', path: '/.netlify/functions/pawapay-payout-callback', body: {}, statuses: [401] },
  { name: 'unsigned pawaPay refund callback', path: '/.netlify/functions/pawapay-refund-callback', body: {}, statuses: [401] },
  { name: 'unsigned checkout callback', path: '/.netlify/functions/pawapay-checkout-callback', body: {}, statuses: [401] },
];

async function run(contract) {
  const url = new URL(contract.path, ORIGIN);
  if (url.origin !== ORIGIN) throw new Error(`Unsafe target rejected: ${url.origin}`);
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify(contract.body),
  });
  const text = await response.text();
  return {
    name: contract.name,
    path: contract.path,
    status: response.status,
    expected: contract.statuses,
    passed: contract.statuses.includes(response.status),
    bodyPreview: text.slice(0, 160),
  };
}

async function main() {
  const results = [];
  for (const contract of contracts) results.push(await run(contract));
  console.log(JSON.stringify({ origin: ORIGIN, mode: 'non-mutating-invalid-posts', results }, null, 2));
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
