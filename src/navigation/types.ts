import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack"

// Define the param lists for each stack
export type RootStackParamList = {
  Auth: undefined
  Main: undefined
}

export type AuthStackParamList = {
  Login: undefined
  SignUp: undefined
}

export type VenuesStackParamList = {
  VenuesList: undefined
  VenueDetail: { venueId: string }
  AddEvent: { venueId: string; venueName: string }
  ManagePrograms: { venueId: string; weeklyPrograms: Record<string, string> }
  EventDetail: { eventId: string }
}

export type EventsStackParamList = {
  EventsList: undefined
  EventDetail: { eventId: string }
  AddEvent: { venueId?: string; venueName?: string }
  VenueDetail: { venueId: string }
}

export type MapStackParamList = {
  MapView: { destinationVenueId?: string }
  VenueDetail: { venueId: string }
  EventDetail: { eventId: string }
}

export type CalendarStackParamList = {
  CalendarView: undefined
  EventDetail: { eventId: string }
  VenueDetail: { venueId: string }
}

export type ProfileStackParamList = {
  ProfileMain: undefined
  MyVenues: undefined
  AddVenue: undefined
  EditProfile: undefined
  VenueDetail: { venueId: string }
  EventDetail: { eventId: string }
  AdminUsers: undefined
  AdminVenues: undefined
  AdminEvents: undefined
}

// Define the tab navigator param list
export type MainTabParamList = {
  Venues: undefined | { screen: keyof VenuesStackParamList; params: any }
  Events: undefined | { screen: keyof EventsStackParamList; params: any }
  Map: undefined | { screen: keyof MapStackParamList; params: any }
  Calendar: undefined | { screen: keyof CalendarStackParamList; params: any }
  Profile: undefined | { screen: keyof ProfileStackParamList; params: any }
}

// Create a more flexible navigation type that allows cross-stack navigation
export type AppNavigation = any

// Screen props using NativeStackScreenProps
export type VenueDetailScreenProps = NativeStackScreenProps<VenuesStackParamList, "VenueDetail"> & {
  navigation: AppNavigation
}

export type EventDetailScreenProps = NativeStackScreenProps<EventsStackParamList, "EventDetail"> & {
  navigation: AppNavigation
}

export type AddEventScreenProps = NativeStackScreenProps<EventsStackParamList, "AddEvent"> & {
  navigation: AppNavigation
}

export type ManageProgramsScreenProps = NativeStackScreenProps<VenuesStackParamList, "ManagePrograms"> & {
  navigation: AppNavigation
}

export type MapScreenProps = NativeStackScreenProps<MapStackParamList, "MapView"> & {
  navigation: AppNavigation
}

// Navigation props for each screen
export type VenuesScreenProps = {
  navigation: AppNavigation
}

export type EventsScreenProps = {
  navigation: AppNavigation
}

export type EventCalendarScreenProps = {
  navigation: AppNavigation
}

export type ProfileScreenProps = {
  navigation: AppNavigation
}

export type MyVenuesScreenProps = {
  navigation: AppNavigation
}

export type AddVenueScreenProps = {
  navigation: AppNavigation
}

export type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList>
}

export type SignUpScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList>
}

// Admin screen props
export type AdminUsersScreenProps = {
  navigation: AppNavigation
}

export type AdminVenuesScreenProps = {
  navigation: AppNavigation
}

export type AdminEventsScreenProps = {
  navigation: AppNavigation
}
