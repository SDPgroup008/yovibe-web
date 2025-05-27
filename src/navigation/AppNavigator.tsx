import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text } from "react-native";

// Auth Screens
import LoginScreen from "../screens/auth/LoginScreen";
import SignUpScreen from "../screens/auth/SignUpScreen";

// Main Screens
import VenuesScreen from "../screens/VenuesScreen";
import VenueDetailScreen from "../screens/VenueDetailScreen";
import EventsScreen from "../screens/EventsScreen";
import EventDetailScreen from "../screens/EventDetailScreen";
import MapScreen from "../screens/MapScreen";
import EventCalendarScreen from "../screens/EventCalendarScreen";
import ProfileScreen from "../screens/ProfileScreen";
import AddVenueScreen from "../screens/AddVenueScreen";
import AddEventScreen from "../screens/AddEventScreen";
import VenuesAddEventScreen from "../screens/VenuesAddEventScreen"; // New import
import MyVenuesScreen from "../screens/MyVenuesScreen";
import ManageProgramsScreen from "../screens/ManageProgramsScreen";

// Admin Screens
import AdminUsersScreen from "../screens/admin/AdminUsersScreen";
import AdminVenuesScreen from "../screens/admin/AdminVenuesScreen";
import AdminEventsScreen from "../screens/admin/AdminEventsScreen";

// Types
import type {
  AuthStackParamList,
  VenuesStackParamList,
  EventsStackParamList,
  MapStackParamList,
  CalendarStackParamList,
  ProfileStackParamList,
  MainTabParamList,
} from "./types";

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary: Caught error in MainTabNavigator:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#121212" }}>
          <Text style={{ color: "#FFFFFF" }}>Error loading main app: {String(this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// Create the navigators
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const VenuesStack = createNativeStackNavigator<VenuesStackParamList>();
const EventsStack = createNativeStackNavigator<EventsStackParamList>();
const MapStack = createNativeStackNavigator<MapStackParamList>();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

// Auth Navigator
export const AuthNavigator = () => {
  console.log("AuthNavigator: Rendering auth screens");
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#121212" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold" },
        gestureEnabled: false,
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
    </AuthStack.Navigator>
  );
};

// Venues Stack Navigator
export const VenuesStackNavigator = () => {
  console.log("VenuesStackNavigator: Rendering venues stack");
  return (
    <VenuesStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#121212" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <VenuesStack.Screen name="VenuesList" component={VenuesScreen} options={{ title: "Venues" }} />
      <VenuesStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <VenuesStack.Screen name="AddEvent" component={VenuesAddEventScreen} options={{ title: "Add Event" }} />
      <VenuesStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <VenuesStack.Screen name="ManagePrograms" component={ManageProgramsScreen} options={{ title: "Weekly Programs" }} />
    </VenuesStack.Navigator>
  );
};

// Events Stack Navigator
export const EventsStackNavigator = () => {
  console.log("EventsStackNavigator: Rendering events stack");
  return (
    <EventsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#121212" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <EventsStack.Screen name="EventsList" component={EventsScreen} options={{ title: "Events" }} />
      <EventsStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <EventsStack.Screen name="AddEvent" component={AddEventScreen} options={{ title: "Add Event" }} />
      <EventsStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
    </EventsStack.Navigator>
  );
};

// Map Stack Navigator
export const MapStackNavigator = () => {
  console.log("MapStackNavigator: Rendering map stack");
  return (
    <MapStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#121212" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <MapStack.Screen name="MapView" component={MapScreen} options={{ title: "Map" }} />
      <MapStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
      <MapStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
    </MapStack.Navigator>
  );
};

// Calendar Stack Navigator
export const CalendarStackNavigator = () => {
  console.log("CalendarStackNavigator: Rendering calendar stack");
  return (
    <CalendarStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#121212" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <CalendarStack.Screen name="CalendarView" component={EventCalendarScreen} options={{ title: "Calendar" }} />
      <CalendarStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event Details" }} />
      <CalendarStack.Screen name="VenueDetail" component={VenueDetailScreen} options={{ title: "Venue Details" }} />
    </CalendarStack.Navigator>
  );
};

// Profile Stack Navigator
export const ProfileStackNavigator = () => {
  console.log("ProfileStackNavigator: Rendering profile stack");
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#121212" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "bold" },
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
    </ProfileStack.Navigator>
  );
};

// Main Tab Navigator
export const MainTabNavigator = () => {
  console.log("MainTabNavigator: Rendering main tab navigator");
  return (
    <ErrorBoundary>
      <MainTab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = "business";
            if (route.name === "Venues") iconName = focused ? "business" : "business-outline";
            else if (route.name === "Events") iconName = focused ? "calendar" : "calendar-outline";
            else if (route.name === "Map") iconName = focused ? "map" : "map-outline";
            else if (route.name === "Calendar") iconName = focused ? "today" : "today-outline";
            else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "#2196F3",
          tabBarInactiveTintColor: "gray",
          tabBarStyle: { backgroundColor: "#121212", borderTopColor: "#333" },
          headerStyle: { backgroundColor: "#121212" },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "bold" },
        })}
      >
        <MainTab.Screen name="Venues" component={VenuesStackNavigator} options={{ headerShown: false }} />
        <MainTab.Screen name="Events" component={EventsStackNavigator} options={{ headerShown: false }} />
        <MainTab.Screen name="Map" component={MapStackNavigator} options={{ headerShown: false }} />
        <MainTab.Screen name="Calendar" component={CalendarStackNavigator} options={{ headerShown: false }} />
        <MainTab.Screen name="Profile" component={ProfileStackNavigator} options={{ headerShown: false }} />
      </MainTab.Navigator>
    </ErrorBoundary>
  );
};