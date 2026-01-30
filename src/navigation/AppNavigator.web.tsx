import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { Ionicons } from "@expo/vector-icons"
import { useEffect } from "react"
import { useNavigation } from "@react-navigation/native"
import { View, ActivityIndicator } from "react-native"

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
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
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
  return (
    <VenuesStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
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
    </VenuesStack.Navigator>
  )
}

//
// Events Stack Navigator
//
export const EventsStackNavigator = () => {
  return (
    <EventsStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
      }}
    >
      <EventsStack.Screen name="EventsList" component={EventsScreenWrapper} options={{ title: "Events" }} />
      <EventsStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <EventsStack.Screen name="AddEvent" component={AddEventScreenProtected} options={{ title: "Add Event" }} />
      <VenuesStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <EventsStack.Screen
        name="TicketContactScreen"
        component={TicketContactScreenWrapper}
        options={{ title: "Contact for Tickets" }}
      />
    </EventsStack.Navigator>
  )
}

//
// Map Stack Navigator
//
export const MapStackNavigator = () => {
  return (
    <MapStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
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
    </MapStack.Navigator>
  )
}

//
// Calendar Stack Navigator
//
export const CalendarStackNavigator = () => {
  return (
    <CalendarStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
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
    </CalendarStack.Navigator>
  )
}

//
// Profile Stack Navigator
//
export const ProfileStackNavigator = () => {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
      }}
    >
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreenWrapper} options={{ title: "Profile" }} />
      <ProfileStack.Screen name="MyVenues" component={MyVenuesScreen} options={{ title: "My Venues" }} />
      <ProfileStack.Screen name="AddVenue" component={AddVenueScreenProtected} options={{ title: "Add Venue" }} />
      <ProfileStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <ProfileStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
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
    </ProfileStack.Navigator>
  )
}

//
// Main Tab Navigator
//
export const MainTabNavigator = () => {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
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

          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: "#2196F3",
        tabBarInactiveTintColor: "gray",
        tabBarStyle: {
          backgroundColor: "#121212",
          borderTopColor: "#333",
        },
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "bold",
        },
      })}
    >
      <MainTab.Screen name="Events" component={EventsStackNavigator} options={{ headerShown: false }} />
      <MainTab.Screen name="Venues" component={VenuesStackNavigator} options={{ headerShown: false }} />  
      <MainTab.Screen name="Map" component={MapStackNavigator} options={{ headerShown: false }} />
      <MainTab.Screen name="Calendar" component={CalendarStackNavigator} options={{ headerShown: false }} />
      <MainTab.Screen name="Profile" component={ProfileStackNavigator} options={{ headerShown: false }} />
    </MainTab.Navigator>
  )
}