import { useMemo } from 'react';
import { Dimensions, useWindowDimensions } from 'react-native';

/**
 * Modern Responsive Design System
 * Provides a complete responsive framework with breakpoints, spacing, and layout utilities
 * Uses hooks for dynamic dimension updates with memoization to prevent excessive re-renders
 */

// Device Breakpoints - Based on industry standards
export const BREAKPOINTS = {
  MOBILE: 380,      // < 380px: Small phones
  TABLET: 768,      // 768px - 1023px: Tablets
  LARGE_TABLET: 1024, // >= 1024px: Large tablets, desktops
};

/**
 * Internal hook to get stable breakpoint category
 * Only updates when crossing a breakpoint threshold to prevent excessive re-renders
 */
const useStableBreakpoint = () => {
  const { width } = useWindowDimensions();
  
  // Use a stable breakpoint key that only changes at thresholds
  const breakpointKey = useMemo(() => {
    if (width >= BREAKPOINTS.LARGE_TABLET) return 'desktop';
    if (width >= BREAKPOINTS.TABLET) return 'tablet';
    return 'mobile';
  }, [width]);
  
  return { width, breakpointKey };
};

/**
 * useDeviceType Hook - Returns current device type based on window width
 * This hook updates automatically when dimensions change
 * Uses memoization to prevent excessive re-renders
 */
export const useDeviceType = () => {
  const { width, breakpointKey } = useStableBreakpoint();
  
  return useMemo(() => ({
    isSmallDevice: width < BREAKPOINTS.MOBILE,
    isTablet: width >= BREAKPOINTS.TABLET && width < BREAKPOINTS.LARGE_TABLET,
    isLargeScreen: width >= BREAKPOINTS.LARGE_TABLET,
    width,
  }), [breakpointKey, width]);
};

/**
 * Responsive Size Helper - Hook version
 * Returns appropriate size based on current device width
 * Uses memoization to prevent recalculation on every render
 * @example responsiveSize(12, 16, 20) returns 12 for mobile, 16 for tablet, 20 for desktop
 */
export const useResponsiveSize = (mobile: number, tablet: number, desktop: number): number => {
  const { breakpointKey } = useStableBreakpoint();
  
  return useMemo(() => {
    if (breakpointKey === 'desktop') return desktop;
    if (breakpointKey === 'tablet') return tablet;
    return mobile;
  }, [breakpointKey, mobile, tablet, desktop]);
};

/**
 * useGridColumns Hook - Returns column count based on device size
 * Uses memoization to prevent recalculation on every render
 */
export const useGridColumns = (): number => {
  const { breakpointKey } = useStableBreakpoint();
  
  return useMemo(() => {
    if (breakpointKey === 'desktop') return 3;
    if (breakpointKey === 'tablet') return 2;
    return 1;
  }, [breakpointKey]);
};

/**
 * useSpacing Hook - Returns responsive spacing scale
 * Uses memoization to prevent recalculation on every render
 */
export const useSpacing = () => {
  const { breakpointKey } = useStableBreakpoint();
  
  const spacing = useMemo(() => {
    const getSize = (mobile: number, tablet: number, desktop: number): number => {
      if (breakpointKey === 'desktop') return desktop;
      if (breakpointKey === 'tablet') return tablet;
      return mobile;
    };
    
    return {
      xs: getSize(4, 6, 8),
      sm: getSize(8, 10, 12),
      md: getSize(12, 16, 20),
      lg: getSize(16, 20, 24),
      xl: getSize(20, 24, 32),
      xxl: getSize(24, 32, 40),
    };
  }, [breakpointKey]);
  
  return spacing;
};

/**
 * useTypography Hook - Returns responsive typography scale
 * Uses memoization to prevent recalculation on every render
 */
export const useTypography = () => {
  const { breakpointKey } = useStableBreakpoint();
  
  const typography = useMemo(() => {
    const getSize = (mobile: number, tablet: number, desktop: number): number => {
      if (breakpointKey === 'desktop') return desktop;
      if (breakpointKey === 'tablet') return tablet;
      return mobile;
    };
    
    return {
      xs: getSize(11, 12, 13),
      sm: getSize(12, 13, 14),
      base: getSize(14, 15, 16),
      lg: getSize(16, 18, 20),
      xl: getSize(18, 20, 24),
      xxl: getSize(24, 28, 32),
    };
  }, [breakpointKey]);
  
  return typography;
};

/**
 * useComponentSizes Hook - Returns responsive component sizes
 * Uses memoization to prevent recalculation on every render
 */
export const useComponentSizes = () => {
  const { width, breakpointKey } = useStableBreakpoint();
  
  const componentSizes = useMemo(() => {
    const getSize = (mobile: number, tablet: number, desktop: number): number => {
      if (breakpointKey === 'desktop') return desktop;
      if (breakpointKey === 'tablet') return tablet;
      return mobile;
    };
    
    return {
      buttonHeight: getSize(44, 48, 52),
      iconSize: getSize(20, 24, 28),
      tabBarHeight: getSize(54, 60, 68),
      cardRadius: getSize(8, 12, 16),
      modalRadius: getSize(12, 16, 20),
    };
  }, [breakpointKey]);
  
  return componentSizes;
};

/**
 * useLayoutDimensions Hook - Returns responsive layout dimensions
 * Uses memoization to prevent recalculation on every render
 */
export const useLayoutDimensions = () => {
  const { width, breakpointKey } = useStableBreakpoint();
  const { height } = useWindowDimensions();
  
  const layoutDimensions = useMemo(() => {
    const getSize = (mobile: number, tablet: number, desktop: number): number => {
      if (breakpointKey === 'desktop') return desktop;
      if (breakpointKey === 'tablet') return tablet;
      return mobile;
    };
    
    return {
      containerMaxWidth: width > BREAKPOINTS.LARGE_TABLET ? 900 : '100%',
      containerPadding: getSize(12, 16, 24),
      imageHeight: {
        small: getSize(160, 200, 240),
        medium: getSize(200, 240, 300),
        large: getSize(240, 300, 360),
      },
      width,
      height,
      isPortrait: height > width,
    };
  }, [width, height, breakpointKey]);
  
  return layoutDimensions;
};

/**
 * useBorderRadius Hook - Returns responsive border radius
 * Uses memoization to prevent recalculation on every render
 */
export const useBorderRadius = () => {
  const { breakpointKey } = useStableBreakpoint();
  
  const borderRadius = useMemo(() => {
    const getSize = (mobile: number, tablet: number, desktop: number): number => {
      if (breakpointKey === 'desktop') return desktop;
      if (breakpointKey === 'tablet') return tablet;
      return mobile;
    };
    
    return {
      xs: getSize(4, 6, 8),
      sm: getSize(6, 8, 10),
      md: getSize(8, 10, 12),
      lg: getSize(12, 14, 16),
      xl: getSize(16, 18, 20),
      full: 999,
    };
  }, [breakpointKey]);
  
  return borderRadius;
};

// Static exports for non-hook usage (these are calculated once at import time - use hooks instead)
export const responsiveSize = (mobile: number, tablet: number, desktop: number): number => {
  const { width } = Dimensions.get('window');
  if (width >= BREAKPOINTS.LARGE_TABLET) return desktop;
  if (width >= BREAKPOINTS.TABLET) return tablet;
  return mobile;
};

export const getGridColumns = (): number => {
  const { width } = Dimensions.get('window');
  if (width >= BREAKPOINTS.LARGE_TABLET) return 3;
  if (width >= BREAKPOINTS.TABLET) return 2;
  return 1;
};

// Static spacing (use useSpacing hook instead)
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// Static typography (use useTypography hook instead)
export const TYPOGRAPHY = {
  xs: 11,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
};

// Static component sizes (use useComponentSizes hook instead)
export const COMPONENT_SIZES = {
  buttonHeight: 44,
  iconSize: 20,
  tabBarHeight: 54,
  cardRadius: 8,
  modalRadius: 12,
};

// Layout dimensions (use useLayoutDimensions hook instead)
export const LAYOUT = {
  containerMaxWidth: '100%',
  containerPadding: 12,
  imageHeight: {
    small: 160,
    medium: 200,
    large: 240,
  },
};

// Shadow Styles
export const SHADOWS = {
  light: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  heavy: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
};

// Color Palette
export const COLORS = {
  primary: '#2196F3',
  accent: '#00D4FF',
  danger: '#FF3B30',
  warning: '#FFD700',
  background: '#121212',
  surface: '#1E1E1E',
  surfaceLight: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#BBBBBB',
  textTertiary: '#888888',
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.05)',
  gradientStart: '#00D4FF',
  gradientEnd: '#2196F3',
};

// Border Radius (use useBorderRadius hook instead)
export const BORDER_RADIUS = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

// Z-Index System
export const Z_INDEX = {
  background: 0,
  content: 1,
  modal: 100,
  toast: 101,
  tooltip: 102,
};

// Opacity Constants
export const OPACITY = {
  disabled: 0.5,
  hover: 0.8,
  loading: 0.6,
};
