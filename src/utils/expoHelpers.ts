/**
 * Helper functions for Expo compatibility
 */

// Polyfill for isRunningInExpoGo if it's not available
export const isRunningInExpoGo = () => {
  // This is a simplified check - in a real app you might want to do more sophisticated detection
  return false
}
