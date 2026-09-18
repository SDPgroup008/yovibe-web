const fs = require("fs")
const path = require("path")

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
    : `import { createRequire } from "node:module";\nimport { withLambda } from "@netlify/aws-lambda-compat";\n\nconst require = createRequire(import.meta.url);\nconst legacyFunction = require("../functions/${file}");\n\nexport default withLambda(legacyFunction.handler);\n`
  fs.writeFileSync(path.join(modernFunctionsDirectory, `${functionName}.mjs`), wrapper, "utf8")
}

console.log(`Generated ${functionFiles.length} modern Netlify Function wrappers.`)
