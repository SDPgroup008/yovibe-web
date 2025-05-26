const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const config = getDefaultConfig(__dirname)

// Add web support
config.resolver.platforms = ["web", "native", "ios", "android"]

// Add resolution for platform-specific extensions
config.resolver.sourceExts = process.env.RN_SRC_EXT
  ? [...process.env.RN_SRC_EXT.split(",").concat(config.resolver.sourceExts), "web.ts", "web.tsx", "web.js", "web.jsx"]
  : [...config.resolver.sourceExts, "web.ts", "web.tsx", "web.js", "web.jsx"]

// Ensure .web.js files are processed correctly
config.resolver.resolverMainFields = ["browser", "main"]

// Add extraNodeModules to provide mocks for native modules
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "react-native/Libraries/Utilities/codegenNativeCommands": path.resolve(
    __dirname,
    "src/mocks/react-native-libraries-utilities-codegenNativeCommands.js",
  ),
}

module.exports = config
