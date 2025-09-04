import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { NavigatorScreenParams } from "@react-navigation/native"
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
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
}

// Events Stack
export type EventsStackParamList = {
  EventsList: undefined
  EventDetail: { eventId: string }
  AddEvent: { venueId?: string; venueName?: string }
  VenueDetail: { venueId: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
}

// Map Stack
export type MapStackParamList = {
  MapView: { destinationVenueId?: string }
  VenueDetail: { venueId: string }
  EventDetail: { eventId: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
}

// Calendar Stack
export type CalendarStackParamList = {
  CalendarView: undefined
  EventDetail: { eventId: string }
  VenueDetail: { venueId: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
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
  Login: undefined
  AddVibe: { venueId: string; venueName: string }
  TodaysVibe: { venueId: string; venueName: string }
  TicketContactScreen: { ticketContacts: Array<{ number: string; type: "call" | "whatsapp" }> }
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