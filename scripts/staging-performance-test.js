const { performance } = require('node:perf_hooks');

const ORIGIN = 'https://yovibe-stagging.netlify.app';
const SAFE_PATHS = new Set(['/.netlify/functions/health', '/events']);
const REQUEST_TIMEOUT_MS = 15000;

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] || 0;
}

async function request(path) {
  if (!SAFE_PATHS.has(path)) throw new Error(`Unsafe staging performance path rejected: ${path}`);
  const target = new URL(path, ORIGIN);
  if (target.origin !== ORIGIN) throw new Error(`Unsafe staging performance host rejected: ${target.origin}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'YoVibe-Staging-Certification/1.0' },
    });
    const body = await response.text();
    const validHealth = path.endsWith('/health') && [200, 503].includes(response.status) && body.includes('"db"');
    const validGate = path === '/events' && response.status === 302 && (response.headers.get('location') || '').includes('/staging-access.html');
    return { ok: validHealth || validGate, status: response.status, ms: performance.now() - started };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - started, error: error.name || 'RequestError' };
  } finally {
    clearTimeout(timer);
  }
}

async function runStage(name, path, total, concurrency) {
  const results = new Array(total);
  let cursor = 0;
  const started = performance.now();
  async function worker() {
    while (cursor < total) {
      const index = cursor++;
      results[index] = await request(path);
    }
  }
  await Promise.all(Array.from({ length: Math.min(total, concurrency) }, worker));
  const elapsedMs = performance.now() - started;
  const durations = results.map((item) => item.ms);
  const statusCounts = {};
  for (const item of results) statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  return {
    name,
    path,
    requests: total,
    concurrency,
    successes: results.filter((item) => item.ok).length,
    failures: results.filter((item) => !item.ok).length,
    statusCounts,
    throughputPerSecond: Number((total / (elapsedMs / 1000)).toFixed(2)),
    elapsedMs: Math.round(elapsedMs),
    p50Ms: Math.round(percentile(durations, 0.50)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    p99Ms: Math.round(percentile(durations, 0.99)),
    maxMs: Math.round(Math.max(...durations)),
  };
}

async function main() {
  const report = [];
  report.push(await runStage('load', '/.netlify/functions/health', 100, 5));
  for (const concurrency of [5, 10, 20, 30]) {
    report.push(await runStage(`stress-${concurrency}`, '/.netlify/functions/health', concurrency * 2, concurrency));
  }
  report.push(await runStage('spike', '/.netlify/functions/health', 50, 50));
  report.push(await runStage('edge-gate', '/events', 50, 25));
  console.log(JSON.stringify({ origin: ORIGIN, generatedAt: new Date().toISOString(), report }, null, 2));
  if (report.some((stage) => stage.failures > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
