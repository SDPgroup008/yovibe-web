const fs = require("fs")
const path = require("path")
const esbuild = require("esbuild")

const projectRoot = path.resolve(__dirname, "..")
const legacyFunctionsDirectory = path.join(projectRoot, "netlify", "functions")
const modernFunctionsDirectory = path.join(projectRoot, "netlify", "modern-functions")

const hasLambdaHandler = (source) => /(?:exports\.handler|module\.exports\.handler)\s*=|export\s+(?:async\s+)?function\s+handler/.test(source)

fs.rmSync(modernFunctionsDirectory, { recursive: true, force: true })
fs.mkdirSync(modernFunctionsDirectory, { recursive: true })

const functionFiles = fs.readdirSync(legacyFunctionsDirectory)
  .filter((file) => file.endsWith(".js"))
  .filter((file) => hasLambdaHandler(fs.readFileSync(path.join(legacyFunctionsDirectory, file), "utf8")))

for (const file of functionFiles) {
  const functionName = path.basename(file, ".js")
  const source = fs.readFileSync(path.join(legacyFunctionsDirectory, file), "utf8")
  const isEsmHandler = /export\s+(?:async\s+)?function\s+handler/.test(source)
  const wrapper = isEsmHandler
    ? `import { withLambda } from "@netlify/aws-lambda-compat";\nimport { handler as legacyHandler } from "../functions/${file}";\n\nexport default withLambda(legacyHandler);\n`
    : `import { withLambda } from "@netlify/aws-lambda-compat";\nimport legacyFunction from "../functions/${file}";\n\nexport default withLambda(legacyFunction.handler);\n`
  const outputFile = path.join(modernFunctionsDirectory, `${functionName}.mjs`)
  // Bundle the legacy handler and its shared server dependencies now. The
  // generated modern function must not rely on Netlify resolving imports from
  // outside the configured functions directory at runtime.
  esbuild.buildSync({
    stdin: {
      contents: wrapper,
      sourcefile: `${functionName}.entry.mjs`,
      resolveDir: modernFunctionsDirectory,
      loader: "js",
    },
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["@resvg/resvg-js", "@resvg/resvg-js-linux-x64-gnu"],
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    sourcemap: false,
    logLevel: "silent",
  })
}

console.log(`Generated ${functionFiles.length} modern Netlify Function wrappers.`)
