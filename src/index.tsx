// Import polyfills first
import "./utils/init"
import { AppRegistry } from "react-native"

// Import the app
import App from "./App"

// Register the app
AppRegistry.registerComponent("YoVibe", () => App)

// Web-specific setup
if (typeof document !== "undefined") {
  const rootTag = document.getElementById("root")
  AppRegistry.runApplication("YoVibe", { rootTag })
}
