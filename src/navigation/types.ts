import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { NavigatorScreenParams } from "@react-navigation/native"
import type { Event } from "../models/Event"

// --- Redirect intent type used for soft-auth flows ---
// Represents the route the user attempted to access before being redirected to auth.
// Keep this minimal and flexible so it can represent stack/screen + params.
export type RedirectIntent = {
  routeName: string
  params?: Record<string, unknown>
}

// Auth Stack
export type AuthStackParamList = {
  // Login and SignUp accept an optional redirect intent so the auth flow can restore navigation
  Login: { redirect?: RedirectIntent } | undefined
  SignUp: { redirect?: RedirectIntent } | undefined
}

// Venues Stack
export type VenuesStackParamList = {
  VenuesList: undefined
  VenueDetail: { venueId: string }
  AddEvent: { venueId: string; venueName: string }
  EventDetail: { eventId: string }
  ManagePrograms: { venueId: string; weeklyPrograms: Record<string, string> }
  TodaysVibe: { venueId: string; venueName: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string; eventName: string }
  OrganiserDashboard: { eventId: string }
  MyTickets: undefined
}

// Events Stack
export type EventsStackParamList = {
  EventsList: undefined
  EventDetail: { eventId: string }
  AddEvent: { venueId?: string; venueName?: string }
  VenueDetail: { venueId: string }
  Notification: undefined
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string; eventName: string }
  OrganiserDashboard: { eventId: string }
  PaymentCallback: undefined
  MyTickets: undefined
}

// Map Stack
export type MapStackParamList = {
  MapView: { destinationVenueId?: string }
  VenueDetail: { venueId: string }
  EventDetail: { eventId: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string; eventName: string }
  OrganiserDashboard: { eventId: string }
  MyTickets: undefined
}

// Calendar Stack
export type CalendarStackParamList = {
  CalendarView: undefined
  EventDetail: { eventId: string }
  VenueDetail: { venueId: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string; eventName: string }
  OrganiserDashboard: { eventId: string }
  MyTickets: undefined
}

// Profile Stack
export type ProfileStackParamList = {
  ProfileMain: undefined
  MyVenues: undefined
  AddVenue: undefined
  VenueDetail: { venueId: string }
  EventDetail: { eventId: string }
  AdminUsers: undefined
  AdminVenues: undefined
  AdminEvents: undefined
  AdminDashboard: undefined
  Notification: undefined
  AddVibe: { venueId: string; venueName: string }
  TodaysVibe: { venueId: string; venueName: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
  TicketScanner: { eventId: string; eventName: string }
  OrganiserDashboard: { eventId: string }
  TicketPurchase: { event: Event }
  MyTickets: undefined
  Auth: { screen: "Login" | "SignUp" } // Added for sign-out navigation
}

// Main Tab
export type MainTabParamList = {
  Venues: NavigatorScreenParams<VenuesStackParamList>
  Events: NavigatorScreenParams<EventsStackParamList>
  Map: NavigatorScreenParams<MapStackParamList>
  Calendar: NavigatorScreenParams<CalendarStackParamList>
  Profile: NavigatorScreenParams<ProfileStackParamList>
}

// Screen Props using proper React Navigation types
export type ProfileScreenProps = NativeStackScreenProps<ProfileStackParamList, "ProfileMain">

export type EventDetailScreenProps = NativeStackScreenProps<
  | EventsStackParamList
  | VenuesStackParamList
  | MapStackParamList
  | CalendarStackParamList
  | ProfileStackParamList,
  "EventDetail"
>

export type EventsScreenProps = NativeStackScreenProps<EventsStackParamList, "EventsList">

export type MapScreenProps = NativeStackScreenProps<MapStackParamList, "MapView">

export type VenueDetailScreenProps = NativeStackScreenProps<
  | VenuesStackParamList
  | EventsStackParamList
  | MapStackParamList
  | CalendarStackParamList
  | ProfileStackParamList,
  "VenueDetail"
>

export type TicketContactScreenProps = NativeStackScreenProps<
  | VenuesStackParamList
  | EventsStackParamList
  | MapStackParamList
  | CalendarStackParamList
  | ProfileStackParamList,
  "TicketContactScreen"
>

export type AddEventScreenProps = NativeStackScreenProps<
  VenuesStackParamList | EventsStackParamList,
  "AddEvent"
>

export type ManageProgramsScreenProps = NativeStackScreenProps<VenuesStackParamList, "ManagePrograms">

export type TodaysVibeScreenProps = NativeStackScreenProps<
  VenuesStackParamList | ProfileStackParamList,
  "TodaysVibe"
>

export type AddVibeScreenProps = NativeStackScreenProps<ProfileStackParamList, "AddVibe">

export type TicketScannerScreenProps = NativeStackScreenProps<ProfileStackParamList, "TicketScanner">

export type TicketPurchaseScreenProps = NativeStackScreenProps<ProfileStackParamList, "TicketPurchase">

export type MyTicketsScreenProps = NativeStackScreenProps<ProfileStackParamList, "MyTickets">

export type CalendarScreenProps = NativeStackScreenProps<CalendarStackParamList, "CalendarView">

// Admin Screens
export type AdminUsersScreenProps = NativeStackScreenProps<ProfileStackParamList, "AdminUsers">
export type AdminVenuesScreenProps = NativeStackScreenProps<ProfileStackParamList, "AdminVenues">
export type AdminEventsScreenProps = NativeStackScreenProps<ProfileStackParamList, "AdminEvents">
export type AdminDashboardScreenProps = NativeStackScreenProps<ProfileStackParamList, "AdminDashboard">