// Web entry point - loads polyfills before the app
import "react-native-get-random-values"

// Import URL polyfill for React Native web compatibility
import "./src/utils/url-polyfill"

// Register the main component
import { registerRootComponent } from "expo"
import App from "./App"

registerRootComponent(App)
