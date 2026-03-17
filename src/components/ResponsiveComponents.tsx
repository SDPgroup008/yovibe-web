"use client"

import React from "react"
import { View, Text, StyleSheet, useWindowDimensions, ViewStyle, TextStyle } from "react-native"
import { colors, spacing, fontSize, borderRadius, BREAKPOINTS } from "../utils/responsive"

// Responsive container that adapts to screen width
interface ResponsiveContainerProps {
  children: React.ReactNode
  style?: ViewStyle
  maxWidth?: number
  padding?: boolean
  centerContent?: boolean
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  style,
  maxWidth = 1200,
  padding = true,
  centerContent = false,
}) => {
  const { width } = useWindowDimensions()
  
  const containerWidth = width >= maxWidth ? maxWidth * 0.9 : width * 0.95
  const paddingValue = width >= BREAKPOINTS.md ? spacing.lg : spacing.md
  
  return (
    <View
      style={[
        styles.container,
        { width: containerWidth, paddingHorizontal: padding ? paddingValue : 0 },
        centerContent && styles.centerContent,
        style,
      ]}
    >
      {children}
    </View>
  )
}

// Responsive card with adaptive sizing
interface ResponsiveCardProps {
  children: React.ReactNode
  style?: ViewStyle
  variant?: "default" | "elevated" | "outlined"
}

export const ResponsiveCard: React.FC<ResponsiveCardProps> = ({
  children,
  style,
  variant = "default",
}) => {
  const { width } = useWindowDimensions()
  
  const isTablet = width >= BREAKPOINTS.md
  const isDesktop = width >= BREAKPOINTS.lg
  
  const cardStyle: ViewStyle = {
    marginHorizontal: isDesktop ? spacing.xl : isTablet ? spacing.lg : spacing.md,
    marginBottom: isDesktop ? spacing.xl : spacing.lg,
    borderRadius: isDesktop ? borderRadius.xxl : borderRadius.xl,
    ...(variant === "elevated" && styles.elevated),
    ...(variant === "outlined" && styles.outlined),
  }
  
  return <View style={[styles.card, cardStyle, style]}>{children}</View>
}

// Responsive typography component
interface ResponsiveTextProps {
  children: React.ReactNode
  style?: TextStyle
  variant?: "h1" | "h2" | "h3" | "body" | "caption" | "button"
  color?: string
  center?: boolean
}

export const ResponsiveText: React.FC<ResponsiveTextProps> = ({
  children,
  style,
  variant = "body",
  color,
  center = false,
}) => {
  const { width } = useWindowDimensions()
  
  const isTablet = width >= BREAKPOINTS.md
  const isDesktop = width >= BREAKPOINTS.lg
  
  // Font size based on screen
  const fontSizes = {
    h1: isDesktop ? 40 : isTablet ? 32 : 28,
    h2: isDesktop ? 28 : isTablet ? 24 : 20,
    h3: isDesktop ? 22 : isTablet ? 18 : 16,
    body: isDesktop ? 16 : isTablet ? 15 : 14,
    caption: isDesktop ? 13 : isTablet ? 12 : 11,
    button: isDesktop ? 16 : isTablet ? 15 : 14,
  }
  
  // Font weight based on variant
  const fontWeights: Record<string, TextStyle["fontWeight"]> = {
    h1: "800",
    h2: "700",
    h3: "600",
    body: "400",
    caption: "400",
    button: "600",
  }
  
  const textStyle: TextStyle = {
    fontSize: fontSizes[variant],
    fontWeight: fontWeights[variant],
    color: color || colors.text,
    textAlign: center ? "center" : "left",
    lineHeight: fontSizes[variant] * 1.5,
  }
  
  return <Text style={[textStyle, style]}>{children}</Text>
}

// Responsive button with touch-friendly sizing
interface ResponsiveButtonProps {
  children: React.ReactNode
  onPress: () => void
  variant?: "primary" | "secondary" | "outline" | "ghost"
  size?: "small" | "medium" | "large"
  disabled?: boolean
  style?: ViewStyle
  fullWidth?: boolean
}

export const ResponsiveButton: React.FC<ResponsiveButtonProps> = ({
  children,
  onPress,
  variant = "primary",
  size = "medium",
  disabled = false,
  style,
  fullWidth = false,
}) => {
  const { width } = useWindowDimensions()
  
  const isTablet = width >= BREAKPOINTS.md
  
  // Size-based styling
  const sizes = {
    small: { paddingVertical: 8, paddingHorizontal: 16 },
    medium: { paddingVertical: isTablet ? 14 : 12, paddingHorizontal: isTablet ? 28 : 24 },
    large: { paddingVertical: isTablet ? 18 : 16, paddingHorizontal: isTablet ? 36 : 32 },
  }
  
  // Variant-based styling
  const variants = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.backgroundLight },
    outline: { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.primary },
    ghost: { backgroundColor: "transparent" },
  }
  
  return (
    <Text
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        sizes[size],
        variants[variant],
        disabled && styles.disabled,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {children}
    </Text>
  )
}

// Responsive grid for displaying items
interface ResponsiveGridProps {
  children: React.ReactNode
  columns?: number
  gap?: number
  style?: ViewStyle
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  columns,
  gap,
  style,
}) => {
  const { width } = useWindowDimensions()
  
  // Calculate columns based on screen width if not specified
  const cols = columns || (width >= BREAKPOINTS.xl ? 4 : width >= BREAKPOINTS.lg ? 3 : width >= BREAKPOINTS.md ? 2 : 1)
  const gridGap = gap || (width >= BREAKPOINTS.md ? spacing.lg : spacing.md)
  
  return (
    <View style={[styles.grid, { flexWrap: "wrap", marginHorizontal: -gridGap / 2 }, style]}>
      {React.Children.map(children, (child, index) => (
        <View
          key={index}
          style={[
            { width: `${100 / cols}%`, paddingHorizontal: gridGap / 2, marginBottom: gridGap },
          ]}
        >
          {child}
        </View>
      ))}
    </View>
  )
}

// Touch-friendly spacing component
interface SpacerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl"
}

export const Spacer: React.FC<SpacerProps> = ({ size = "md" }) => {
  const { width } = useWindowDimensions()
  
  const isTablet = width >= BREAKPOINTS.md
  const isDesktop = width >= BREAKPOINTS.lg
  
  // Scale spacing based on screen
  const scale = isDesktop ? 1.5 : isTablet ? 1.25 : 1
  
  const sizes = {
    xs: spacing.xs,
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.lg,
    xl: spacing.xl,
    xxl: spacing.xxl,
  }
  
  return <View style={{ height: sizes[size] * scale }} />
}

// Horizontal line with optional spacing
interface DividerProps {
  marginVertical?: number
}

export const Divider: React.FC<DividerProps> = ({ marginVertical = 24 }) => {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.border,
        marginVertical: marginVertical,
      }}
    />
  )
}

// Section header with optional "See All" button
interface SectionHeaderProps {
  title: string
  subtitle?: string
  onSeeAll?: () => void
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  onSeeAll,
}) => {
  const { width } = useWindowDimensions()
  const isTablet = width >= BREAKPOINTS.md
  
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text
          style={[
            styles.sectionTitle,
            { fontSize: isTablet ? 24 : 20 },
          ]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.sectionSubtitle, { fontSize: isTablet ? 14 : 12 }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {onSeeAll && (
        <Text onPress={onSeeAll} style={styles.seeAllButton}>
          See All
        </Text>
      )}
    </View>
  )
}

// Responsive image placeholder with aspect ratio
interface ImagePlaceholderProps {
  aspectRatio?: number
  children?: React.ReactNode
}

export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({
  aspectRatio = 16 / 9,
}) => {
  const { width } = useWindowDimensions()
  
  const isTablet = width >= BREAKPOINTS.md
  const isDesktop = width >= BREAKPOINTS.lg
  
  const padding = isDesktop ? spacing.lg : isTablet ? spacing.md : spacing.md
  const containerWidth = width - padding * 2
  const height = containerWidth / aspectRatio
  
  return (
    <View style={[styles.imagePlaceholder, { height: isDesktop ? height * 1.2 : height }]} />
  )
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
  },
  centerContent: {
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
  elevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    color: colors.text,
    textAlign: "center",
    borderRadius: borderRadius.md,
    overflow: "hidden",
  },
  disabled: {
    opacity: 0.5,
  },
  fullWidth: {
    width: "100%",
  },
  grid: {
    flexDirection: "row",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontWeight: "700",
    color: colors.text,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  seeAllButton: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  imagePlaceholder: {
    backgroundColor: colors.backgroundLighter,
    width: "100%",
  },
})

export default {
  ResponsiveContainer,
  ResponsiveCard,
  ResponsiveText,
  ResponsiveButton,
  ResponsiveGrid,
  Spacer,
  Divider,
  SectionHeader,
  ImagePlaceholder,
}
