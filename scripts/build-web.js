const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const patchScript = path.join(__dirname, "patch-web-shell-seo.js");

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
