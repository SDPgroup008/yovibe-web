const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const patchScript = path.join(__dirname, "patch-web-shell-seo.js");

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
