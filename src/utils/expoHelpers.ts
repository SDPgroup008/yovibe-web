/**
 * Helper functions for Expo compatibility
 */

// Polyfill for isRunningInExpoGo if it's not available
export const isRunningInExpoGo = () => {
  // This is a simplified check - in a real app you might want to do more sophisticated detection
  return false
}

/**
 * Convert a Blob to a data URL string
 * @param blob - The blob to convert
 * @returns Promise resolving to the data URL string
 */
export const blobToDataURL = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      // reader.result will be the data URL string
      resolve(reader.result as string)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
