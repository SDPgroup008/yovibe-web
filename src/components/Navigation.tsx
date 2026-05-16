import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import responsive utilities
import { useDeviceType, useComponentSizes, useSpacing, BREAKPOINTS } from '../utils/ResponsiveDesign';

// Navigation hook
import { useNavigation } from '../utils/URLRouter';

// Layout Context
import { LayoutProvider, ScreenContainer } from '../contexts/LayoutContext';

// Tab bar configuration
interface TabConfig {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const tabs: TabConfig[] = [
  { key: 'events', label: 'Events', icon: 'calendar-outline', route: '/events' },
  { key: 'venues', label: 'Venues', icon: 'business-outline', route: '/venues' },
  { key: 'map', label: 'Map', icon: 'map-outline', route: '/map' },
  { key: 'calendar', label: 'Calendar', icon: 'today-outline', route: '/calendar' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', route: '/profile' }
];

// Custom tab bar component
export const TabBar: React.FC = () => {
  const { currentPath, navigateToEvents, navigateToVenues, navigateToMap, navigateToCalendar, navigateToProfile } = useNavigation();
  const { isLargeScreen, isTablet } = useDeviceType();
  const componentSizes = useComponentSizes();
  const spacing = useSpacing();

  // For desktop, use left sidebar instead of bottom tabs
  if (isLargeScreen) {
    return <DesktopTabBar currentPath={currentPath} />;
  }

  // Mobile/Tablet bottom tab bar
  const getCurrentTab = () => {
    if (currentPath.startsWith('/events')) return 'events';
    if (currentPath.startsWith('/venues')) return 'venues';
    if (currentPath.startsWith('/map')) return 'map';
    if (currentPath.startsWith('/calendar')) return 'calendar';
    if (currentPath.startsWith('/profile')) return 'profile';
    return 'events'; // Default
  };

  const currentTab = getCurrentTab();

  const navigateToTab = (tabKey: string) => {
    switch (tabKey) {
      case 'events': navigateToEvents(); break;
      case 'venues': navigateToVenues(); break;
      case 'map': navigateToMap(); break;
      case 'calendar': navigateToCalendar(); break;
      case 'profile': navigateToProfile(); break;
    }
  };

  return (
    <View style={[
      styles.bottomTabBar,
      {
        height: componentSizes.tabBarHeight,
        paddingBottom: Platform.OS === 'ios' ? spacing.small : 0,
        paddingTop: spacing.small,
      }
    ]}>
      {tabs.map((tab) => {
        const isActive = currentTab === tab.key;
        const iconName = isActive
          ? tab.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap
          : tab.icon;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.bottomTabItem}
            onPress={() => navigateToTab(tab.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={iconName}
              size={componentSizes.iconSize}
              color={isActive ? '#2196F3' : 'rgba(255, 255, 255, 0.5)'}
            />
            <Text style={[
              styles.bottomTabLabel,
              isActive && styles.bottomTabLabelActive
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// Desktop left sidebar tab bar
const DesktopTabBar: React.FC<{ currentPath: string }> = ({ currentPath }) => {
  const { navigateToEvents, navigateToVenues, navigateToMap, navigateToCalendar, navigateToProfile } = useNavigation();
  const componentSizes = useComponentSizes();
  const spacing = useSpacing();

  const getCurrentTab = () => {
    if (currentPath.startsWith('/events')) return 'events';
    if (currentPath.startsWith('/venues')) return 'venues';
    if (currentPath.startsWith('/map')) return 'map';
    if (currentPath.startsWith('/calendar')) return 'calendar';
    if (currentPath.startsWith('/profile')) return 'profile';
    return 'events';
  };

  const currentTab = getCurrentTab();

  const navigateToTab = (tabKey: string) => {
    switch (tabKey) {
      case 'events': navigateToEvents(); break;
      case 'venues': navigateToVenues(); break;
      case 'map': navigateToMap(); break;
      case 'calendar': navigateToCalendar(); break;
      case 'profile': navigateToProfile(); break;
    }
  };

  return (
    <View style={[styles.desktopSidebar, { width: 80 }]}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Image 
          source={require('../../assets/icon.png')} 
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      {/* Navigation Items */}
      <View style={styles.desktopNavItems}>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.key;
          const iconName = isActive
            ? tab.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap
            : tab.icon;

          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.desktopNavItem,
                isActive && styles.desktopNavItemActive
              ]}
              onPress={() => navigateToTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={iconName}
                size={componentSizes.iconSize}
                color={isActive ? '#2196F3' : 'rgba(255, 255, 255, 0.5)'}
              />
              <Text style={[
                styles.desktopNavLabel,
                isActive && styles.desktopNavLabelActive
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

// Standardized Back button component - positioned in top-right corner
export const BackButton: React.FC<{ style?: any }> = ({ style }) => {
  const { goBack, canGoBack } = useNavigation();

  if (!canGoBack) return null;

  return (
    <TouchableOpacity
      style={[styles.standardBackButton, style]}
      onPress={goBack}
      activeOpacity={0.7}
    >
      <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
    </TouchableOpacity>
  );
};

// Header component for consistency
export const AppHeader: React.FC = () => {
  const { isLargeScreen } = useDeviceType();

  // On desktop, header is minimal since we have the sidebar
  if (isLargeScreen) {
    return (
      <View style={styles.desktopHeader}>
        <BackButton />
      </View>
    );
  }

  // On mobile/tablet, header contains back button and title
  return (
    <View style={styles.mobileHeader}>
      <BackButton />
      <Text style={styles.headerTitle}>YoVibe</Text>
      <View style={{ width: 40 }} /> {/* Spacer for centering */}
    </View>
  );
};

// Layout wrapper for desktop
export const DesktopLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLargeScreen } = useDeviceType();

  if (!isLargeScreen) {
    return <>{children}</>;
  }

  return (
    <View style={styles.desktopLayout}>
      <TabBar />
      <View style={styles.desktopContent}>
        <AppHeader />
        <View style={styles.desktopMainContent}>
          <ScreenContainer>
            {children}
          </ScreenContainer>
        </View>
        {/* Desktop doesn't need bottom tab bar */}
      </View>
    </View>
  );
};

// Layout wrapper for mobile/tablet
export const MobileLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLargeScreen } = useDeviceType();

  if (isLargeScreen) {
    return <>{children}</>;
  }

  return (
    <View style={styles.mobileLayout}>
      <AppHeader />
      <View style={styles.mobileContent}>
        {children}
      </View>
      <TabBar />
    </View>
  );
};

// Styles
const styles = StyleSheet.create({
  // Bottom tab bar (mobile/tablet)
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 212, 255, 0.2)',
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  bottomTabLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    marginTop: 4,
  },
  bottomTabLabelActive: {
    color: '#2196F3',
    fontWeight: '600',
  },

  // Desktop sidebar
  desktopSidebar: {
    backgroundColor: '#121212',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 212, 255, 0.2)',
    height: '100%',
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 100,
    width: 80,
  },
  logoContainer: {
    paddingTop: 20,
    paddingBottom: 30,
    alignItems: 'center',
  },
  logoImage: {
    width: 50,
    height: 50,
    borderWidth: 1,
    borderColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
  desktopNavItems: {
    flex: 1,
    paddingTop: 20,
  },
  desktopNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginVertical: 4,
    borderRadius: 12,
    width: '90%',
    alignSelf: 'center',
  },
  desktopNavItemActive: {
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
  },
  desktopNavLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },
  desktopNavLabelActive: {
    color: '#2196F3',
    fontWeight: '600',
  },

  // Headers
  desktopHeader: {
    height: 64,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 212, 255, 0.2)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  mobileHeader: {
    height: 56,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 212, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 20 : 0,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Back button
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },

  // Layouts
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopContent: {
    flex: 1,
  },
  desktopMainContent: {
    flex: 1,
    backgroundColor: '#121212',
  },

  mobileLayout: {
    flex: 1,
    backgroundColor: '#121212',
  },
  mobileContent: {
    flex: 1,
    paddingBottom: 80, // Account for bottom tab bar
  },
  // Standardized back button positioned in top-right corner
  standardBackButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.3)",
    zIndex: 1000,
  },
});

export default TabBar;