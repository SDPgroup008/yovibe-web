import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { Ionicons } from "@expo/vector-icons"
import { useEffect, useState, useCallback } from "react"
import { useNavigation, useNavigationState } from "@react-navigation/native"
import { View, ActivityIndicator, Dimensions, Platform, useWindowDimensions, TouchableOpacity, Text, StyleSheet, Image } from "react-native"

// Import responsive hooks
import { useDeviceType, useComponentSizes, useSpacing, BREAKPOINTS } from "../utils/ResponsiveDesign"

// Auth Screens
import LoginScreen from "../screens/auth/LoginScreen"
import SignUpScreen from "../screens/auth/SignUpScreen"

// Main Screens
import VenuesScreen from "../screens/VenuesScreen"
import VenueDetailScreen from "../screens/VenueDetailScreen"
import EventsScreen from "../screens/EventsScreen"
import EventDetailScreen from "../screens/EventDetailScreen"
import MapScreen from "../screens/MapScreen.web"
import EventCalendarScreen from "../screens/EventCalendarScreen"
import ProfileScreen from "../screens/ProfileScreen"
import AddVenueScreen from "../screens/AddVenueScreen"
import AddEventScreen from "../screens/AddEventScreen"
import MyVenuesScreen from "../screens/MyVenuesScreen"
import ManageProgramsScreen from "../screens/ManageProgramsScreen"
import AddVibeScreen from "../screens/AddVibeScreen"
import TodaysVibeScreen from "../screens/TodaysVibeScreen"
import TicketContactScreen from "../screens/TicketContactScreen"
import TicketPurchaseScreen from "../screens/TicketPurchaseScreen"
import TicketScannerScreen from "../screens/TicketScannerScreen"
import MyTicketsScreen from "../screens/MyTicketsScreen"
import NotificationScreen from "../screens/NotificationScreen"

// Admin Screens
import AdminUsersScreen from "../screens/admin/AdminUsersScreen"
import AdminVenuesScreen from "../screens/admin/AdminVenuesScreen"
import AdminEventsScreen from "../screens/admin/AdminEventsScreen"
import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen"

// Types
import type {
  AuthStackParamList,
  VenuesStackParamList,
  EventsStackParamList,
  MapStackParamList,
  CalendarStackParamList,
  ProfileStackParamList,
  MainTabParamList,
} from "./types"

// Auth helper (soft-auth)
import { useAuth } from "../contexts/AuthContext"

// Responsive helper for navigation dimensions (hook-based for dynamic updates)
// Uses memoized hooks to prevent re-renders on every dimension change
const useResponsiveNav = () => {
  const { width } = useWindowDimensions();
  const deviceType = useDeviceType();
  const componentSizes = useComponentSizes();
  const spacing = useSpacing();
  
  // Use memoized deviceType values
  const { isLargeScreen, isTablet } = deviceType;
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  
  const responsiveSizeFn = (small: number, medium: number, large: number) => {
    if (isLargeScreen) return large;
    if (isTablet) return medium;
    return small;
  };
  
  return {
    isSmallDevice,
    isTablet,
    isLargeScreen,
    width,
    tabBarHeight: componentSizes.tabBarHeight,
    iconSize: componentSizes.iconSize,
    navWidth: isLargeScreen ? 80 : isTablet ? 70 : 60,
    spacing,
    responsiveSize: responsiveSizeFn,
  };
};

// Log responsiveness initialization (only once at mount)
console.log("[v0] Navigation responsive system ready");

//
// Create the navigators
//
const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const MainTab = createBottomTabNavigator<MainTabParamList>()
const VenuesStack = createNativeStackNavigator<VenuesStackParamList>()
const EventsStack = createNativeStackNavigator<EventsStackParamList>()
const MapStack = createNativeStackNavigator<MapStackParamList>()
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>()
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

const ManageProgramsScreenWrapper = (props: any) => <ManageProgramsScreen {...props} />
const TodaysVibeScreenWrapper = (props: any) => <TodaysVibeScreen {...props} />
const TicketContactScreenWrapper = (props: any) => <TicketContactScreen {...props} />
const TicketPurchaseScreenWrapper = (props: any) => <TicketPurchaseScreen {...props} />
const TicketScannerScreenWrapper = (props: any) => <TicketScannerScreen {...props} />
const MyTicketsScreenWrapper = (props: any) => <MyTicketsScreen {...props} />
const EventsScreenWrapper = (props: any) => <EventsScreen {...props} />
const MapScreenWrapper = (props: any) => <MapScreen {...props} />
const ProfileScreenWrapper = (props: any) => <ProfileScreen {...props} />

/**
 * withAuth HOC – Fixed & Production-Ready
 *
 * Now properly waits for auth state to resolve (isLoading)
 * Prevents flash of protected screen
 * Prevents infinite redirect loop after login
 * Uses navigation.reset() for clean auth flow
 */
function withAuth<P extends Record<string, any>>(WrappedComponent: React.ComponentType<P>) {
  return function ProtectedScreen(props: P) {
    const { user, isLoading, setRedirectIntent } = useAuth()
    const navigation = useNavigation<any>()

    useEffect(() => {
      // Don't do anything while auth is still loading
      if (isLoading) return

      // Only redirect if truly not authenticated
      if (!user) {
        try {
          const routeName = (props as any).route?.name || "EventsList"
          const params = (props as any).route?.params || undefined

          setRedirectIntent({
            routeName,
            params,
          })
        } catch (err) {
          console.warn("withAuth: failed to save redirect intent", err)
          setRedirectIntent({ routeName: "EventsList" })
        }

        // Clean reset to Login (prevents back-button issues)
        navigation.reset({
          index: 0,
          routes: [{ name: "Login" }],
        })
      }
    }, [user, isLoading, navigation, props, setRedirectIntent])

    // Show loading spinner while checking auth state
    if (isLoading) {
      return (
        <View style={{ flex: 1, backgroundColor: "#121212", justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      )
    }

    // Show nothing while redirecting (safe)
    if (!user) return null

    // User is authenticated → render the real screen
    return <WrappedComponent {...props} />
  }
}

// Create protected wrappers for screens that require authentication
const AddEventScreenProtected = withAuth(AddEventScreen)
const AddVenueScreenProtected = withAuth(AddVenueScreen)

//
// Auth Navigator
//
export const AuthNavigator = () => {
  const { width } = useWindowDimensions();
  const deviceType = useDeviceType();
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  const isLargeScreen = deviceType.isLargeScreen;
  
  const responsiveSizeFn = (small: number, medium: number, large: number) => {
    if (isLargeScreen) return large;
    if (deviceType.isTablet) return medium;
    return small;
  };
  
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: responsiveSizeFn(16, 18, 20),
        },
        headerBackTitleVisible: !isSmallDevice,
        gestureEnabled: false,
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
    </AuthStack.Navigator>
  )
}

//
// Venues Stack Navigator
//
export const VenuesStackNavigator = () => {
  const { width } = useWindowDimensions();
  const deviceType = useDeviceType();
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  const isLargeScreen = deviceType.isLargeScreen;
  
  const responsiveSizeFn = (small: number, medium: number, large: number) => {
    if (isLargeScreen) return large;
    if (deviceType.isTablet) return medium;
    return small;
  };
  
  return (
    <VenuesStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: responsiveSizeFn(16, 18, 20),
        },
        headerBackTitleVisible: !isSmallDevice,
      }}
    >
      <VenuesStack.Screen name="VenuesList" component={VenuesScreen} options={{ title: "Venues" }} />
      <VenuesStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <VenuesStack.Screen name="AddEvent" component={AddEventScreenProtected} options={{ title: "Add Event" }} />
      <VenuesStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <VenuesStack.Screen
        name="ManagePrograms"
        component={ManageProgramsScreenWrapper}
        options={{ title: "Weekly Programs" }}
      />
      <VenuesStack.Screen name="TodaysVibe" component={TodaysVibeScreenWrapper} options={{ title: "Today's Vibe" }} />
      <VenuesStack.Screen
        name="TicketContactScreen"
        component={TicketContactScreenWrapper}
        options={{ title: "Contact for Tickets" }}
      />
      <VenuesStack.Screen
        name="TicketPurchase"
        component={TicketPurchaseScreenWrapper}
        options={{ title: "Buy Tickets" }}
      />
      <VenuesStack.Screen
        name="TicketScanner"
        component={TicketScannerScreenWrapper}
        options={{ title: "Scan Ticket" }}
      />
      <VenuesStack.Screen
        name="MyTickets"
        component={MyTicketsScreenWrapper}
        options={{ title: "My Tickets" }}
      />
    </VenuesStack.Navigator>
  )
}

//
// Events Stack Navigator
//
export const EventsStackNavigator = () => {
  const { width } = useWindowDimensions();
  const deviceType = useDeviceType();
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  const isLargeScreen = deviceType.isLargeScreen;
  
  const responsiveSizeFn = (small: number, medium: number, large: number) => {
    if (isLargeScreen) return large;
    if (deviceType.isTablet) return medium;
    return small;
  };
  
  return (
    <EventsStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: responsiveSizeFn(16, 18, 20),
        },
        headerBackTitleVisible: !isSmallDevice,
      }}
    >
      <EventsStack.Screen name="EventsList" component={EventsScreenWrapper} options={{ title: "Events" }} />
      <EventsStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <EventsStack.Screen name="AddEvent" component={AddEventScreenProtected} options={{ title: "Add Event" }} />
      <EventsStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <EventsStack.Screen name="Notification" component={NotificationScreen} options={{ title: "Notifications" }} />
      <EventsStack.Screen
        name="TicketContactScreen"
        component={TicketContactScreenWrapper}
        options={{ title: "Contact for Tickets" }}
      />
      <EventsStack.Screen
        name="TicketPurchase"
        component={TicketPurchaseScreenWrapper}
        options={{ title: "Buy Tickets" }}
      />
      <EventsStack.Screen
        name="TicketScanner"
        component={TicketScannerScreenWrapper}
        options={{ title: "Scan Ticket" }}
      />
      <EventsStack.Screen
        name="MyTickets"
        component={MyTicketsScreenWrapper}
        options={{ title: "My Tickets" }}
      />
    </EventsStack.Navigator>
  )
}

//
// Map Stack Navigator
//
export const MapStackNavigator = () => {
  const { width } = useWindowDimensions();
  const deviceType = useDeviceType();
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  const isLargeScreen = deviceType.isLargeScreen;
  
  const responsiveSizeFn = (small: number, medium: number, large: number) => {
    if (isLargeScreen) return large;
    if (deviceType.isTablet) return medium;
    return small;
  };
  
  return (
    <MapStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: responsiveSizeFn(16, 18, 20),
        },
        headerBackTitleVisible: !isSmallDevice,
      }}
    >
      <MapStack.Screen name="MapView" component={MapScreenWrapper} options={{ title: "Map" }} />
      <MapStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <MapStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <MapStack.Screen
        name="TicketContactScreen"
        component={TicketContactScreenWrapper}
        options={{ title: "Contact for Tickets" }}
      />
      <MapStack.Screen
        name="TicketPurchase"
        component={TicketPurchaseScreenWrapper}
        options={{ title: "Buy Tickets" }}
      />
      <MapStack.Screen
        name="TicketScanner"
        component={TicketScannerScreenWrapper}
        options={{ title: "Scan Ticket" }}
      />
      <MapStack.Screen
        name="MyTickets"
        component={MyTicketsScreenWrapper}
        options={{ title: "My Tickets" }}
      />
    </MapStack.Navigator>
  )
}

//
// Calendar Stack Navigator
//
export const CalendarStackNavigator = () => {
  const { width } = useWindowDimensions();
  const deviceType = useDeviceType();
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  const isLargeScreen = deviceType.isLargeScreen;
  
  const responsiveSizeFn = (small: number, medium: number, large: number) => {
    if (isLargeScreen) return large;
    if (deviceType.isTablet) return medium;
    return small;
  };
  
  return (
    <CalendarStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: responsiveSizeFn(16, 18, 20),
        },
        headerBackTitleVisible: !isSmallDevice,
      }}
    >
      <CalendarStack.Screen name="CalendarView" component={EventCalendarScreen} options={{ title: "Calendar" }} />
      <CalendarStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <CalendarStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <CalendarStack.Screen
        name="TicketContactScreen"
        component={TicketContactScreenWrapper}
        options={{ title: "Contact for Tickets" }}
      />
      <CalendarStack.Screen
        name="TicketPurchase"
        component={TicketPurchaseScreenWrapper}
        options={{ title: "Buy Tickets" }}
      />
      <CalendarStack.Screen
        name="TicketScanner"
        component={TicketScannerScreenWrapper}
        options={{ title: "Scan Ticket" }}
      />
      <CalendarStack.Screen
        name="MyTickets"
        component={MyTicketsScreenWrapper}
        options={{ title: "My Tickets" }}
      />
    </CalendarStack.Navigator>
  )
}

//
// Profile Stack Navigator
//
export const ProfileStackNavigator = () => {
  const { width } = useWindowDimensions();
  const deviceType = useDeviceType();
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  const isLargeScreen = deviceType.isLargeScreen;
  
  const responsiveSizeFn = (small: number, medium: number, large: number) => {
    if (isLargeScreen) return large;
    if (deviceType.isTablet) return medium;
    return small;
  };
  
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: responsiveSizeFn(16, 18, 20),
        },
        headerBackTitleVisible: !isSmallDevice,
      }}
    >
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreenWrapper} options={{ title: "Profile" }} />
      <ProfileStack.Screen name="MyVenues" component={MyVenuesScreen} options={{ title: "My Venues" }} />
      <ProfileStack.Screen name="AddVenue" component={AddVenueScreenProtected} options={{ title: "Add Venue" }} />
      <ProfileStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <ProfileStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <ProfileStack.Screen name="Notification" component={NotificationScreen} options={{ title: "Notifications" }} />
      <ProfileStack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: "Analytics Dashboard" }} />
      <ProfileStack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: "Manage Users" }} />
      <ProfileStack.Screen name="AdminVenues" component={AdminVenuesScreen} options={{ title: "Manage Venues" }} />
      <ProfileStack.Screen name="AdminEvents" component={AdminEventsScreen} options={{ title: "Manage Events" }} />
      <ProfileStack.Screen name="AddVibe" component={AddVibeScreen} options={{ title: "Add Vibe" }} />
      <ProfileStack.Screen name="TodaysVibe" component={TodaysVibeScreenWrapper} options={{ title: "Today's Vibe" }} />
      <ProfileStack.Screen
        name="TicketContactScreen"
        component={TicketContactScreenWrapper}
        options={{ title: "Contact for Tickets" }}
      />
      <ProfileStack.Screen
        name="TicketPurchase"
        component={TicketPurchaseScreenWrapper}
        options={{ title: "Buy Tickets" }}
      />
      <ProfileStack.Screen
        name="TicketScanner"
        component={TicketScannerScreenWrapper}
        options={{ title: "Scan Ticket" }}
      />
      <ProfileStack.Screen
        name="MyTickets"
        component={MyTicketsScreenWrapper}
        options={{ title: "My Tickets" }}
      />
    </ProfileStack.Navigator>
  )
}

//
// Custom Tab Bar that switches between bottom (mobile) and left (desktop)
//
function CustomTabBar({ state, descriptors, navigation }: any) {
  const { isLargeScreen, iconSize, spacing, navWidth, tabBarHeight, responsiveSize, isTablet } = useResponsiveNav();
  
  const getIconName = (routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap => {
    switch (routeName) {
      case "Venues": return focused ? "business" : "business-outline";
      case "Events": return focused ? "calendar" : "calendar-outline";
      case "Map": return focused ? "map" : "map-outline";
      case "Calendar": return focused ? "today" : "today-outline";
      case "Profile": return focused ? "person" : "person-outline";
      default: return "ellipse";
    }
  };
  
  // Desktop: Left navigation bar - use flexbox version
  if (isLargeScreen) {
    return (
      <View style={[styles.leftNavBarFlex, { width: navWidth }]}>
        <View style={styles.leftNavContent}>
{/* Logo at top */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 30, height: 30, borderRadius: 8 }}
          />
        </View>
          
          {/* Navigation Items */}
          {state.routes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const label = options.tabBarLabel ?? options.title ?? route.name;
            const isFocused = state.index === index;
            
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };
            
            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                style={[
                  styles.navItem,
                  isFocused && styles.navItemActive
                ]}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={getIconName(route.name, isFocused)} 
                  size={iconSize} 
                  color={isFocused ? "#2196F3" : "rgba(255, 255, 255, 0.5)"} 
                />
                <Text 
                  style={[
                    styles.navLabel,
                    isFocused && styles.navLabelActive
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }
  
  // Mobile/Tablet: Bottom navigation bar
  return (
    <View style={[
      styles.bottomTabBar, 
      { 
        height: tabBarHeight,
        paddingBottom: Platform.OS === 'ios' ? responsiveSize(4, 6, 8) : 0,
        paddingTop: responsiveSize(6, 8, 10),
      }
    ]}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel ?? options.title ?? route.name;
        const isFocused = state.index === index;
        
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        
        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.bottomTabItem}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={getIconName(route.name, isFocused)} 
              size={iconSize} 
              color={isFocused ? "#2196F3" : "rgba(255, 255, 255, 0.5)"} 
            />
            <Text 
              style={[
                styles.bottomTabLabel,
                isFocused && styles.bottomTabLabelActive
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

//
// Desktop Left Navigation Content Component
// Renders the left nav items - connected to navigation via props
//
function DesktopLeftNav({ navigation, currentIndex }: { navigation: any, currentIndex: number }) {
  const { iconSize, navWidth } = useResponsiveNav();
  
  const routes = [
    { name: "Events", label: "Events", icon: "calendar", iconOutline: "calendar-outline" },
    { name: "Venues", label: "Venues", icon: "business", iconOutline: "business-outline" },
    { name: "Map", label: "Map", icon: "map", iconOutline: "map-outline" },
    { name: "Calendar", label: "Calendar", icon: "today", iconOutline: "today-outline" },
    { name: "Profile", label: "Profile", icon: "person", iconOutline: "person-outline" },
  ];
  
  const handleNavigate = (routeName: string, index: number) => {
    if (index !== currentIndex) {
      navigation.navigate(routeName);
    }
  };
  
  return (
    <View style={[styles.desktopLeftNavContainer, { width: navWidth }]}>
      <View style={styles.leftNavContent}>
        {/* Logo at top */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 30, height: 30, borderRadius: 8 }}
          />
        </View>
        
        {/* Navigation Items */}
        {routes.map((route, index) => {
          const isFocused = index === currentIndex;
          return (
            <TouchableOpacity
              key={route.name}
              onPress={() => handleNavigate(route.name, index)}
              style={[
                styles.navItem,
                isFocused && styles.navItemActive
              ]}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={isFocused ? route.icon as any : route.iconOutline as any} 
                size={iconSize} 
                color={isFocused ? "#2196F3" : "rgba(255, 255, 255, 0.5)"} 
              />
              <Text 
                style={[
                  styles.navLabel,
                  isFocused && styles.navLabelActive
                ]}
                numberOfLines={1}
              >
                {route.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

//
// Main Tab Navigator with Desktop Left Navigation
//
export const MainTabNavigator = () => {
  const { isLargeScreen, isTablet, tabBarHeight, iconSize, spacing, responsiveSize, width, navWidth } = useResponsiveNav();
  const isSmallDevice = width < BREAKPOINTS.MOBILE;
  const [navState, setNavState] = useState<any>(null);
  
  // On desktop, render left nav outside the navigator
  if (isLargeScreen) {
    return (
      <View style={styles.tabContainer}>
        {/* Left Navigation - rendered outside navigator */}
        <View style={styles.desktopLeftNav}>
          <DesktopLeftNavWrapper />
        </View>
        
        {/* Main Navigator Content */}
        <View style={styles.desktopNavigatorContent}>
          <MainTab.Navigator
            tabBar={() => null}
            screenOptions={{
              headerStyle: {
                backgroundColor: "#121212",
                height: responsiveSize(56, 60, 64),
              },
              headerTintColor: "#FFFFFF",
              headerTitleStyle: {
                fontWeight: "bold",
                fontSize: responsiveSize(16, 18, 20),
              },
              headerLeft: () => <View style={{ width: 20 }} />,
            }}
          >
            <MainTab.Screen 
              name="Events" 
              component={EventsStackNavigator} 
              options={{ headerShown: false }} 
            />
            <MainTab.Screen 
              name="Venues" 
              component={VenuesStackNavigator} 
              options={{ headerShown: false }} 
            />  
            <MainTab.Screen 
              name="Map" 
              component={MapStackNavigator} 
              options={{ headerShown: false }} 
            />
            <MainTab.Screen 
              name="Calendar" 
              component={CalendarStackNavigator} 
              options={{ headerShown: false }} 
            />
            <MainTab.Screen 
              name="Profile" 
              component={ProfileStackNavigator} 
              options={{ headerShown: false }} 
            />
          </MainTab.Navigator>
        </View>
      </View>
    );
  }
  
  // Mobile/Tablet: Use bottom tab navigation
  return (
    <View style={styles.tabContainer}>
      <MainTab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color }) => {
            let iconName: keyof typeof Ionicons.glyphMap = "business"

            if (route.name === "Venues") {
              iconName = focused ? "business" : "business-outline"
            } else if (route.name === "Events") {
              iconName = focused ? "calendar" : "calendar-outline"
            } else if (route.name === "Map") {
              iconName = focused ? "map" : "map-outline"
            } else if (route.name === "Calendar") {
              iconName = focused ? "today" : "today-outline"
            } else if (route.name === "Profile") {
              iconName = focused ? "person" : "person-outline"
            }

            return <Ionicons name={iconName} size={iconSize} color={color} />
          },
          tabBarVisible: true,
          tabBarActiveTintColor: "#2196F3",
          tabBarInactiveTintColor: "rgba(255, 255, 255, 0.5)",
          tabBarStyle: {
            backgroundColor: "#121212",
            borderTopColor: "rgba(0, 212, 255, 0.2)",
            height: tabBarHeight,
            paddingBottom: Platform.OS === 'ios' ? responsiveSize(4, 6, 8) : 0,
            paddingTop: responsiveSize(6, 8, 10),
          },
          headerStyle: {
            backgroundColor: "#121212",
            height: responsiveSize(56, 60, 64),
          },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: {
            fontWeight: "bold",
            fontSize: responsiveSize(16, 18, 20),
          },
        })}
      >
        <MainTab.Screen 
          name="Events" 
          component={EventsStackNavigator} 
          options={{ 
            headerShown: false,
            tabBarLabel: 'Events',
          }} 
        />
        <MainTab.Screen 
          name="Venues" 
          component={VenuesStackNavigator} 
          options={{ 
            headerShown: false,
            tabBarLabel: 'Venues',
          }} 
        />  
        <MainTab.Screen 
          name="Map" 
          component={MapStackNavigator} 
          options={{ 
            headerShown: false,
            tabBarLabel: 'Map',
          }} 
        />
        <MainTab.Screen 
          name="Calendar" 
          component={CalendarStackNavigator} 
          options={{ 
            headerShown: false,
            tabBarLabel: 'Calendar',
          }} 
        />
        <MainTab.Screen 
          name="Profile" 
          component={ProfileStackNavigator} 
          options={{ 
            headerShown: false,
            tabBarLabel: 'Profile',
          }} 
        />
      </MainTab.Navigator>
    </View>
  );
}

// Wrapper to get navigation state for desktop left nav
function DesktopLeftNavWrapper() {
  const navigation = useNavigation<any>();
  const [currentRouteName, setCurrentRouteName] = useState("Events");
  const { iconSize, navWidth } = useResponsiveNav();
  
  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e: any) => {
      const currentIndex = e.data?.state?.index;
      if (currentIndex !== undefined && e.data?.state?.routes) {
        const routeName = e.data.state.routes[currentIndex]?.name || "Events";
        setCurrentRouteName(routeName);
      }
    });
    
    const initialState = navigation.getState();
    if (initialState?.routes && initialState?.index !== undefined) {
      setCurrentRouteName(initialState.routes[initialState.index]?.name || "Events");
    }
    
    return unsubscribe;
  }, [navigation]);
  
  const handleNavigate = useCallback((routeName: string) => {
    navigation.navigate(routeName);
  }, [navigation]);
  
  return (
    <View style={[styles.desktopLeftNavContainer, { width: navWidth }]}>
      <View style={styles.leftNavContent}>
        {/* Logo at top */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 30, height: 30, borderRadius: 8 }}
          />
        </View>
        
        {/* Navigation Items */}
        {[
          { name: "Events", label: "Events", icon: "calendar", iconOutline: "calendar-outline" },
          { name: "Venues", label: "Venues", icon: "business", iconOutline: "business-outline" },
          { name: "Map", label: "Map", icon: "map", iconOutline: "map-outline" },
          { name: "Calendar", label: "Calendar", icon: "today", iconOutline: "today-outline" },
          { name: "Profile", label: "Profile", icon: "person", iconOutline: "person-outline" },
        ].map((route, index) => {
          const isFocused = route.name === currentRouteName;
          return (
            <TouchableOpacity
              key={route.name}
              onPress={() => handleNavigate(route.name)}
              style={[
                styles.navItem,
                isFocused && styles.navItemActive
              ]}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={isFocused ? route.icon as any : route.iconOutline as any} 
                size={iconSize} 
                color={isFocused ? "#2196F3" : "rgba(255, 255, 255, 0.5)"} 
              />
              <Text 
                style={[
                  styles.navLabel,
                  isFocused && styles.navLabelActive
                ]}
                numberOfLines={1}
              >
                {route.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Styles for desktop left navigation
const styles = StyleSheet.create({
  tabContainer: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  leftNavBar: {
    backgroundColor: '#121212',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 212, 255, 0.2)',
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 100,
  },
  // Desktop left nav using flexbox (not absolute)
  leftNavBarFlex: {
    backgroundColor: '#121212',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 212, 255, 0.2)',
    height: '100%',
  },
  // Desktop left nav container (full height, positioned left)
  desktopLeftNav: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
  },
  // Desktop left nav content wrapper
  desktopLeftNavContainer: {
    backgroundColor: '#121212',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 212, 255, 0.2)',
    height: '100%',
  },
  // Desktop navigator content (to the right of left nav)
  desktopNavigatorContent: {
    flex: 1,
    marginLeft: 80, // Offset for left navigation width
  },
  leftNavContent: {
    flex: 1,
    paddingTop: 20,
    alignItems: 'center',
  },
  logoContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1.5,
    borderColor: 'rgba(33, 150, 243, 0.8)',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 5,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginVertical: 4,
    borderRadius: 12,
    width: '90%',
  },
  navItemActive: {
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
  },
  navLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#2196F3',
    fontWeight: '600',
  },
  // Bottom tab bar styles (mobile/tablet)
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
});
