/*
 * Expo's dotenv loader only exposes EXPO_PUBLIC_* variables to Metro. The
 * staging project historically stores its local Supabase values under the
 * neutral `project_url` / `publishable_key` names, so map those values here
 * before starting Expo. This deliberately refuses production Supabase
 * project references when running the local staging server.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
for (const file of ['.env.local', '.env']) {
  const filename = path.join(root, file);
  if (fs.existsSync(filename)) dotenv.config({ path: filename, override: false, quiet: true });
}

const environment = String(process.env.APP_ENV || 'staging').trim().toLowerCase();
if (environment !== 'staging') {
  throw new Error('Local Expo web start is staging-only. Set APP_ENV=staging.');
}
process.env.APP_ENV = 'staging';
const stagingOrigin = 'https://yovibe-stagging.netlify.app';

// These names are staging-only entries from the local, ignored .env file.
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.project_url || '';
if (!process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.publishable_key || '';

for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith('NEXT_PUBLIC_')) {
    const expoName = `EXPO_PUBLIC_${name.slice('NEXT_PUBLIC_'.length)}`;
    const normalized = String(value || '').toLowerCase();
    if (!process.env[expoName] && !normalized.includes(`yovibe${'.net'}`) && !normalized.includes(`uqukizjohack${'rcwrtefk'}`)) {
      process.env[expoName] = value;
    }
  }
}

// Never inherit production site/function URLs from a legacy local dotenv file.
if (!process.env.EXPO_PUBLIC_SITE_URL || String(process.env.EXPO_PUBLIC_SITE_URL).toLowerCase().includes(`yovibe${'.net'}`)) {
  process.env.EXPO_PUBLIC_SITE_URL = stagingOrigin;
}
if (!process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL || String(process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL).toLowerCase().includes(`yovibe${'.net'}`)) {
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL = `${stagingOrigin}/.netlify/functions`;
}

const forbidden = [`uqukizjohack${'rcwrtefk'}`, `yovibe${'.net'}`];
const publicValues = [process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SITE_URL, process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL]
  .map((value) => String(value || '').toLowerCase());
if (forbidden.some((identifier) => publicValues.some((value) => value.includes(identifier)))) {
  throw new Error('Local staging start rejected a production URL/project reference. Set staging values in .env.local.');
}
if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Staging Supabase is not configured. Set project_url and publishable_key in the ignored .env.local file.');
}

const args = process.argv.slice(2);
const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
const result = spawnSync(process.execPath, [expoCli, 'start', '--web', ...args], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: false,
});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
