// Create a utility file to handle environment variables safely

// Define a type for our environment
interface ProcessEnv {
  NODE_ENV: "development" | "production" | "test"
  [key: string]: string | undefined
}

// Create a safe process.env object
export const processEnv: ProcessEnv = {
  NODE_ENV:
    typeof process !== "undefined" && process.env && process.env.NODE_ENV
      ? (process.env.NODE_ENV as "development" | "production" | "test")
      : "development",
}

// Helper function to check if we're in development mode
export const isDevelopment = (): boolean => {
  return processEnv.NODE_ENV === "development"
}
