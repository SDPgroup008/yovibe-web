/**
 * Polyfills for Expo functions that might be missing or causing issues
 */

// Simple implementation of isRunningInExpoGo that doesn't rely on modifying global objects
export const isRunningInExpoGo = (): boolean => {
  // This is a simplified implementation
  // In a real app, you might want to do more sophisticated detection
  return false
}

// Export other polyfills as needed
