// Web entry point - loads polyfills before the app

// Import polyfills first - order matters!
import "react-native-get-random-values"

// Import URL polyfill for React Native web compatibility
import "./src/utils/url-polyfill"

// Import and execute expo-polyfills
import "./src/utils/expo-polyfills"

// Register the service worker for PWA support
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => {
        /* console.log("[SW] Registered successfully:", registration.scope) */

        // Check for updates on page load
        registration.update()

        // Handle update found
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                /* console.log("[SW] New version available — reload to update") */
              }
            })
          }
        })
      })
      .catch((error) => {
        console.warn("[SW] Registration failed:", error)
      })

    // Handle controller change (new SW took over)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      /* console.log("[SW] New controller activated") */
    })
  })
}

// Register the main component
import { registerRootComponent } from "expo"
import App from "./src/App"

registerRootComponent(App)

