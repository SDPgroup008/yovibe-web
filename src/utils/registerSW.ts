/**
 * Service Worker Registration
 * Handles registering the service worker, managing updates,
 * and providing status information to the app.
 */

const SW_PATH = "/firebase-messaging-sw.js"
const SW_VERSION_KEY = "yovibe-sw-version"
const CURRENT_SW_VERSION = "v1.0.0"

export type SWStatus = {
  registered: boolean
  updateAvailable: boolean
  isControlling: boolean
  error?: string
}

type StatusCallback = (status: SWStatus) => void

class ServiceWorkerManager {
  private static instance: ServiceWorkerManager
  private status: SWStatus = {
    registered: false,
    updateAvailable: false,
    isControlling: false,
  }
  private listeners: Set<StatusCallback> = new Set()
  private registration: ServiceWorkerRegistration | null = null
  private initialised = false

  private constructor() {}

  static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager()
    }
    return ServiceWorkerManager.instance
  }

  private notify() {
    this.listeners.forEach((cb) => cb({ ...this.status }))
  }

  subscribe(callback: StatusCallback): () => void {
    this.listeners.add(callback)
    callback({ ...this.status })
    return () => {
      this.listeners.delete(callback)
    }
  }

  getStatus(): SWStatus {
    return { ...this.status }
  }

  async register(): Promise<boolean> {
    if (this.initialised) return this.status.registered
    this.initialised = true

    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      this.status.error = "Service workers not supported"
      this.notify()
      return false
    }

    try {
      this.registration = await navigator.serviceWorker.register(SW_PATH, {
        scope: "/",
        updateViaCache: "none",
      })

      this.status.registered = true
      this.status.isControlling = !!navigator.serviceWorker.controller

      console.log("[SW] Registered successfully:", this.registration.scope)

      // Handle updates
      this.registration.addEventListener("updatefound", () => {
        const installingWorker = this.registration?.installing
        if (installingWorker) {
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // New version available
                this.status.updateAvailable = true
                console.log("[SW] New version available")
                this.notify()
              }
            }
          })
        }
      })

      // Track controller changes
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        this.status.isControlling = true
        this.status.updateAvailable = false
        console.log("[SW] New controller activated")
        this.notify()
      })

      // Store the current SW version for cache busting
      try {
        localStorage.setItem(SW_VERSION_KEY, CURRENT_SW_VERSION)
      } catch { /* localStorage unavailable */ }

      this.notify()
      return true
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error"
      console.error("[SW] Registration failed:", msg)
      this.status.error = msg
      this.notify()
      return false
    }
  }

  async skipWaiting() {
    if (this.registration?.waiting) {
      this.registration.waiting.postMessage({ type: "SKIP_WAITING" })
    }
  }

  /**
   * Pre-cache additional URLs at runtime (e.g., after data loads)
   */
  async cacheUrls(urls: string[]) {
    if (this.registration?.active) {
      this.registration.active.postMessage({
        type: "CACHE_URLS",
        urls,
      })
    }
  }

  /**
   * Queue a background sync request (retried when online)
   */
  async queueSync(tag: string, data: Record<string, any>) {
    if ("syncManager" in self && this.registration?.sync) {
      try {
        await this.registration.sync.register(tag)
      } catch {
        // Sync registration failed, not critical
        console.warn("[SW] Background sync not available")
      }
    }
  }

  /**
   * Check if there's a newer version and prompt the user
   */
  onUpdateAvailable(callback: () => void): () => void {
    const handler = (status: SWStatus) => {
      if (status.updateAvailable) callback()
    }
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }
}

export default ServiceWorkerManager.getInstance()