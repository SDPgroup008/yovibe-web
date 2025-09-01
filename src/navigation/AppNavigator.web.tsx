import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { Ionicons } from "@expo/vector-icons"

// Auth Screens
import LoginScreen from "../screens/auth/LoginScreen"
import SignUpScreen from "../screens/auth/SignUpScreen"

// Main Screens
import VenuesScreen from "../screens/VenuesScreen"
import VenueDetailScreen from "../screens/VenueDetailScreen"
import EventsScreen from "../screens/EventsScreen"
import EventDetailScreen from "../screens/EventDetailScreen"
import MapScreen from "../screens/MapScreen.web" // Use web-specific MapScreen
import EventCalendarScreen from "../screens/EventCalendarScreen"
import ProfileScreen from "../screens/ProfileScreen"
import AddVenueScreen from "../screens/AddVenueScreen"
import AddEventScreen from "../screens/AddEventScreen"
import MyVenuesScreen from "../screens/MyVenuesScreen"
import ManageProgramsScreen from "../screens/ManageProgramsScreen"
import AddVibeScreen from "../screens/AddVibeScreen"
import TodaysVibeScreen from "../screens/TodaysVibeScreen"



// Admin Screens
import AdminUsersScreen from "../screens/admin/AdminUsersScreen"
import AdminVenuesScreen from "../screens/admin/AdminVenuesScreen"
import AdminEventsScreen from "../screens/admin/AdminEventsScreen"

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

// Create the navigators
const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const MainTab = createBottomTabNavigator<MainTabParamList>()
const VenuesStack = createNativeStackNavigator<VenuesStackParamList>()
const EventsStack = createNativeStackNavigator<EventsStackParamList>()
const MapStack = createNativeStackNavigator<MapStackParamList>()
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>()
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

// Auth Navigator
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
        // Add this to prevent going back to auth screens after login
        gestureEnabled: false,
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
    </AuthStack.Navigator>
  )
}

// Venues Stack Navigator
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
      <VenuesStack.Screen name="AddEvent" component={AddEventScreen as any} options={{ title: "Add Event" }} />
      <VenuesStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <VenuesStack.Screen
        name="ManagePrograms"
        component={ManageProgramsScreen as any}
        options={{ title: "Weekly Programs" }}
      />
      <VenuesStack.Screen name="TodaysVibe" component={TodaysVibeScreen as any} options={{ title: "Today's Vibe" }} />
      
    </VenuesStack.Navigator>
  )
}

// Events Stack Navigator
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
      <EventsStack.Screen name="EventsList" component={EventsScreen} options={{ title: "Events" }} />
      <EventsStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <EventsStack.Screen name="AddEvent" component={AddEventScreen as any} options={{ title: "Add Event" }} />
      <EventsStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
    
    </EventsStack.Navigator>
  )
}

// Map Stack Navigator
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
      <MapStack.Screen name="MapView" component={MapScreen} options={{ title: "Map" }} />
      <MapStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <MapStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      
    </MapStack.Navigator>
  )
}

// Calendar Stack Navigator
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
     
    </CalendarStack.Navigator>
  )
}

// Profile Stack Navigator
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
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} options={{ title: "Profile" }} />
      <ProfileStack.Screen name="MyVenues" component={MyVenuesScreen} options={{ title: "My Venues" }} />
      <ProfileStack.Screen name="AddVenue" component={AddVenueScreen} options={{ title: "Add Venue" }} />
      <ProfileStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <ProfileStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <ProfileStack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: "Manage Users" }} />
      <ProfileStack.Screen name="AdminVenues" component={AdminVenuesScreen} options={{ title: "Manage Venues" }} />
      <ProfileStack.Screen name="AdminEvents" component={AdminEventsScreen} options={{ title: "Manage Events" }} />
      <ProfileStack.Screen name="AddVibe" component={AddVibeScreen as any} options={{ title: "Add Vibe" }} />
      <ProfileStack.Screen name="TodaysVibe" component={TodaysVibeScreen as any} options={{ title: "Today's Vibe" }} />
      {/* ADD THESE SCREENS */}
      <ProfileStack.Screen 
        name="TicketPurchase" 
        component={TicketPurchaseScreen} 
        options={{ title: "Purchase Ticket" }} 
      />
      <ProfileStack.Screen 
        name="TicketScanner" 
        component={TicketScannerScreen} 
        options={{ title: "Scan Tickets" }} 
      />
    </ProfileStack.Navigator>
  )
}

// Main Tab Navigator
export const MainTabNavigator = () => {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = ""
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
          return <Ionicons name={iconName as any} size={size} color={color} />
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
      <MainTab.Screen name="Venues" component={VenuesStackNavigator} options={{ headerShown: false }} />
      <MainTab.Screen name="Events" component={EventsStackNavigator} options={{ headerShown: false }} />
      <MainTab.Screen name="Map" component={MapStackNavigator} options={{ headerShown: false }} />
      <MainTab.Screen name="Calendar" component={CalendarStackNavigator} options={{ headerShown: false }} />
      <MainTab.Screen name="Profile" component={ProfileStackNavigator} options={{ headerShown: false }} />
    </MainTab.Navigator>
  )
}