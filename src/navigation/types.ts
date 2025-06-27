import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { Event } from "../models/Event"

// Auth Stack
export type AuthStackParamList = {
  Login: undefined
  SignUp: undefined
}

// Venues Stack
export type VenuesStackParamList = {
  VenuesList: undefined
  VenueDetail: { venueId: string }
  AddEvent: { venueId: string; venueName: string }
  EventDetail: { eventId: string }
  ManagePrograms: { venueId: string; weeklyPrograms: Record<string, string> }
  TodaysVibe: { venueId: string; venueName: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Events Stack
export type EventsStackParamList = {
  EventsList: undefined
  EventDetail: { eventId: string }
  AddEvent: { venueId?: string; venueName?: string }
  VenueDetail: { venueId: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Map Stack
export type MapStackParamList = {
  MapView: { destinationVenueId?: string }
  VenueDetail: { venueId: string }
  EventDetail: { eventId: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Calendar Stack
export type CalendarStackParamList = {
  CalendarView: undefined
  EventDetail: { eventId: string }
  VenueDetail: { venueId: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
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
  AddVibe: { venueId: string; venueName: string }
  TodaysVibe: { venueId: string; venueName: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Main Tab
export type MainTabParamList = {
  Venues: undefined
  Events: undefined
  Map: undefined
  Calendar: undefined
  Profile: undefined
}


// Screen Props using proper React Navigation types
export type ProfileScreenProps = {
  navigation: any
  route?: any
}

export type EventDetailScreenProps = NativeStackScreenProps<EventsStackParamList, "EventDetail"> & {
  navigation: any
}

export type EventsScreenProps = {
  navigation: any
  route?: any
}

export type MapScreenProps = NativeStackScreenProps<MapStackParamList, "MapView"> & {
  navigation: any
}

export type VenueDetailScreenProps = NativeStackScreenProps<VenuesStackParamList, "VenueDetail"> & {
  navigation: any
}










// Updated Ticket Screen Props - Use React Navigation types
export type TicketPurchaseScreenProps = NativeStackScreenProps<VenuesStackParamList, "TicketPurchase">
export type TicketScannerScreenProps = NativeStackScreenProps<VenuesStackParamList, "TicketScanner">










// Other screen props
export type AddEventScreenProps = {
  navigation: any
  route?: any
}

export type ManageProgramsScreenProps = {
  navigation: any
  route?: any
}

export type TodaysVibeScreenProps = {
  navigation: any
  route?: any
}

export type AddVibeScreenProps = {
  navigation: any
  route?: any
}
