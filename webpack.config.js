const createExpoWebpackConfigAsync = require("@expo/webpack-config")
const path = require("path")

module.exports = async (env, argv) => {
  const config = await createExpoWebpackConfigAsync(env, argv)

  // Customize the config for web
  config.resolve.alias = {
    ...config.resolve.alias,
    // Add path alias
    "@": path.resolve(__dirname, "src"),
  }

  // Add a fallback for node modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve("crypto-browserify"),
    stream: require.resolve("stream-browserify"),
    path: require.resolve("path-browserify"),
    fs: false,
  }

  // Ensure .web.js files are processed before .js files
  config.resolve.extensions = [
    ".web.ts",
    ".web.tsx",
    ".web.js",
    ".web.jsx",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ...config.resolve.extensions,
  ]

  return config
}
