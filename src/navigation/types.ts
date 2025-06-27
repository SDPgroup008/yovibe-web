export type VenuesStackParamList = {
  VenuesList: undefined
  VenueDetail: { venueId: string }
  AddEvent: { venueId: string; venueName: string }
  EventDetail: { eventId: string }
  ManagePrograms: { venueId: string; venueName: string }
  TodaysVibe: { venueId: string; venueName: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

export type EventsStackParamList = {
  EventsList: undefined
  EventDetail: { eventId: string }
  AddEvent: undefined
  VenueDetail: { venueId: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

export type MapStackParamList = {
  MapView: undefined
  VenueDetail: { venueId: string }
  EventDetail: { eventId: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

export type CalendarStackParamList = {
  CalendarView: undefined
  EventDetail: { eventId: string }
  VenueDetail: { venueId: string }
  TicketPurchase: { event: Event }
  TicketScanner: { eventId: string }
}

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

export type AuthStackParamList = {
  Login: undefined
  SignUp: undefined
}

export type MainTabParamList = {
  Venues: undefined
  Events: undefined
  Map: undefined
  Calendar: undefined
  Profile: undefined
}
