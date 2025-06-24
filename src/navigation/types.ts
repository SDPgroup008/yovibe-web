import type { Event } from "../models/Event"
import type { Venue } from "../models/Venue"

// Auth Stack
export type AuthStackParamList = {
  Login: undefined
  SignUp: undefined
}

// Venues Stack
export type VenuesStackParamList = {
  VenuesList: undefined
  VenueDetail: { venue: Venue }
  AddEvent: { venue: Venue }
  EventDetail: { event: Event }
  ManagePrograms: { venue: Venue }
  TodaysVibe: { venue: Venue }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Events Stack
export type EventsStackParamList = {
  EventsList: undefined
  EventDetail: { event: Event }
  AddEvent: { venue?: Venue }
  VenueDetail: { venue: Venue }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Map Stack
export type MapStackParamList = {
  MapView: undefined
  VenueDetail: { venue: Venue }
  EventDetail: { event: Event }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Calendar Stack
export type CalendarStackParamList = {
  CalendarView: undefined
  EventDetail: { event: Event }
  VenueDetail: { venue: Venue }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

// Profile Stack
export type ProfileStackParamList = {
  ProfileMain: undefined
  MyVenues: undefined
  AddVenue: undefined
  VenueDetail: { venue: Venue }
  EventDetail: { event: Event }
  AdminUsers: undefined
  AdminVenues: undefined
  AdminEvents: undefined
  AddVibe: { venue: Venue }
  TodaysVibe: { venue: Venue }
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

// Ticket Screen Props
export type TicketPurchaseScreenProps = {
  route: {
    params: {
      event: Event
    }
  }
  navigation: any
}

export type TicketScannerScreenProps = {
  route: {
    params: {
      eventId: string
    }
  }
  navigation: any
}
