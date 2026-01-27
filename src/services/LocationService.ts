// Web-only implementation of LocationService
/**
 * A simplified location service for web
 *
 * Notes:
 * - This service returns latitude and longitude as JavaScript numbers
 *   with full precision provided by the browser's Geolocation API.
 * - It intentionally does not round or truncate coordinates so you can
 *   store values like 0.3320980424528121 and 32.57044069029549.
 */

class LocationService {
  /**
   * Request location permissions from the user
   */
  async requestPermissions(): Promise<boolean> {
    try {
      // If the browser exposes navigator.geolocation, we consider permission
      // request possible. Actual permission prompt happens when getCurrentPosition
      // or watchPosition is called in most browsers.
      if (typeof navigator !== "undefined" && "geolocation" in navigator) {
        return true
      }
      return false
    } catch (error) {
      console.error("Error requesting location permissions:", error)
      return false
    }
  }

  /**
   * Get the current position of the device
   *
   * Returns an object with numeric latitude and longitude (no rounding),
   * accuracy (number | null) and timestamp (ms).
   */
  async getCurrentPosition() {
    return new Promise<{
      latitude: number
      longitude: number
      accuracy: number | null
      timestamp: number
    }>((resolve) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        // Return a default location if geolocation is not available.
        // Use more precise defaults if you prefer; these are example values.
        resolve({
          latitude: 0.3320980424528121,
          longitude: 32.57044069029549,
          accuracy: null,
          timestamp: Date.now(),
        })
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Use the raw numeric values provided by the browser.
          // Do not round or format them here so full precision is preserved.
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy:
              typeof position.coords.accuracy === "number" ? position.coords.accuracy : null,
            timestamp: position.timestamp ?? Date.now(),
          })
        },
        (error) => {
          console.error("Error getting current position:", error)
          // Return a default location if there's an error. Use precise example defaults.
          resolve({
            latitude: 0.3320980424528121,
            longitude: 32.57044069029549,
            accuracy: null,
            timestamp: Date.now(),
          })
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      )
    })
  }

  /**
   * Watch for location changes
   *
   * The callback receives numeric latitude and longitude values (no rounding).
   * Returns an object with a remove() method to stop watching.
   */
  watchPosition(
    callback: (location: {
      latitude: number
      longitude: number
      accuracy?: number | null
      timestamp?: number
    }) => void,
  ) {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return { remove: () => {} }
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy:
            typeof position.coords.accuracy === "number" ? position.coords.accuracy : null,
          timestamp: position.timestamp ?? Date.now(),
        })
      },
      (error) => {
        console.error("Error watching position:", error)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    )

    return {
      remove: () => {
        navigator.geolocation.clearWatch(watchId)
      },
    }
  }
}

export default new LocationService()
