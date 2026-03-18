"use client"

import { useState, useEffect } from "react"
import { Dimensions, Platform, ScaledSize, useWindowDimensions } from "react-native"

// Breakpoint constants
export const BREAKPOINTS = {
  xs: 0,      // Extra small (phones in portrait)
  sm: 480,    // Small (larger phones, small tablets)
  md: 768,    // Medium (tablets in portrait)
  lg: 1024,   // Large (tablets in landscape, small laptops)
  xl: 1280,   // Extra large (laptops, desktops)
  xxl: 1536,  // Double extra large (large desktops)
}

// Device type constants
export const DEVICE_TYPES = {
  PHONE: "phone",
  TABLET: "tablet",
  DESKTOP: "desktop",
} as const

export type DeviceType = typeof DEVICE_TYPES[keyof typeof DEVICE_TYPES]

// Orientation constants
export const ORIENTATIONS = {
  PORTRAIT: "portrait",
  LANDSCAPE: "landscape",
} as const

export type Orientation = typeof ORIENTATIONS[keyof typeof ORIENTATIONS]

// Screen size info interface
export interface ScreenSize {
  width: number
  height: number
  isSmall: boolean        // < 480px
  isMedium: boolean       // 480px - 768px
  isLarge: boolean        // 768px - 1024px
  isExtraLarge: boolean   // > 1024px
  isPhone: boolean        // < 768px
  isTablet: boolean       // >= 768px && < 1024px
  isDesktop: boolean      // >= 1024px
  deviceType: DeviceType
  orientation: Orientation
  isPortrait: boolean
  isLandscape: boolean
}

// Get initial screen size (SSR-safe)
const getInitialScreenSize = (): ScreenSize => {
  if (typeof window === "undefined") {
    // Default values for SSR
    return {
      width: 375,
      height: 812,
      isSmall: true,
      isMedium: false,
      isLarge: false,
      isExtraLarge: false,
      isPhone: true,
      isTablet: false,
      isDesktop: false,
      deviceType: DEVICE_TYPES.PHONE,
      orientation: ORIENTATIONS.PORTRAIT,
      isPortrait: true,
      isLandscape: false,
    }
  }
  
  const { width, height } = window.screen
  return calculateScreenSize(width, height)
}

// Calculate screen size based on dimensions
const calculateScreenSize = (width: number, height: number): ScreenSize => {
  const isPortrait = height >= width
  const isLandscape = width > height
  
  // Determine breakpoint ranges
  const isSmall = width < BREAKPOINTS.sm
  const isMedium = width >= BREAKPOINTS.sm && width < BREAKPOINTS.md
  const isLarge = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg
  const isExtraLarge = width >= BREAKPOINTS.lg
  
  // Determine device type
  const isPhone = width < BREAKPOINTS.md
  const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg
  const isDesktop = width >= BREAKPOINTS.lg
  
  let deviceType: DeviceType = DEVICE_TYPES.PHONE
  if (isTablet) deviceType = DEVICE_TYPES.TABLET
  else if (isDesktop) deviceType = DEVICE_TYPES.DESKTOP
  
  return {
    width,
    height,
    isSmall,
    isMedium,
    isLarge,
    isExtraLarge,
    isPhone,
    isTablet,
    isDesktop,
    deviceType,
    orientation: isPortrait ? ORIENTATIONS.PORTRAIT : ORIENTATIONS.LANDSCAPE,
    isPortrait,
    isLandscape,
  }
}

// Custom hook for responsive design
export const useResponsive = (): ScreenSize => {
  const windowDimensions = useWindowDimensions()
  
  const [screenSize, setScreenSize] = useState<ScreenSize>(() => 
    calculateScreenSize(windowDimensions.width, windowDimensions.height)
  )
  
  useEffect(() => {
    const newSize = calculateScreenSize(windowDimensions.width, windowDimensions.height)
    setScreenSize(prevSize => {
      // Only update if actually different to prevent unnecessary re-renders
      if (prevSize.width !== newSize.width || prevSize.height !== newSize.height) {
        return newSize
      }
      return prevSize
    })
  }, [windowDimensions.width, windowDimensions.height])
  
  return screenSize
}

// Hook for checking specific breakpoint
export const useBreakpoint = (breakpoint: keyof typeof BREAKPOINTS): boolean => {
  const { width } = useResponsive()
  return width >= BREAKPOINTS[breakpoint]
}

// Hook for device type
export const useDeviceType = (): DeviceType => {
  const { deviceType } = useResponsive()
  return deviceType
}

// Hook for orientation
export const useOrientation = (): Orientation => {
  const { orientation } = useResponsive()
  return orientation
}

// Responsive value helper - returns different values based on screen size
export const useResponsiveValue = <T>(values: {
  default?: T
  xs?: T
  sm?: T
  md?: T
  lg?: T
  xl?: T
  xxl?: T
}): T => {
  const { width } = useResponsive()
  
  // Return the most appropriate value based on current width
  if (width >= BREAKPOINTS.xxl && values.xxl) return values.xxl
  if (width >= BREAKPOINTS.xl && values.xl) return values.xl
  if (width >= BREAKPOINTS.lg && values.lg) return values.lg
  if (width >= BREAKPOINTS.md && values.md) return values.md
  if (width >= BREAKPOINTS.sm && values.sm) return values.sm
  if (values.xs) return values.xs
  if (values.default) return values.default
  
  // Fallback
  return values.default as T
}

// Style helper functions for responsive values
export const responsiveStyle = <T extends Record<string, unknown>>(
  styleGetter: (screenSize: ScreenSize) => T
) => {
  const screenSize = useResponsive()
  return styleGetter(screenSize)
}

// Spacing scale based on screen size
export const useSpacing = () => {
  const { isPhone, isTablet, isDesktop } = useResponsive()
  
  return {
    // Base spacing (for phones)
    xs: isPhone ? 4 : isTablet ? 6 : 8,
    sm: isPhone ? 8 : isTablet ? 12 : 16,
    md: isPhone ? 16 : isTablet ? 20 : 24,
    lg: isPhone ? 20 : isTablet ? 28 : 32,
    xl: isPhone ? 24 : isTablet ? 32 : 40,
    xxl: isPhone ? 32 : isTablet ? 40 : 48,
    // Container widths
    containerPadding: isPhone ? 16 : isTablet ? 24 : 32,
    containerMaxWidth: isPhone ? "100%" : isTablet ? 720 : 1200,
  }
}

// Font size scale based on screen size
export const useFontScale = () => {
  const { isPhone, isTablet, isDesktop } = useResponsive()
  
  return {
    xs: isPhone ? 10 : isTablet ? 11 : 12,
    sm: isPhone ? 12 : isTablet ? 13 : 14,
    base: isPhone ? 14 : isTablet ? 15 : 16,
    md: isPhone ? 16 : isTablet ? 18 : 20,
    lg: isPhone ? 18 : isTablet ? 20 : 22,
    xl: isPhone ? 20 : isTablet ? 24 : 28,
    xxl: isPhone ? 24 : isTablet ? 28 : 32,
    xxxl: isPhone ? 28 : isTablet ? 32 : 40,
    display: isPhone ? 32 : isTablet ? 40 : 48,
  }
}

// Grid column count based on screen size
export const useGridColumns = (options?: {
  phone?: number
  tablet?: number
  desktop?: number
}): number => {
  const { isPhone, isTablet, isDesktop } = useResponsive()
  
  if (isPhone) return options?.phone || 1
  if (isTablet) return options?.tablet || 2
  return options?.desktop || 3
}

// Gap size for grids/flex
export const useGap = () => {
  const { isPhone, isTablet, isDesktop } = useResponsive()
  
  return isPhone ? 12 : isTablet ? 16 : 24
}

// Touch target minimum size (44px for accessibility on mobile)
export const useTouchTarget = () => {
  const { isPhone } = useResponsive()
  return isPhone ? 44 : 36
}

// Export a simple isWeb check for platform-specific code
export const isWeb = Platform.OS === "web"

// Get current viewport info for debugging
export const getViewportInfo = (): string => {
  if (typeof window === "undefined") return "SSR"
  return `Viewport: ${window.innerWidth}x${window.innerHeight}`
}

// Debounced resize handler hook
export const useDebouncedResize = (delay: number = 150) => {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  })
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    
    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }, delay)
    }
    
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
      clearTimeout(timeoutId)
    }
  }, [delay])
  
  return dimensions
}

export default {
  BREAKPOINTS,
  DEVICE_TYPES,
  ORIENTATIONS,
  useResponsive,
  useBreakpoint,
  useDeviceType,
  useOrientation,
  useResponsiveValue,
  responsiveStyle,
  useSpacing,
  useFontScale,
  useGridColumns,
  useGap,
  useTouchTarget,
  isWeb,
  getViewportInfo,
  useDebouncedResize,
}
