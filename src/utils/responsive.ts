"use client"

import { useWindowDimensions, Platform, Dimensions } from "react-native"
import { useState, useEffect } from "react"

// Breakpoint constants
export const BREAKPOINTS = {
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1536,
}

// Device types
export type DeviceType = "phone" | "tablet" | "desktop"

// Orientation types
export type Orientation = "portrait" | "landscape"

// Get device type based on width
export const getDeviceType = (width: number): DeviceType => {
  if (width < BREAKPOINTS.md) return "phone"
  if (width < BREAKPOINTS.lg) return "tablet"
  return "desktop"
}

// Get orientation based on width/height
export const getOrientation = (width: number, height: number): Orientation => {
  return width > height ? "landscape" : "portrait"
}

// Check if current breakpoint is at or above a certain size
export const isAtBreakpoint = (width: number, breakpoint: keyof typeof BREAKPOINTS): boolean => {
  return width >= BREAKPOINTS[breakpoint]
}

// Responsive hook that returns device info
export const useResponsive = () => {
  const { width, height } = useWindowDimensions()
  
  return {
    width,
    height,
    isSmallPhone: width < 360,
    isPhone: width < BREAKPOINTS.md,
    isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
    isLargeDesktop: width >= BREAKPOINTS.xl,
    deviceType: getDeviceType(width),
    orientation: getOrientation(width, height),
    isLandscape: width > height,
    isPortrait: width <= height,
    // Breakpoint checks
    isXs: width >= BREAKPOINTS.xs,
    isSm: width >= BREAKPOINTS.sm,
    isMd: width >= BREAKPOINTS.md,
    isLg: width >= BREAKPOINTS.lg,
    isXl: width >= BREAKPOINTS.xl,
    // Common responsive values
    isNarrow: width < 400,
    isWide: width > 600,
  }
}

// Hook for responsive font sizes
export const useResponsiveFontSize = (options: {
  phone?: number
  tablet?: number
  desktop?: number
}): number => {
  const { isPhone, isTablet, isDesktop } = useResponsive()
  
  if (isDesktop && options.desktop) return options.desktop
  if (isTablet && options.tablet) return options.tablet
  return options.phone || 14
}

// Hook for responsive spacing
export const useResponsiveSpacing = (options: {
  phone?: number
  tablet?: number
  desktop?: number
}): number => {
  const { isPhone, isTablet, isDesktop } = useResponsive()
  
  if (isDesktop && options.desktop) return options.desktop
  if (isTablet && options.tablet) return options.tablet
  return options.phone || 16
}

// Responsive value helper - returns value based on device type
export function responsiveValue<T>(values: {
  phone?: T
  tablet?: T
  desktop?: T
}, width: number): T {
  const deviceType = getDeviceType(width)
  
  if (deviceType === "desktop" && values.desktop !== undefined) return values.desktop
  if (deviceType === "tablet" && values.tablet !== undefined) return values.tablet
  if (values.phone !== undefined) return values.phone
  
  // Return first defined value as fallback
  const vals = values as Record<string, T>
  return vals.phone ?? vals.tablet ?? vals.desktop
}

// Theme colors (matching existing dark theme)
export const colors = {
  // Backgrounds
  background: "#121212",
  backgroundLight: "#1A1A2E",
  backgroundLighter: "#252540",
  surface: "#0A0A0A",
  
  // Primary accent
  primary: "#2196F3",
  primaryDark: "#1976D2",
  primaryLight: "#64B5F6",
  
  // Text
  text: "#FFFFFF",
  textSecondary: "rgba(255, 255, 255, 0.7)",
  textMuted: "rgba(255, 255, 255, 0.5)",
  
  // Accent colors
  accent: "#2196F3",
  accentPink: "#FF4081",
  accentPurple: "#9C27B0",
  accentCyan: "#00BCD4",
  accentGreen: "#4CAF50",
  accentOrange: "#FF9800",
  
  // Borders
  border: "#333333",
  borderLight: "#444444",
  
  // Status
  success: "#4CAF50",
  error: "#FF5252",
  warning: "#FF9800",
  info: "#2196F3",
  
  // Overlays
  overlay: "rgba(0, 0, 0, 0.7)",
  overlayLight: "rgba(0, 0, 0, 0.5)",
}

// Spacing scale
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

// Font sizes
export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
}

// Border radius
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
}

// Shadows (for web)
export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
}

// Responsive font size function
export const getFontSize = (width: number, baseSize: number): number => {
  const deviceType = getDeviceType(width)
  
  if (deviceType === "desktop") return baseSize * 1.2
  if (deviceType === "tablet") return baseSize * 1.1
  return baseSize
}

// Responsive spacing function
export const getSpacing = (width: number, baseSpacing: number): number => {
  const deviceType = getDeviceType(width)
  
  if (deviceType === "desktop") return baseSpacing * 1.5
  if (deviceType === "tablet") return baseSpacing * 1.25
  return baseSpacing
}

// Responsive container width
export const getContainerWidth = (width: number, maxWidth: number = 1200): number => {
  if (width >= maxWidth) return maxWidth
  if (width >= BREAKPOINTS.lg) return width * 0.9
  if (width >= BREAKPOINTS.md) return width * 0.92
  return width
}

// Grid columns based on screen width
export const getGridColumns = (width: number): number => {
  if (width >= BREAKPOINTS.xl) return 4
  if (width >= BREAKPOINTS.lg) return 3
  if (width >= BREAKPOINTS.md) return 2
  return 1
}

// Card dimensions
export const getCardDimensions = (width: number) => {
  const columns = getGridColumns(width)
  const padding = width >= BREAKPOINTS.md ? 24 : 16
  const gap = width >= BREAKPOINTS.md ? 20 : 12
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns
  
  return {
    cardWidth,
    cardHeight: cardWidth * 1.3,
    padding,
    gap,
  }
}

// Touch target sizes (for accessibility)
export const touchTargets = {
  minimum: 44,
  comfortable: 48,
  large: 56,
}

// Animation durations
export const animations = {
  fast: 150,
  normal: 300,
  slow: 500,
}

// Easing functions
export const easing = {
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  decelerate: "cubic-bezier(0, 0, 0.2, 1)",
  accelerate: "cubic-bezier(0.4, 0, 1, 1)",
}

// Platform-specific helpers
export const isWeb = Platform.OS === "web"
export const isNative = Platform.OS === "ios" || Platform.OS === "android"

// Get current window dimensions
export const getWindowDimensions = () => {
  const { width, height } = Dimensions.get("window")
  return { width, height }
}

export default {
  BREAKPOINTS,
  colors,
  spacing,
  fontSize,
  borderRadius,
  shadows,
  touchTargets,
  animations,
  easing,
  useResponsive,
  useResponsiveFontSize,
  useResponsiveSpacing,
  responsiveValue,
  getFontSize,
  getSpacing,
  getContainerWidth,
  getGridColumns,
  getCardDimensions,
  isWeb,
  isNative,
  getWindowDimensions,
}
