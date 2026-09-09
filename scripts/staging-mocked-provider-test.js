/*
 * Exercises payment, payout, refund, scan and photo POST workflows against a
 * local in-memory provider double. No staging or production service is used.
 * The same idempotency and duplicate-scan invariants are required by the
 * Netlify functions when they call real sandbox providers.
 */
const http = require('node:http');
const { performance } = require('node:perf_hooks');

const PORT = 0;
const phases = [
  { name: 'warmup', requests: 40, concurrency: 4 },
  { name: 'sustained', requests: 400, concurrency: 20 },
  { name: 'stress', requests: 800, concurrency: 80 },
  { name: 'spike', requests: 400, concurrency: 200 },
];

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function startServer() {
  const idempotency = new Map();
  const scans = new Set();
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { error: 'json' }); }
      const key = String(body.idempotencyKey || '');
      if (req.url === '/mock/scan') {
        const ticket = String(body.ticketId || '');
        if (!ticket) return json(res, 400, { error: 'ticketId required' });
        if (scans.has(ticket)) return json(res, 409, { status: 'duplicate' });
        scans.add(ticket);
        return json(res, 200, { status: 'granted' });
      }
      if (!['/mock/deposit', '/mock/payout', '/mock/refund', '/mock/photo'].includes(req.url)) {
        return json(res, 404, { error: 'not found' });
      }
      if (!key) return json(res, 400, { error: 'idempotencyKey required' });
      if (idempotency.has(key)) return json(res, 200, { status: 'idempotent-replay', operationId: idempotency.get(key) });
      const operationId = `mock-${idempotency.size + 1}`;
      idempotency.set(key, operationId);
      return json(res, req.url === '/mock/photo' ? 201 : 202, { status: 'accepted', operationId });
    });
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0;
}

async function main() {
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const results = [];
  try {
    for (const phase of phases) {
      const timings = [];
      let cursor = 0;
      let failures = 0;
      async function worker() {
        while (true) {
          const index = cursor++;
          if (index >= phase.requests) return;
          const operation = index % 4 === 0 ? 'deposit' : index % 4 === 1 ? 'payout' : index % 4 === 2 ? 'refund' : 'photo';
          const idempotencyKey = `${phase.name}-${index % Math.max(1, Math.floor(phase.requests / 2))}`;
          const started = performance.now();
          try {
            const response = await fetch(`${base}/mock/${operation}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idempotencyKey }),
            });
            await response.text();
            if (![200, 202, 201].includes(response.status)) failures++;
          } catch { failures++; }
          timings.push(performance.now() - started);
        }
      }
      await Promise.all(Array.from({ length: phase.concurrency }, worker));
      results.push({ name: phase.name, requests: phase.requests, failures, failureRate: failures / phase.requests,
        p95Ms: Math.round(percentile(timings, 0.95)), p99Ms: Math.round(percentile(timings, 0.99)) });
    }
    const duplicate = await fetch(`${base}/mock/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: 'synthetic-ticket-1' }) });
    const replay = await fetch(`${base}/mock/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: 'synthetic-ticket-1' }) });
    results.push({ name: 'duplicate-scan-invariant', firstStatus: duplicate.status, replayStatus: replay.status, passed: duplicate.status === 200 && replay.status === 409 });
  } finally { server.close(); }
  console.log(JSON.stringify({ target: 'local-in-memory-provider-double', results }, null, 2));
  if (results.some((result) => result.failureRate > 0.01 || result.passed === false)) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
