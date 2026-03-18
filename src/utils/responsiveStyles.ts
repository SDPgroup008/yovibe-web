"use client"

import { StyleSheet, ViewStyle, TextStyle, Platform } from "react-native"
import { useResponsive, useSpacing, useFontScale, useGap, useTouchTarget, BREAKPOINTS } from "./responsive"

// Type definitions for style functions
export type ResponsiveStyleFunction = (params: {
  screenSize: ReturnType<typeof useResponsive>
  spacing: ReturnType<typeof useSpacing>
  fonts: ReturnType<typeof useFontScale>
  gap: number
  touchTarget: number
}) => ViewStyle | TextStyle

// Base responsive styles that can be used with StyleSheet
export const createResponsiveStyles = (
  styleGetter: ResponsiveStyleFunction
): ViewStyle | TextStyle => {
  const screenSize = useResponsive()
  const spacing = useSpacing()
  const fonts = useFontScale()
  const gap = useGap()
  const touchTarget = useTouchTarget()
  
  return styleGetter({ screenSize, spacing, fonts, gap, touchTarget })
}

// Pre-built responsive style creators
export const responsiveStyles = {
  // Container styles
  container: (isFullHeight = true): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    
    return {
      flex: isFullHeight ? 1 : 0,
      backgroundColor: "#0A0A0A",
    }
  },
  
  // Screen container with proper padding
  screenContainer: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const padding = isPhone ? 16 : isTablet ? 24 : 32
    
    return {
      flex: 1,
      backgroundColor: "#0A0A0A",
      paddingHorizontal: padding,
    }
  },
  
  // Centered content container
  centeredContainer: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const padding = isPhone ? 16 : isTablet ? 32 : 48
    
    return {
      flex: 1,
      backgroundColor: "#0A0A0A",
      paddingHorizontal: padding,
      justifyContent: "center",
      alignItems: "center",
    }
  },
  
  // Header styles
  header: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const paddingTop = Platform.OS === "ios" ? (isPhone ? 50 : 60) : (isPhone ? 30 : 40)
    const paddingHorizontal = isPhone ? 16 : isTablet ? 24 : 32
    
    return {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal,
      paddingTop,
      paddingBottom: 16,
      backgroundColor: "#1A1A2E",
    }
  },
  
  // Header title
  headerTitle: (): TextStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const fontSize = isPhone ? 24 : isTablet ? 28 : 32
    
    return {
      fontSize,
      fontWeight: "800",
      color: "#FFFFFF",
      textShadowColor: "rgba(0, 212, 255, 0.3)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    }
  },
  
  // Card styles
  card: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const marginHorizontal = isPhone ? 16 : isTablet ? 24 : 32
    const marginBottom = isPhone ? 20 : isTablet ? 28 : 32
    const borderRadius = isPhone ? 16 : isTablet ? 20 : 24
    
    return {
      marginHorizontal,
      marginBottom,
      borderRadius,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 12,
    }
  },
  
  // Button styles
  button: (isPrimary = true): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const paddingVertical = isPhone ? 14 : isTablet ? 16 : 18
    const paddingHorizontal = isPhone ? 24 : isTablet ? 32 : 40
    const borderRadius = isPhone ? 12 : isTablet ? 14 : 16
    const fontSize = isPhone ? 14 : isTablet ? 16 : 18
    
    return {
      paddingVertical,
      paddingHorizontal,
      borderRadius,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isPrimary ? "#00D4FF" : "transparent",
      borderWidth: isPrimary ? 0 : 2,
      borderColor: "#00D4FF",
      minHeight: 44,
    }
  },
  
  // Input styles
  input: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const padding = isPhone ? 14 : isTablet ? 16 : 18
    const fontSize = isPhone ? 14 : isTablet ? 16 : 18
    const borderRadius = isPhone ? 10 : isTablet ? 12 : 14
    
    return {
      backgroundColor: "#1E1E1E",
      borderRadius,
      padding,
      color: "#FFFFFF",
      fontSize,
      borderWidth: 1,
      borderColor: "#333",
      minHeight: 48,
    }
  },
  
  // Tab bar styles
  tabBar: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const height = isPhone ? 60 : isTablet ? 70 : 80
    const paddingBottom = Platform.OS === "ios" ? (isPhone ? 20 : 24) : (isPhone ? 8 : 12)
    
    return {
      flexDirection: "row",
      backgroundColor: "#121212",
      borderTopWidth: 1,
      borderTopColor: "#333",
      height: height + paddingBottom,
      paddingBottom,
      paddingHorizontal: isPhone ? 8 : 16,
      justifyContent: "space-around",
      alignItems: "center",
    }
  },
  
  // Grid layout
  gridContainer: (columns: number = 2): ViewStyle => {
    const gap = useGap()
    
    return {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -gap / 2,
    }
  },
  
  gridItem: (columns: number = 2): ViewStyle => {
    const gap = useGap()
    const itemWidth = (100 / columns) + "%"
    
    return {
      width: itemWidth as unknown as number,
      paddingHorizontal: gap / 2,
      marginBottom: gap,
    }
  },
  
  // Image styles
  responsiveImage: (aspectRatio?: number): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const height = isPhone ? 200 : isTablet ? 280 : 350
    
    return {
      width: "100%",
      height: aspectRatio ? undefined : height,
      aspectRatio: aspectRatio || undefined,
    }
  },
  
  // Text styles
  text: (): TextStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const fontSize = isPhone ? 14 : isTablet ? 16 : 18
    
    return {
      fontSize,
      color: "#FFFFFF",
      lineHeight: isPhone ? 20 : isTablet ? 24 : 28,
    }
  },
  
  textHeading: (level: 1 | 2 | 3 | 4 | 5 | 6 = 1): TextStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    
    const sizes = {
      1: isPhone ? 28 : isTablet ? 32 : 40,
      2: isPhone ? 24 : isTablet ? 28 : 32,
      3: isPhone ? 20 : isTablet ? 22 : 24,
      4: isPhone ? 18 : isTablet ? 20 : 22,
      5: isPhone ? 16 : isTablet ? 18 : 20,
      6: isPhone ? 14 : isTablet ? 16 : 18,
    }
    
    return {
      fontSize: sizes[level],
      fontWeight: "700",
      color: "#FFFFFF",
    }
  },
  
  // Section styles
  section: (): ViewStyle => {
    const spacing = useSpacing()
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const marginTop = isPhone ? 24 : isTablet ? 32 : 40
    
    return {
      marginTop,
      marginBottom: spacing.lg,
    }
  },
  
  // List item styles
  listItem: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const padding = isPhone ? 12 : isTablet ? 16 : 20
    const borderRadius = isPhone ? 12 : isTablet ? 14 : 16
    
    return {
      flexDirection: "row",
      alignItems: "center",
      padding,
      backgroundColor: "#1E1E1E",
      borderRadius,
      marginBottom: 12,
    }
  },
  
  // Floating action button
  fab: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const size = isPhone ? 56 : isTablet ? 64 : 72
    const right = isPhone ? 20 : isTablet ? 28 : 32
    const bottom = isPhone ? 80 : isTablet ? 90 : 100
    
    return {
      position: "absolute",
      right,
      bottom,
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: "#00D4FF",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#00D4FF",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    }
  },
  
  // Modal styles
  modal: (): ViewStyle => {
    const { isPhone, isTablet, isDesktop } = useResponsive()
    const borderRadius = isPhone ? 20 : isTablet ? 24 : 28
    const padding = isPhone ? 20 : isTablet ? 28 : 32
    
    return {
      backgroundColor: "#1A1A2E",
      borderTopLeftRadius: borderRadius,
      borderTopRightRadius: borderRadius,
      borderBottomLeftRadius: borderRadius,
      borderBottomRightRadius: borderRadius,
      padding,
      maxHeight: "90%",
    }
  },
  
  // Bottom sheet
  bottomSheet: (): ViewStyle => {
    const { isPhone, isTablet } = useResponsive()
    const borderRadius = isPhone ? 24 : isTablet ? 28 : 32
    
    return {
      backgroundColor: "#1A1A2E",
      borderTopLeftRadius: borderRadius,
      borderTopRightRadius: borderRadius,
      paddingTop: 24,
      paddingHorizontal: 20,
      paddingBottom: 40,
    }
  },
}

// Utility function to create responsive styles in a StyleSheet
export const rs = (
  styles: {
    phone?: ViewStyle | TextStyle
    tablet?: ViewStyle | TextStyle
    desktop?: ViewStyle | TextStyle
    portrait?: ViewStyle | TextStyle
    landscape?: ViewStyle | TextStyle
  }
): ViewStyle | TextStyle => {
  const { isPhone, isTablet, isDesktop, isPortrait, isLandscape } = useResponsive()
  
  // Mobile-first: start with phone styles, then override
  let finalStyle: ViewStyle | TextStyle = {}
  
  if (isPhone && styles.phone) {
    finalStyle = { ...finalStyle, ...styles.phone }
  } else if (isTablet && styles.tablet) {
    finalStyle = { ...finalStyle, ...styles.tablet }
  } else if (isDesktop && styles.desktop) {
    finalStyle = { ...finalStyle, ...styles.desktop }
  } else if (styles.phone) {
    // Fallback to phone styles
    finalStyle = { ...finalStyle, ...styles.phone }
  }
  
  // Orientation overrides
  if (isPortrait && styles.portrait) {
    finalStyle = { ...finalStyle, ...styles.portrait }
  } else if (isLandscape && styles.landscape) {
    finalStyle = { ...finalStyle, ...styles.landscape }
  }
  
  return finalStyle
}

// Conditional style helper
export const ifPhone = (phoneStyle: ViewStyle | TextStyle, tabletStyle?: ViewStyle | TextStyle): ViewStyle | TextStyle => {
  const { isPhone } = useResponsive()
  return isPhone ? phoneStyle : (tabletStyle || phoneStyle)
}

export const ifTablet = (tabletStyle: ViewStyle | TextStyle, phoneStyle?: ViewStyle | TextStyle): ViewStyle | TextStyle => {
  const { isTablet } = useResponsive()
  return isTablet ? tabletStyle : (phoneStyle || tabletStyle)
}

export const ifLandscape = (landscapeStyle: ViewStyle | TextStyle, portraitStyle?: ViewStyle | TextStyle): ViewStyle | TextStyle => {
  const { isLandscape } = useResponsive()
  return isLandscape ? landscapeStyle : (portraitStyle || landscapeStyle)
}

// Width-based style helper
export const ifWidth = (
  condition: (width: number) => boolean,
  trueStyle: ViewStyle | TextStyle,
  falseStyle?: ViewStyle | TextStyle
): ViewStyle | TextStyle => {
  const { width } = useResponsive()
  return condition(width) ? trueStyle : (falseStyle || {})
}

export default {
  createResponsiveStyles,
  responsiveStyles,
  rs,
  ifPhone,
  ifTablet,
  ifLandscape,
  ifWidth,
}
