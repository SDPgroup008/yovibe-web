const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
}).split('\0').filter(Boolean);

const textExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.toml', '.md', '.txt', '.sql', '.yml', '.yaml', '.html', '.xml', '.csv']);
const secretRules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['supabase-secret-key', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ['resend-api-key', /\bre_[A-Za-z0-9_]{20,}\b/],
  ['jwt-like-secret', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
];
const productionRules = [
  ['production-supabase', /uqukizjohackrcwrtefk/i],
  ['live-pawapay', /api\.pawapay\.net/i],
  ['live-pesapal', /pay\.pesapal\.com/i],
  ['production-site-url', /https:\/\/(?:www\.)?yovibe\.net/i],
  ['production-r2-public', /pub-9790a44a83ab4a5e92acd4f1904afbbe/i],
  ['production-firebase', /eco-guardian-bd74f/i],
  ['legacy-r2-credentials', /process\.env\.R2_(?:BUCKET_NAME|ACCESS_KEY_ID|SECRET_ACCESS_KEY)/],
  ['legacy-supabase-service-key', /process\.env\.SUPABASE_(?:SERVICE_ROLE_KEY|SERVICE_KEY)/],
];

const findings = [];
for (const relative of tracked) {
  if (relative === 'scripts/staging-safety-scan.js') continue;
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
  if (!textExtensions.has(path.extname(relative).toLowerCase()) || fs.statSync(full).size > 5 * 1024 * 1024) continue;
  const content = fs.readFileSync(full, 'utf8');
  for (const [rule, regex] of secretRules) if (regex.test(content)) findings.push({ kind: 'secret', rule, file: relative });
  const isDeployable = relative === 'index.web.js' || relative === 'netlify.toml' ||
    relative.startsWith('netlify/') || relative.startsWith('src/') ||
    relative.startsWith('public/') || relative.startsWith('scripts/');
  for (const [rule, regex] of productionRules) {
    if (!isDeployable) continue;
    if (relative.includes('/__tests__/')) continue;
    if (relative === 'netlify/shared/runtimeConfig.js' && ['production-supabase', 'production-site-url', 'production-r2-public'].includes(rule)) continue;
    if (relative === 'scripts/build-web.js' && ['production-supabase', 'production-firebase'].includes(rule)) continue;
    if (regex.test(content)) findings.push({ kind: 'production-identifier', rule, file: relative });
  }
}

const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  const stack = [dist];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (fs.statSync(full).size <= 10 * 1024 * 1024) {
        const content = fs.readFileSync(full, 'utf8');
        for (const [rule, regex] of [...secretRules, ...productionRules]) {
          if (regex.test(content)) findings.push({ kind: 'compiled-output', rule, file: path.relative(root, full) });
        }
      }
    }
  }
}

if (findings.length) {
  for (const finding of findings) console.error(`${finding.kind}: ${finding.rule} in ${finding.file}`);
  process.exit(1);
}
console.log(`Staging safety scan passed (${tracked.length} repository files${fs.existsSync(dist) ? ' plus dist' : ''}).`);
