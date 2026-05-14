import { createNavigationContainerRef } from "@react-navigation/native"

// Create a properly typed navigation reference
// Using 'any' for the generic parameter to make it more flexible
export const navigationRef = createNavigationContainerRef<any>()

// Function to navigate to a specific screen
export function navigate(name: string, params?: object) {
  if (navigationRef.isReady()) {
    // Use the correct approach for navigation
    navigationRef.navigate({
      name,
      params,
    } as never)
  } else {
    // You might want to store the navigation action and execute it when the ref is ready
    console.warn("Navigation attempted before navigationRef was ready")
  }
}

// Function to reset the navigation state
export function reset(state: any) {
  if (navigationRef.isReady()) {
    navigationRef.reset(state)
  } else {
    console.warn("Navigation reset attempted before navigationRef was ready")
  }
}
