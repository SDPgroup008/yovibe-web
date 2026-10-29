const fs = require("node:fs");
const dotenv = require("dotenv");
const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const patchScript = path.join(__dirname, "patch-web-shell-seo.js");
const termsPageScript = path.join(__dirname, "generate-terms-page.js");
require("./prepare-ffmpeg-web-assets")();

// Local staging builds intentionally load the ignored dotenv files here because
// Expo's own dotenv loading is disabled below. Existing shell/Netlify values
// always win, so CI and hosted builds remain authoritative.
const requestedEnvironment = String(process.env.APP_ENV || '').trim().toLowerCase();
const isStaging = requestedEnvironment === 'staging';
if (requestedEnvironment === 'staging') {
  for (const filename of ['.env.local', '.env']) {
    const fullPath = path.join(projectRoot, filename);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override: false, quiet: true });
    }
  }
}

// A production Firebase project must never be embedded in a staging bundle.
// If no separate staging Firebase project is configured, staging runs with
// Firebase/notification delivery disabled while all other app functionality
// remains available.
const productionFirebaseIdentifier = 'eco-guardian-bd74f';
const stagingUsesProductionFirebase = isStaging && [
  process.env.FIREBASE_PROJECT_ID,
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
].some((value) => String(value || '').toLowerCase().includes(productionFirebaseIdentifier));
if (stagingUsesProductionFirebase) {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('NEXT_PUBLIC_FIREBASE_') || name.startsWith('EXPO_PUBLIC_FIREBASE_')) {
      delete process.env[name];
    }
  }
}

// The local staging dotenv file uses project_url/publishable_key for the
// isolated Supabase project. Prefer those aliases over legacy NEXT_PUBLIC_ or
// SUPABASE_URL values when they are present, so a production URL cannot leak
// into a staging bundle.
if (isStaging) {
  if (process.env.project_url) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.project_url;
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.project_url;
  }
  if (process.env.publishable_key) {
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.publishable_key;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.publishable_key;
  }
}

// Expo only inlines variables whose names start with EXPO_PUBLIC_. Netlify's
// project configuration uses NEXT_PUBLIC_ names, so mirror every public value
// into Expo's supported namespace before spawning the export process.
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith('NEXT_PUBLIC_')) continue;
  if (stagingUsesProductionFirebase && name.startsWith('NEXT_PUBLIC_FIREBASE_')) continue;
  const expoName = `EXPO_PUBLIC_${name.slice('NEXT_PUBLIC_'.length)}`;
  if (!process.env[expoName]) process.env[expoName] = value;
}

// Some Netlify deployments keep the browser-safe Supabase values under their
// server/function names. Mirror only the URL and publishable/anon key aliases
// into Expo's public namespace; never map SUPABASE_SECRET_KEY or service-role
// credentials into the client bundle.
const supabasePublicAliases = {
  EXPO_PUBLIC_SUPABASE_URL: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'project_url'],
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: [
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'publishable_key',
  ],
};
for (const [target, candidates] of Object.entries(supabasePublicAliases)) {
  if (process.env[target]) continue;
  const source = candidates.find((name) => process.env[name]);
  if (source) process.env[target] = process.env[source];
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

// Public staging aliases used by the local dotenv files and Netlify settings.
const publicAliases = {
  EXPO_PUBLIC_FUNCTIONS_BASE_URL: [
    'NEXT_PUBLIC_FUNCTIONS_BASE_URL',
    'FUNCTIONS_BASE_URL',
  ],
  EXPO_PUBLIC_R2_PUBLIC_BUCKET_NAME: [
    'NEXT_PUBLIC_R2_PUBLIC_BUCKET_NAME',
    'R2_PUBLIC_BUCKET_NAME',
    'R2_BUCKET_NAME',
  ],
  EXPO_PUBLIC_R2_PUBLIC_URL: [
    'NEXT_PUBLIC_R2_PUBLIC_URL',
    'R2_PUBLIC_URL',
  ],
  EXPO_PUBLIC_FIREBASE_ENABLED: [
    'NEXT_PUBLIC_FIREBASE_ENABLED',
    'FIREBASE_ENABLED',
  ],
  EXPO_PUBLIC_NOTIFICATIONS_ENABLED: [
    'NEXT_PUBLIC_NOTIFICATIONS_ENABLED',
    'NOTIFICATIONS_ENABLED',
  ],
};
for (const [target, candidates] of Object.entries(publicAliases)) {
  if (process.env[target]) continue;
  const source = candidates.find((name) => process.env[name]);
  if (source) process.env[target] = process.env[source];
}

// The existing production Netlify project stores Firebase's browser-safe
// configuration under FIREBASE_* names. Mirror only those public fields into
// the Expo/NEXT namespaces; never expose FIREBASE_SERVICE_ACCOUNT.
for (const suffix of [
  'API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET',
  'MESSAGING_SENDER_ID', 'APP_ID', 'MEASUREMENT_ID', 'VAPID_KEY',
]) {
  if (stagingUsesProductionFirebase) break;
  const source = `FIREBASE_${suffix}`;
  const nextName = `NEXT_PUBLIC_FIREBASE_${suffix}`;
  const expoName = `EXPO_PUBLIC_FIREBASE_${suffix}`;
  if (!process.env[nextName] && process.env[source]) process.env[nextName] = process.env[source];
  if (!process.env[expoName] && process.env[source]) process.env[expoName] = process.env[source];
}

if (isStaging) {
  const stagingOrigin = 'https://yovibe-stagging.netlify.app';
  if (!process.env.EXPO_PUBLIC_SITE_URL || String(process.env.EXPO_PUBLIC_SITE_URL).toLowerCase().includes('yovibe.net')) {
    process.env.EXPO_PUBLIC_SITE_URL = stagingOrigin;
  }
  if (!process.env.NEXT_PUBLIC_SITE_URL || String(process.env.NEXT_PUBLIC_SITE_URL).toLowerCase().includes('yovibe.net')) {
    process.env.NEXT_PUBLIC_SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;
  }
  if (!process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL || String(process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL).toLowerCase().includes('yovibe.net')) {
    process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL = `${stagingOrigin}/.netlify/functions`;
  }
  // Keep the SEO patcher and Expo namespace on the same staging origin.
  process.env.NEXT_PUBLIC_SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL = process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL;
  if (stagingUsesProductionFirebase) {
    process.env.EXPO_PUBLIC_FIREBASE_ENABLED = 'false';
    process.env.NEXT_PUBLIC_FIREBASE_ENABLED = 'false';
    process.env.EXPO_PUBLIC_NOTIFICATIONS_ENABLED = 'false';
    process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED = 'false';
  } else {
    if (!process.env.EXPO_PUBLIC_FIREBASE_ENABLED) process.env.EXPO_PUBLIC_FIREBASE_ENABLED = 'true';
    if (!process.env.EXPO_PUBLIC_NOTIFICATIONS_ENABLED) process.env.EXPO_PUBLIC_NOTIFICATIONS_ENABLED = 'true';
  }

  // Never allow repository-local production .env files into a staging bundle.
  process.env.EXPO_NO_DOTENV = '1';
  const forbidden = ['eco-guardian-bd74f', 'uqukizjohackrcwrtefk', 'yovibe.net'];
  const publicConfig = Object.entries(process.env)
    .filter(([name]) => name.startsWith('NEXT_PUBLIC_') || name.startsWith('EXPO_PUBLIC_'))
    .map(([, value]) => String(value || '')).join('\n');
  for (const identifier of forbidden) {
    if (publicConfig.includes(identifier)) throw new Error(`Staging build rejected production identifier: ${identifier}`);
  }

  const requiredPublicVariables = [
    'EXPO_PUBLIC_SITE_URL',
    'EXPO_PUBLIC_FUNCTIONS_BASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_R2_PUBLIC_BUCKET_NAME',
    'EXPO_PUBLIC_R2_PUBLIC_URL',
    'EXPO_PUBLIC_FIREBASE_ENABLED',
    'EXPO_PUBLIC_NOTIFICATIONS_ENABLED',
  ];
  const missing = requiredPublicVariables.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Staging build is missing public configuration: ${missing.join(', ')}`);
  }
}

const run = (command) => {
  execSync(command, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  });
};

const extraArgs = process.argv.slice(2);
const escapedArgs = extraArgs.join(" ");

run(`node "${termsPageScript}"`);
run(`npx expo export --platform web${escapedArgs ? ` ${escapedArgs}` : ""}`);
run(`node "${patchScript}"`);
