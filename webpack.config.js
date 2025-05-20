const createExpoWebpackConfigAsync = require("@expo/webpack-config")
const path = require("path")

module.exports = async (env, argv) => {
  const config = await createExpoWebpackConfigAsync(env, argv)

  // Customize the config for web
  config.resolve.alias = {
    ...config.resolve.alias,
    // Add path alias
    "@": path.resolve(__dirname, "src"),
    // Ensure react-native is aliased to react-native-web
    'react-native$': 'react-native-web',
  }

  // Add a fallback for node modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve("crypto-browserify"),
    stream: require.resolve("stream-browserify"),
    path: require.resolve("path-browserify"),
    fs: false,
    // Add AsyncStorage fallback
    '@react-native-async-storage/async-storage': 'react-native-web/dist/exports/AsyncStorage',
  }

  // Your existing extensions prioritization is perfect!
  // It already prioritizes .web.js files which is exactly what we need

  // Optionally add some plugins to help with debugging
  if (env.mode === 'development') {
    config.devtool = 'source-map';
  }

  // If you want to use a custom HTML template
  config.plugins.forEach(plugin => {
    if (plugin.constructor.name === 'HtmlWebpackPlugin') {
      // Only modify if you have a custom template
      // plugin.options.template = './public/index.html';
    }
  });

  return config
}