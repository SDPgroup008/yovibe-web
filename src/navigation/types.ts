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
  VenueDetail: { venueId: string }
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
  AddVibe: undefined

  // Map screens
  Map: undefined

  // Program screens
  ManagePrograms: undefined
}

export type TabParamList = {
  Home: undefined
  Events: undefined
  Venues: undefined
  Map: undefined
  Profile: undefined
}

// Navigation prop types
export type NavigationProp = {
  navigate: (screen: keyof RootStackParamList, params?: any) => void
  goBack: () => void
  push: (screen: keyof RootStackParamList, params?: any) => void
  replace: (screen: keyof RootStackParamList, params?: any) => void
  reset: (state: any) => void
}

// Route prop types
export type RouteProp<T extends keyof RootStackParamList> = {
  params: RootStackParamList[T]
  key: string
  name: T
}
