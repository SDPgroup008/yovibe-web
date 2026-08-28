// Phase 5 (5.1): error tracking via Sentry (client-side).
// Init before the app renders. Without a DSN, Sentry initializes as a no-op,
// so local/dev builds are unaffected.

import * as Sentry from "@sentry/react-native"

const DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  process.env.SENTRY_DSN ||
  ""

export function initSentry() {
  if (!DSN) {
    console.warn("[Sentry] No SENTRY_DSN configured — error tracking disabled")
    return
  }
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV || "production",
  })
  console.log("[Sentry] Error tracking enabled")
}

export default Sentry
