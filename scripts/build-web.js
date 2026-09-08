const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const patchScript = path.join(__dirname, "patch-web-shell-seo.js");

// Expo only inlines variables whose names start with EXPO_PUBLIC_. Netlify's
// project configuration uses NEXT_PUBLIC_ names, so mirror every public value
// into Expo's supported namespace before spawning the export process.
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith('NEXT_PUBLIC_')) continue;
  const expoName = `EXPO_PUBLIC_${name.slice('NEXT_PUBLIC_'.length)}`;
  if (!process.env[expoName]) process.env[expoName] = value;
}

if (String(process.env.APP_ENV || '').toLowerCase() === 'staging') {
  // Never allow repository-local production .env files into a staging bundle.
  process.env.EXPO_NO_DOTENV = '1';
  const forbidden = ['eco-guardian-bd74f', 'uqukizjohackrcwrtefk'];
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

run(`npx expo export --platform web${escapedArgs ? ` ${escapedArgs}` : ""}`);
run(`node "${patchScript}"`);
