"use client"

import React from "react"
import { View, ViewStyle, StyleSheet, Platform, DimensionValue } from "react-native"
import { useResponsive, useSpacing, useGap, useFontScale, useTouchTarget } from "../utils/responsive"

// Type for dimension values (allows both number and string)
type DValue = DimensionValue | undefined

// ResponsiveView - A View that adapts to screen size
interface ResponsiveViewProps {
  children?: React.ReactNode
  style?: ViewStyle
  // Layout props
  flex?: number
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
  flexWrap?: "wrap" | "nowrap"
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly"
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
  alignContent?: "flex-start" | "flex-end" | "center" | "stretch" | "space-between" | "space-around"
  // Spacing props
  padding?: number
  paddingHorizontal?: number
  paddingVertical?: number
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  margin?: number
  marginHorizontal?: number
  marginVertical?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  // Size props
  width?: DValue
  height?: DValue
  maxWidth?: DValue
  maxHeight?: DValue
  minWidth?: DValue
  minHeight?: DValue
  // Border props
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  // Background props
  backgroundColor?: string
  // Position props
  position?: "absolute" | "relative"
  top?: number
  bottom?: number
  left?: number
  right?: number
  // Overflow
  overflow?: "visible" | "hidden" | "scroll"
  // Responsive-only props (applied based on screen size)
  phone?: Partial<ViewStyle>
  tablet?: Partial<ViewStyle>
  desktop?: Partial<ViewStyle>
}

export const ResponsiveView: React.FC<ResponsiveViewProps> = ({
  children,
  style,
  phone,
  tablet,
  desktop,
  ...props
}) => {
  const { isPhone, isTablet, isDesktop, width } = useResponsive()

  // Determine which responsive style to apply
  let responsiveStyle: ViewStyle = {}
  if (isPhone && phone) {
    responsiveStyle = phone as ViewStyle
  } else if (isTablet && tablet) {
    responsiveStyle = tablet as ViewStyle
  } else if (isDesktop && desktop) {
    responsiveStyle = desktop as ViewStyle
  }

  // Create clean style object without the responsive props
  const { phone: _, tablet: __, desktop: ___, ...cleanProps } = props as Record<string, unknown>
  
  return (
    <View style={[cleanProps as ViewStyle, responsiveStyle, style]}>
      {children}
    </View>
  )
}

// ResponsivePadding - Quick responsive padding component
interface ResponsivePaddingProps {
  children?: React.ReactNode
  style?: ViewStyle
  horizontal?: boolean
  vertical?: boolean
  all?: boolean
}

export const ResponsivePadding: React.FC<ResponsivePaddingProps> = ({
  children,
  style,
  horizontal,
  vertical,
  all,
}) => {
  const spacing = useSpacing()
  const { isPhone, isTablet, isDesktop } = useResponsive()

  const paddingValue = isPhone ? spacing.sm : isTablet ? spacing.md : spacing.lg

  const paddingStyle: ViewStyle = {
    ...(all && { padding: paddingValue }),
    ...(horizontal && { paddingHorizontal: paddingValue }),
    ...(vertical && { paddingVertical: paddingValue }),
  }

  return <View style={[paddingStyle, style]}>{children}</View>
}

// ResponsiveMargin - Quick responsive margin component
interface ResponsiveMarginProps {
  children?: React.ReactNode
  style?: ViewStyle
  horizontal?: boolean
  vertical?: boolean
  all?: boolean
}

export const ResponsiveMargin: React.FC<ResponsiveMarginProps> = ({
  children,
  style,
  horizontal,
  vertical,
  all,
}) => {
  const spacing = useSpacing()
  const { isPhone, isTablet, isDesktop } = useResponsive()

  const marginValue = isPhone ? spacing.sm : isTablet ? spacing.md : spacing.lg

  const marginStyle: ViewStyle = {
    ...(all && { margin: marginValue }),
    ...(horizontal && { marginHorizontal: marginValue }),
    ...(vertical && { marginVertical: marginValue }),
  }

  return <View style={[marginStyle, style]}>{children}</View>
}

// ScreenContainer - Main container for screens
interface ScreenContainerProps {
  children?: React.ReactNode
  style?: ViewStyle
  padded?: boolean
  scrollable?: boolean
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  style,
  padded = true,
}) => {
  const spacing = useSpacing()
  const { isPhone, isTablet, isDesktop } = useResponsive()

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: "#0A0A0A",
    ...(padded && {
      paddingHorizontal: spacing.containerPadding as number,
    }),
  }

  return <View style={[containerStyle, style]}>{children}</View>
}

// CenteredContainer - Center content in container
interface CenteredContainerProps {
  children?: React.ReactNode
  style?: ViewStyle
}

export const CenteredContainer: React.FC<CenteredContainerProps> = ({
  children,
  style,
}) => {
  const spacing = useSpacing()
  const { isPhone, isTablet, isDesktop } = useResponsive()

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: "#0A0A0A",
    paddingHorizontal: spacing.xl as number,
    justifyContent: "center",
    alignItems: "center",
  }

  return <View style={[containerStyle, style]}>{children}</View>
}

// Row - Quick row layout
interface RowProps {
  children?: React.ReactNode
  style?: ViewStyle
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly"
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
  gap?: number
}

export const Row: React.FC<RowProps> = ({
  children,
  style,
  justifyContent,
  alignItems,
  gap,
}) => {
  const gapValue = useGap()

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    ...(justifyContent && { justifyContent }),
    ...(alignItems && { alignItems }),
    ...(gap && { gap: gapValue }),
  }

  return <View style={[rowStyle, style]}>{children}</View>
}

// Column - Quick column layout
interface ColumnProps {
  children?: React.ReactNode
  style?: ViewStyle
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly"
  alignItems?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline"
  gap?: number
}

export const Column: React.FC<ColumnProps> = ({
  children,
  style,
  justifyContent,
  alignItems,
  gap,
}) => {
  const gapValue = useGap()

  const columnStyle: ViewStyle = {
    flexDirection: "column",
    ...(justifyContent && { justifyContent }),
    ...(alignItems && { alignItems }),
    ...(gap && { gap: gapValue }),
  }

  return <View style={[columnStyle, style]}>{children}</View>
}

// Card - Responsive card component
interface CardProps {
  children?: React.ReactNode
  style?: ViewStyle
  elevated?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  elevated = true,
}) => {
  const { isPhone, isTablet, isDesktop } = useResponsive()

  const borderRadius = isPhone ? 16 : isTablet ? 20 : 24

  const cardStyle: ViewStyle = {
    backgroundColor: "#1A1A2E",
    borderRadius,
    overflow: "hidden",
    ...(elevated && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 12,
    }),
  }

  return <View style={[cardStyle, style]}>{children}</View>
}

// Divider - Horizontal divider
interface DividerProps {
  style?: ViewStyle
  spacing?: "none" | "small" | "medium" | "large"
}

export const Divider: React.FC<DividerProps> = ({
  style,
  spacing = "medium",
}) => {
  const spacingValue = {
    none: 0,
    small: 8,
    medium: 16,
    large: 24,
  }[spacing]

  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: "#333",
          marginVertical: spacingValue,
        },
        style,
      ]}
    />
  )
}

// Spacer - Empty space component
interface SpacerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl"
  horizontal?: boolean
}

export const Spacer: React.FC<SpacerProps> = ({
  size = "md",
  horizontal = false,
}) => {
  const spacing = useSpacing()
  const sizeValue = (spacing[size as keyof typeof spacing] || 16) as number

  const spacerStyle: ViewStyle = horizontal
    ? { width: sizeValue }
    : { height: sizeValue }

  return <View style={spacerStyle} />
}

// TouchableOverlay - Touchable area with minimum touch target
interface TouchableOverlayProps {
  children?: React.ReactNode
  onPress?: () => void
  style?: ViewStyle
  disabled?: boolean
}

export const TouchableOverlay: React.FC<TouchableOverlayProps> = ({
  children,
  onPress,
  style,
  disabled = false,
}) => {
  const touchTarget = useTouchTarget()

  return (
    <View
      onTouchEnd={disabled ? undefined : onPress}
      style={[
        {
          minWidth: touchTarget,
          minHeight: touchTarget,
          justifyContent: "center",
          alignItems: "center",
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

// SafeArea - Safe area handling for notched devices
interface SafeAreaProps {
  children?: React.ReactNode
  style?: ViewStyle
  top?: boolean
  bottom?: boolean
}

export const SafeArea: React.FC<SafeAreaProps> = ({
  children,
  style,
  top = true,
  bottom = true,
}) => {
  const { isPhone } = useResponsive()

  const safeAreaStyle: ViewStyle = {
    ...(top && { paddingTop: Platform.OS === "ios" ? (isPhone ? 44 : 50) : isPhone ? 24 : 30 }),
    ...(bottom && { paddingBottom: Platform.OS === "ios" ? (isPhone ? 34 : 40) : isPhone ? 16 : 20 }),
  }

  return <View style={[safeAreaStyle, style]}>{children}</View>
}

export default {
  ResponsiveView,
  ResponsivePadding,
  ResponsiveMargin,
  ScreenContainer,
  CenteredContainer,
  Row,
  Column,
  Card,
  Divider,
  Spacer,
  TouchableOverlay,
  SafeArea,
}
