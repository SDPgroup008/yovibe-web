// Web-only implementation of LocationService

/**
 * A simplified location service for web
 */
class LocationService {
  /**
   * Request location permissions from the user
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (navigator.geolocation) {
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
   */
  async getCurrentPosition() {
    return new Promise<{
      latitude: number
      longitude: number
      accuracy: number | null
      timestamp: number
    }>((resolve, reject) => {
      if (!navigator.geolocation) {
        // Return a default location if geolocation is not available
        resolve({
          latitude: 37.78825,
          longitude: -122.4324,
          accuracy: null,
          timestamp: Date.now(),
        })
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          })
        },
        (error) => {
          console.error("Error getting current position:", error)
          // Return a default location if there's an error
          resolve({
            latitude: 37.78825,
            longitude: -122.4324,
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
   */
  watchPosition(
    callback: (location: {
      latitude: number
      longitude: number
      accuracy?: number | null
      timestamp?: number
    }) => void,
  ) {
    if (!navigator.geolocation) {
      return { remove: () => {} }
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
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
