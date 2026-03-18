"use client"

import React, { useRef, useEffect, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Image,
  Dimensions,
  ViewStyle,
  TextStyle,
  ImageStyle,
  Platform,
  ScrollView,
} from "react-native"
import { useResponsive, useSpacing, useGap, useFontScale, BREAKPOINTS } from "../utils/responsive"

// Color palette - Modern dark theme with neon accents
export const DESIGN_SYSTEM = {
  colors: {
    // Base colors
    background: "#0A0A0A",
    surface: "#121212",
    surfaceElevated: "#1A1A2E",
    surfaceHover: "#252540",
    
    // Primary accent - Electric cyan
    primary: "#00D4FF",
    primaryLight: "#33DDFF",
    primaryDark: "#00A3CC",
    primaryGlow: "rgba(0, 212, 255, 0.3)",
    
    // Secondary accent - Electric purple
    secondary: "#8B5CF6",
    secondaryLight: "#A78BFA",
    secondaryDark: "#7C3AED",
    
    // Status colors
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#3B82F6",
    
    // Text colors
    textPrimary: "#FFFFFF",
    textSecondary: "rgba(255, 255, 255, 0.7)",
    textTertiary: "rgba(255, 255, 255, 0.5)",
    textMuted: "rgba(255, 255, 255, 0.3)",
    
    // Border colors
    border: "rgba(255, 255, 255, 0.1)",
    borderLight: "rgba(255, 255, 255, 0.05)",
    borderFocus: "rgba(0, 212, 255, 0.5)",
    
    // Glassmorphism
    glass: "rgba(18, 18, 18, 0.8)",
    glassBorder: "rgba(255, 255, 255, 0.1)",
    glassHighlight: "rgba(255, 255, 255, 0.05)",
  },
  
  // Spacing scale
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  
  // Border radius
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  
  // Shadows
  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    },
    glow: {
      shadowColor: "#00D4FF",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 10,
    },
  },
  
  // Typography
  typography: {
    display: {
      fontSize: 48,
      fontWeight: "800" as const,
      lineHeight: 56,
      letterSpacing: -1,
    },
    h1: {
      fontSize: 32,
      fontWeight: "700" as const,
      lineHeight: 40,
      letterSpacing: -0.5,
    },
    h2: {
      fontSize: 24,
      fontWeight: "700" as const,
      lineHeight: 32,
    },
    h3: {
      fontSize: 20,
      fontWeight: "600" as const,
      lineHeight: 28,
    },
    h4: {
      fontSize: 18,
      fontWeight: "600" as const,
      lineHeight: 24,
    },
    body: {
      fontSize: 16,
      fontWeight: "400" as const,
      lineHeight: 24,
    },
    bodySmall: {
      fontSize: 14,
      fontWeight: "400" as const,
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: "500" as const,
      lineHeight: 16,
      letterSpacing: 0.5,
    },
    overline: {
      fontSize: 10,
      fontWeight: "600" as const,
      lineHeight: 14,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
    },
  },
  
  // Transitions
  transitions: {
    fast: 150,
    normal: 250,
    slow: 400,
    spring: {
      damping: 15,
      stiffness: 150,
    },
  },
}

// Breakpoint-based responsive values
export const useResponsiveDesign = () => {
  const { width, isPhone, isTablet, isDesktop, isSmall, isMedium, isLarge, isExtraLarge } = useResponsive()
  const spacing = useSpacing()
  const fonts = useFontScale()
  const gap = useGap()
  
  // Grid configuration based on platform benchmarks (Resident Advisor, Dice, Songkick)
  const gridConfig = {
    // Event cards - Phone: 1 col, Tablet: 2 cols, Desktop: 3-4 cols
    eventColumns: isPhone ? 1 : isTablet ? 2 : isDesktop ? 3 : 4,
    
    // Venue cards - Phone: 1-2 col, Tablet: 2-3 cols, Desktop: 4 cols
    venueColumns: isPhone ? (width > 400 ? 2 : 1) : isTablet ? 3 : 4,
    
    // Featured items - Phone: full width, Tablet: 2 cols, Desktop: 60% width
    featuredColumns: isPhone ? 1 : isTablet ? 2 : isDesktop ? 2 : 2,
    
    // Spacing
    gridGap: gap,
    cardPadding: isPhone ? spacing.sm : isTablet ? spacing.md : spacing.lg,
    sectionPadding: isPhone ? spacing.md : isTablet ? spacing.lg : spacing.xl,
    containerPadding: spacing.containerPadding as number,
    
    // Image heights
    cardImageHeight: isPhone ? 180 : isTablet ? 220 : 280,
    featuredImageHeight: isPhone ? 240 : isTablet ? 320 : 400,
    avatarSize: isPhone ? 40 : isTablet ? 48 : 56,
    iconSize: isPhone ? 20 : isTablet ? 24 : 28,
    
    // Typography
    fontSize: {
      display: isPhone ? 32 : isTablet ? 40 : 48,
      h1: isPhone ? 24 : isTablet ? 28 : 32,
      h2: isPhone ? 20 : isTablet ? 22 : 24,
      h3: isPhone ? 18 : isTablet ? 18 : 20,
      body: isPhone ? 14 : isTablet ? 16 : 16,
      bodySmall: isPhone ? 12 : isTablet ? 14 : 14,
      caption: isPhone ? 10 : isTablet ? 12 : 12,
    },
    
    // Border radius
    borderRadius: {
      sm: isPhone ? 8 : 10,
      md: isPhone ? 12 : 16,
      lg: isPhone ? 16 : 20,
      xl: isPhone ? 20 : 24,
    },
    
    // Touch targets
    buttonHeight: isPhone ? 48 : isTablet ? 52 : 56,
    inputHeight: isPhone ? 48 : isTablet ? 52 : 56,
    touchTarget: isPhone ? 44 : 48,
    
    // Animation
    animationScale: isPhone ? 0.98 : 1,
  }
  
  return {
    ...gridConfig,
    spacing,
    fonts,
    gap,
    width,
    isPhone,
    isTablet,
    isDesktop,
  }
}

// Animation hook
export const useAnimatedStyle = (initialValue: number = 0) => {
  const animatedValue = useRef(new Animated.Value(initialValue)).current
  
  const fadeIn = (duration: number = DESIGN_SYSTEM.transitions.normal) => {
    return Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    })
  }
  
  const fadeOut = (duration: number = DESIGN_SYSTEM.transitions.normal) => {
    return Animated.timing(animatedValue, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    })
  }
  
  const scaleIn = (duration: number = DESIGN_SYSTEM.transitions.normal) => {
    return Animated.spring(animatedValue, {
      toValue: 1,
      ...DESIGN_SYSTEM.transitions.spring,
      useNativeDriver: true,
    })
  }
  
  return {
    animatedValue,
    fadeIn,
    fadeOut,
    scaleIn,
    interpolate: (outputRange: number[]) => {
      return animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange,
      })
    },
  }
}

// Glassmorphism card component
interface GlassCardProps {
  children: React.ReactNode
  style?: ViewStyle
  elevated?: boolean
  glow?: boolean
  onPress?: () => void
  disabled?: boolean
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  elevated = false,
  glow = false,
  onPress,
  disabled = false,
}) => {
  const design = useResponsiveDesign()
  const [isPressed, setIsPressed] = useState(false)
  
  const cardStyle: ViewStyle = {
    backgroundColor: elevated 
      ? DESIGN_SYSTEM.colors.surfaceElevated 
      : DESIGN_SYSTEM.colors.glass,
    borderRadius: design.borderRadius.lg,
    borderWidth: 1,
    borderColor: DESIGN_SYSTEM.colors.glassBorder,
    padding: design.cardPadding,
    ...(glow && DESIGN_SYSTEM.shadows.glow),
    ...(elevated && DESIGN_SYSTEM.shadows.md),
    transform: [{ scale: isPressed ? 0.98 : 1 }],
    opacity: disabled ? 0.6 : 1,
  }
  
  const Content = onPress ? TouchableOpacity : View
  
  return (
    <Content
      style={[cardStyle, style]}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      activeOpacity={0.9}
    >
      {children}
    </Content>
  )
}

// Responsive Grid component
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
  const design = useResponsiveDesign()
  const gridColumns = columns || design.eventColumns
  const gridGap = gap || design.gridGap
  
  return (
    <View
      style={[
        styles.grid,
        {
          marginHorizontal: -gridGap / 2,
          marginBottom: -gridGap,
        },
        style,
      ]}
    >
      {React.Children.map(children, (child, index) => (
        <View
          key={index}
          style={[
            styles.gridItem,
            {
              width: `${100 / gridColumns}%`,
              paddingHorizontal: gridGap / 2,
              marginBottom: gridGap,
            },
          ]}
        >
          {child}
        </View>
      ))}
    </View>
  )
}

// Event Card with modern styling
interface EventCardProps {
  title: string
  date: string
  venue: string
  imageUrl?: string
  price?: string
  isFeatured?: boolean
  onPress?: () => void
  style?: ViewStyle
}

export const EventCard: React.FC<EventCardProps> = ({
  title,
  date,
  venue,
  imageUrl,
  price,
  isFeatured = false,
  onPress,
  style,
}) => {
  const design = useResponsiveDesign()
  const fadeAnim = useRef(new Animated.Value(0)).current
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()
  }, [])
  
  const imageHeight = isFeatured ? design.featuredImageHeight : design.cardImageHeight
  
  return (
    <Animated.View style={[styles.eventCardContainer, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={[
          styles.eventCard,
          {
            borderRadius: design.borderRadius.lg,
          },
          style,
        ]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Image */}
        <View style={[styles.eventCardImageContainer, { height: imageHeight }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.eventCardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.eventCardImagePlaceholder, { height: imageHeight }]}>
              <Text style={styles.eventCardPlaceholderIcon}>🎵</Text>
            </View>
          )}
          
          {/* Gradient overlay */}
          <View style={styles.eventCardOverlay} />
          
          {/* Price badge */}
          {price && (
            <View style={styles.eventCardPrice}>
              <Text style={styles.eventCardPriceText}>{price}</Text>
            </View>
          )}
          
          {/* Featured badge */}
          {isFeatured && (
            <View style={styles.eventCardFeatured}>
              <Text style={styles.eventCardFeaturedText}>FEATURED</Text>
            </View>
          )}
        </View>
        
        {/* Content */}
        <View style={styles.eventCardContent}>
          <Text 
            style={[
              styles.eventCardTitle, 
              { fontSize: design.fontSize.h3 }
            ]} 
            numberOfLines={2}
          >
            {title}
          </Text>
          
          <View style={styles.eventCardMeta}>
            <Text style={styles.eventCardDate}>{date}</Text>
            <View style={styles.eventCardDivider} />
            <Text style={styles.eventCardVenue} numberOfLines={1}>{venue}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// Venue Card with modern styling
interface VenueCardProps {
  name: string
  location: string
  imageUrl?: string
  vibeRating?: number
  category?: string
  onPress?: () => void
  style?: ViewStyle
}

export const VenueCard: React.FC<VenueCardProps> = ({
  name,
  location,
  imageUrl,
  vibeRating,
  category,
  onPress,
  style,
}) => {
  const design = useResponsiveDesign()
  const fadeAnim = useRef(new Animated.Value(0)).current
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start()
  }, [])
  
  return (
    <Animated.View style={[styles.venueCardContainer, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={[
          styles.venueCard,
          {
            borderRadius: design.borderRadius.lg,
          },
          style,
        ]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Image */}
        <View style={[styles.venueCardImageContainer, { height: design.cardImageHeight }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.venueCardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.venueCardImagePlaceholder, { height: design.cardImageHeight }]}>
              <Text style={styles.venueCardPlaceholderIcon}>🏠</Text>
            </View>
          )}
          
          {/* Gradient overlay */}
          <View style={styles.venueCardOverlay} />
          
          {/* Category badge */}
          {category && (
            <View style={styles.venueCardCategory}>
              <Text style={styles.venueCardCategoryText}>{category}</Text>
            </View>
          )}
          
          {/* Vibe rating */}
          {vibeRating !== undefined && (
            <View style={styles.venueCardRating}>
              <Text style={styles.venueCardRatingText}>🔥 {vibeRating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        
        {/* Content */}
        <View style={styles.venueCardContent}>
          <Text 
            style={[
              styles.venueCardTitle, 
              { fontSize: design.fontSize.h4 }
            ]} 
            numberOfLines={1}
          >
            {name}
          </Text>
          
          <Text style={styles.venueCardLocation} numberOfLines={1}>
            📍 {location}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// Modern Section Header
interface SectionHeaderProps {
  title: string
  subtitle?: string
  actionText?: string
  onActionPress?: () => void
  style?: ViewStyle
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionText,
  onActionPress,
  style,
}) => {
  const design = useResponsiveDesign()
  
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderText}>
        <Text style={[styles.sectionTitle, { fontSize: design.fontSize.h2 }]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.sectionSubtitle, { fontSize: design.fontSize.bodySmall }]}>
            {subtitle}
          </Text>
        )}
      </View>
      
      {actionText && (
        <TouchableOpacity onPress={onActionPress} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{actionText}</Text>
          <Text style={styles.sectionActionArrow}>→</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// Glassmorphic Search Bar
interface SearchBarProps {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  style?: ViewStyle
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = "Search events, venues...",
  style,
}) => {
  const design = useResponsiveDesign()
  
  return (
    <View style={[styles.searchBar, { borderRadius: design.borderRadius.md }, style]}>
      <Text style={styles.searchBarIcon}>🔍</Text>
      <Text style={[styles.searchBarInput, { fontSize: design.fontSize.body }]}>
        {value}
      </Text>
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText("")}>
          <Text style={styles.searchBarClear}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// Skeleton loading component
interface SkeletonProps {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 20,
  borderRadius = 8,
  style,
}) => {
  const [opacity] = useState(new Animated.Value(0.3))
  
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [opacity])
  
  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  )
}

// Empty state component
interface EmptyStateProps {
  icon?: string
  title: string
  message: string
  actionText?: string
  onAction?: () => void
  style?: ViewStyle
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = "🎉",
  title,
  message,
  actionText,
  onAction,
  style,
}) => {
  const design = useResponsiveDesign()
  
  return (
    <View style={[styles.emptyState, style]}>
      <Text style={styles.emptyStateIcon}>{icon}</Text>
      <Text style={[styles.emptyStateTitle, { fontSize: design.fontSize.h3 }]}>
        {title}
      </Text>
      <Text style={[styles.emptyStateMessage, { fontSize: design.fontSize.body }]}>
        {message}
      </Text>
      {actionText && onAction && (
        <TouchableOpacity 
          style={[styles.emptyStateButton, { borderRadius: design.borderRadius.md }]}
          onPress={onAction}
        >
          <Text style={styles.emptyStateButtonText}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// Styles
const styles = StyleSheet.create({
  // Grid styles
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridItem: {
    // Width set dynamically
  },
  
  // Event Card styles
  eventCardContainer: {
    width: "100%",
  },
  eventCard: {
    backgroundColor: DESIGN_SYSTEM.colors.surfaceElevated,
    overflow: "hidden",
    ...DESIGN_SYSTEM.shadows.md,
  },
  eventCardImageContainer: {
    width: "100%",
    position: "relative",
  },
  eventCardImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  eventCardImagePlaceholder: {
    width: "100%",
    backgroundColor: DESIGN_SYSTEM.colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  eventCardPlaceholderIcon: {
    fontSize: 48,
  },
  eventCardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    backgroundColor: "transparent",
    backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
  },
  eventCardPrice: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: DESIGN_SYSTEM.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: DESIGN_SYSTEM.radius.full,
  },
  eventCardPriceText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 12,
  },
  eventCardFeatured: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: DESIGN_SYSTEM.colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: DESIGN_SYSTEM.radius.full,
  },
  eventCardFeaturedText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 10,
    letterSpacing: 1,
  },
  eventCardContent: {
    padding: 16,
  },
  eventCardTitle: {
    color: DESIGN_SYSTEM.colors.textPrimary,
    fontWeight: "700",
    marginBottom: 8,
  },
  eventCardMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventCardDate: {
    color: DESIGN_SYSTEM.colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  eventCardDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: DESIGN_SYSTEM.colors.textMuted,
    marginHorizontal: 8,
  },
  eventCardVenue: {
    color: DESIGN_SYSTEM.colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  
  // Venue Card styles
  venueCardContainer: {
    width: "100%",
  },
  venueCard: {
    backgroundColor: DESIGN_SYSTEM.colors.surfaceElevated,
    overflow: "hidden",
    ...DESIGN_SYSTEM.shadows.md,
  },
  venueCardImageContainer: {
    width: "100%",
    position: "relative",
  },
  venueCardImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  venueCardImagePlaceholder: {
    width: "100%",
    backgroundColor: DESIGN_SYSTEM.colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  venueCardPlaceholderIcon: {
    fontSize: 48,
  },
  venueCardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    backgroundColor: "transparent",
    backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
  },
  venueCardCategory: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: DESIGN_SYSTEM.colors.glass,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: DESIGN_SYSTEM.radius.full,
    borderWidth: 1,
    borderColor: DESIGN_SYSTEM.colors.glassBorder,
  },
  venueCardCategoryText: {
    color: DESIGN_SYSTEM.colors.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  venueCardRating: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: DESIGN_SYSTEM.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: DESIGN_SYSTEM.radius.full,
  },
  venueCardRatingText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 12,
  },
  venueCardContent: {
    padding: 16,
  },
  venueCardTitle: {
    color: DESIGN_SYSTEM.colors.textPrimary,
    fontWeight: "700",
    marginBottom: 4,
  },
  venueCardLocation: {
    color: DESIGN_SYSTEM.colors.textSecondary,
    fontSize: 13,
  },
  
  // Section Header styles
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    color: DESIGN_SYSTEM.colors.textPrimary,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: DESIGN_SYSTEM.colors.textSecondary,
    marginTop: 4,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionActionText: {
    color: DESIGN_SYSTEM.colors.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  sectionActionArrow: {
    color: DESIGN_SYSTEM.colors.primary,
    marginLeft: 4,
    fontSize: 16,
  },
  
  // Search Bar styles
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DESIGN_SYSTEM.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: DESIGN_SYSTEM.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  searchBarIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  searchBarInput: {
    flex: 1,
    color: DESIGN_SYSTEM.colors.textPrimary,
  },
  searchBarClear: {
    color: DESIGN_SYSTEM.colors.textMuted,
    fontSize: 16,
    padding: 4,
  },
  
  // Skeleton styles
  skeleton: {
    backgroundColor: DESIGN_SYSTEM.colors.surfaceElevated,
  },
  
  // Empty State styles
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: DESIGN_SYSTEM.colors.textPrimary,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyStateMessage: {
    color: DESIGN_SYSTEM.colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: DESIGN_SYSTEM.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyStateButtonText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
})

export default {
  DESIGN_SYSTEM,
  useResponsiveDesign,
  useAnimatedStyle,
  GlassCard,
  ResponsiveGrid,
  EventCard,
  VenueCard,
  SectionHeader,
  SearchBar,
  Skeleton,
  EmptyState,
}
