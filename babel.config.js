module.exports = (api) => {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "babel-plugin-module-resolver",
        {
          alias: {
            "@": "./src",
          },
        },
      ],
      "react-native-web", // Added to handle asset imports better
    ],
  }
}


