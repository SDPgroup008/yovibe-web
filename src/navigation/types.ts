import type { NavigatorScreenParams } from "@react-navigation/native"
import type { StackScreenProps } from "@react-navigation/stack"

// Main Stack Navigator
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Main: NavigatorScreenParams<MainTabParamList>
  EventDetail: { eventId: string }
  VenueDetail: { venueId: string }
  TicketPurchase: { eventId: string }
  TicketScanner: { eventId: string }
  PurchasedTickets: undefined
  AddEvent: undefined
  AddVenue: undefined
  AddVibe: { venueId: string }
  ManagePrograms: { venueId: string }
}

// Auth Stack Navigator
export type AuthStackParamList = {
  Login: undefined
  SignUp: undefined
}

// Main Tab Navigator
export type MainTabParamList = {
  Events: NavigatorScreenParams<EventsStackParamList>
  Venues: NavigatorScreenParams<VenuesStackParamList>
  Map: undefined
  Profile: undefined
  Admin: NavigatorScreenParams<AdminStackParamList> | undefined
}

// Events Stack Navigator
export type EventsStackParamList = {
  EventsList: undefined
  EventDetail: { eventId: string }
  EventCalendar: undefined
  TicketPurchase: { eventId: string }
  PurchasedTickets: undefined
}

// Venues Stack Navigator
export type VenuesStackParamList = {
  VenuesList: undefined
  VenueDetail: { venueId: string }
  MyVenues: undefined
  AddVenue: undefined
  ManagePrograms: { venueId: string }
  TodaysVibe: { venueId: string }
  AddVibe: { venueId: string }
}

// Admin Stack Navigator
export type AdminStackParamList = {
  AdminUsers: undefined
  AdminVenues: undefined
  AdminEvents: undefined
}

// Screen Props Types
export type RootStackScreenProps<T extends keyof RootStackParamList> = StackScreenProps<RootStackParamList, T>
export type AuthStackScreenProps<T extends keyof AuthStackParamList> = StackScreenProps<AuthStackParamList, T>
export type MainTabScreenProps<T extends keyof MainTabParamList> = StackScreenProps<MainTabParamList, T>
export type EventsStackScreenProps<T extends keyof EventsStackParamList> = StackScreenProps<EventsStackParamList, T>
export type VenuesStackScreenProps<T extends keyof VenuesStackParamList> = StackScreenProps<VenuesStackParamList, T>
export type AdminStackScreenProps<T extends keyof AdminStackParamList> = StackScreenProps<AdminStackParamList, T>

// Specific Screen Props
export type EventDetailScreenProps = RootStackScreenProps<"EventDetail">
export type VenueDetailScreenProps = RootStackScreenProps<"VenueDetail">
export type TicketPurchaseScreenProps = RootStackScreenProps<"TicketPurchase">
export type TicketScannerScreenProps = RootStackScreenProps<"TicketScanner">
export type AddEventScreenProps = RootStackScreenProps<"AddEvent">
export type AddVenueScreenProps = RootStackScreenProps<"AddVenue">
export type AddVibeScreenProps = RootStackScreenProps<"AddVibe">
export type ManageProgramsScreenProps = RootStackScreenProps<"ManagePrograms">

// Navigation Props
export type NavigationProp = any // Simplified for compatibility
