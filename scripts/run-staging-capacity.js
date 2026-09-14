const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const config = path.resolve(__dirname, '..', 'tests', 'load', 'staging-artillery.yml');
const output = path.join(os.tmpdir(), `yovibe-staging-artillery-${process.pid}.json`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

try {
  const result = spawnSync(npx, ['--yes', 'artillery@2.0.34', 'run', config, '--output', output], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (!fs.existsSync(output)) process.exit(result.status || 1);

  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  const counters = report.aggregate?.counters || {};
  const requests = Number(counters['http.requests'] || 0);
  const failed = Object.entries(counters)
    .filter(([name]) => name.startsWith('errors.'))
    .reduce((total, [, value]) => total + Number(value || 0), 0);
  const failureRate = requests ? failed / requests : 1;
  const p95 = Number(report.aggregate?.summaries?.['http.response_time']?.p95 || 0);
  const p99 = Number(report.aggregate?.summaries?.['http.response_time']?.p99 || 0);
  console.log(JSON.stringify({ requests, failed, failureRate, p95Ms: p95, p99Ms: p99 }, null, 2));
  if (failureRate > 0.01 || p95 > 3000 || p99 > 5000) {
    console.error('Staging capacity thresholds exceeded. No production traffic was generated.');
    process.exitCode = 1;
  }
} finally {
  try { fs.unlinkSync(output); } catch {}
}
