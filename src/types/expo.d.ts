// This file adds missing type definitions for Expo

// Only declare what we're actually using to avoid conflicts
declare module "expo" {
  // Add the isRunningInExpoGo function if it doesn't exist
  export function isRunningInExpoGo(): boolean
}
