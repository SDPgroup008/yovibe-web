// Web entry point - loads polyfills before the app

// Import polyfills first - order matters!
import "react-native-get-random-values"

// Import URL polyfill for React Native web compatibility
import "./src/utils/url-polyfill"

// Import and execute expo-polyfills
import "./src/utils/expo-polyfills"

// Register the main component
import { registerRootComponent } from "expo"
import App from "./src/App"

registerRootComponent(App)




