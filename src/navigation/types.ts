import type { NavigationProp, RouteProp } from "@react-navigation/native"

export type RootStackParamList = {
  // Auth screens
  Login: undefined
  SignUp: undefined

  // Main app screens
  Home: undefined
  Events: undefined
  EventDetail: { eventId: string }
  AddEvent: undefined
  EventCalendar: undefined

  // Venue screens
  Venues: undefined
  VenueDetail: { venueId: string; refresh?: number }
  AddVenue: undefined
  MyVenues: undefined

  // Ticket screens
  TicketPurchase: { eventId: string }
  PurchasedTickets: undefined
  TicketDetail: { ticketId: string }
  TicketScanner: undefined

  // Profile screens
  Profile: undefined

  // Admin screens
  AdminUsers: undefined
  AdminVenues: undefined
  AdminEvents: undefined

  // Vibe screens
  TodaysVibe: undefined
  AddVibe: { venueId: string; venueName: string }

  // Map screens
  Map: { destinationVenueId?: string }

  // Program screens
  ManagePrograms: { venueId: string }
}

export type TabParamList = {
  Home: undefined
  Events: undefined
  Venues: undefined
  Map: undefined
  Profile: undefined
}

// Screen props types
export type EventDetailScreenProps = {
  route: RouteProp<RootStackParamList, "EventDetail">
  navigation: NavigationProp<RootStackParamList, "EventDetail">
}

export type TicketPurchaseScreenProps = {
  route: RouteProp<RootStackParamList, "TicketPurchase">
  navigation: NavigationProp<RootStackParamList, "TicketPurchase">
}

export type MapScreenProps = {
  route: RouteProp<RootStackParamList, "Map">
  navigation: NavigationProp<RootStackParamList, "Map">
}

export type ProfileScreenProps = {
  route: RouteProp<RootStackParamList, "Profile">
  navigation: NavigationProp<RootStackParamList, "Profile">
}

export type VenueDetailScreenProps = {
  route: RouteProp<RootStackParamList, "VenueDetail">
  navigation: NavigationProp<RootStackParamList, "VenueDetail">
}

export type AddVibeScreenProps = {
  route: RouteProp<RootStackParamList, "AddVibe">
  navigation: NavigationProp<RootStackParamList, "AddVibe">
}
