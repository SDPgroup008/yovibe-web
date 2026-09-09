/* Read-only staging capacity ladder. It never sends POSTs or uses production. */
const { performance } = require('node:perf_hooks');

const ORIGIN = 'https://yovibe-stagging.netlify.app';
const PATH = '/.netlify/functions/health';
const rates = (process.env.STAGING_RATE_LADDER || '5,10,20,30,40').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
const durationSeconds = Math.max(5, Number(process.env.STAGING_RATE_DURATION_SECONDS || 10));
const timeoutMs = 15000;

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0;
}

async function request() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(new URL(PATH, ORIGIN), { redirect: 'manual', cache: 'no-store', signal: controller.signal, headers: { 'User-Agent': 'YoVibe-Staging-Rate-Ladder/1.0' } });
    const body = await response.text();
    const ok = response.status === 503 && body.includes('"db"');
    return { ok, ms: performance.now() - started, status: response.status };
  } catch (error) { return { ok: false, ms: performance.now() - started, status: 0, error: error.name }; }
  finally { clearTimeout(timer); }
}

async function run(rate) {
  const total = rate * durationSeconds;
  const results = [];
  let cursor = 0;
  async function worker() { while (true) { const i = cursor++; if (i >= total) return; results[i] = await request(); } }
  const started = performance.now();
  await Promise.all(Array.from({ length: rate }, worker));
  const elapsed = performance.now() - started;
  const durations = results.map((r) => r.ms);
  const failures = results.filter((r) => !r.ok).length;
  return { ratePerSecond: rate, requests: total, failures, failureRate: Number((failures / total).toFixed(4)), throughputPerSecond: Number((total / (elapsed / 1000)).toFixed(2)), p95Ms: Math.round(percentile(durations, 0.95)), p99Ms: Math.round(percentile(durations, 0.99)) };
}

async function main() {
  if (ORIGIN.includes('yovibe.net')) throw new Error('Production origin rejected');
  const results = [];
  for (const rate of rates) {
    const result = await run(rate); results.push(result); console.log(JSON.stringify(result));
    if (result.failureRate > 0.01 || result.p95Ms > 3000 || result.p99Ms > 5000) break;
  }
  console.log(JSON.stringify({ origin: ORIGIN, path: PATH, durationSeconds, results }, null, 2));
  if (results.some((r) => r.failureRate > 0.01 || r.p95Ms > 3000 || r.p99Ms > 5000)) process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
