export type RootStackParamList = {
  // Auth screens
  Login: undefined
  SignUp: undefined

  // Main app screens
  Home: undefined
  Events: undefined
  EventDetail: { eventId: string }
  AddEvent: { venueId?: string; venueName?: string } // Added optional venue params
  EventCalendar: undefined

  // Venue screens
  Venues: undefined
  VenueDetail: { venueId: string }
  AddVenue: undefined
  MyVenues: undefined

  TicketContact: { eventId: string }

  // Profile screens
  Profile: undefined

  // Admin screens
  AdminUsers: undefined
  AdminVenues: undefined
  AdminEvents: undefined

  // Vibe screens
  TodaysVibe: { venueId?: string; venueName?: string } // Added optional venue params
  AddVibe: { venueId: string; venueName?: string } // Updated to include venueName

  // Map screens
  Map: undefined

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

export type AddEventScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"AddEvent">
}

export type EventsScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"Events">
}

export type MapScreenProps = {
  navigation: NavigationProp & {
    addListener: (event: string, callback: () => void) => () => void
  }
  route: RouteProp<"Map"> & {
    params: { destinationVenueId?: string }
  }
}

export type ProfileScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"Profile">
}

export type VenueDetailScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"VenueDetail">
}

export type TicketContactScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"TicketContact">
}

export type AddVibeScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"AddVibe"> & {
    params: { venueId: string; venueName?: string }
  }
}

export type ManageProgramsScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"ManagePrograms">
}

export type TodaysVibeScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"TodaysVibe">
}

export type EventDetailScreenProps = {
  navigation: NavigationProp
  route: RouteProp<"EventDetail">
}

// Navigation prop types
export type NavigationProp = {
  navigate: (screen: keyof RootStackParamList, params?: any) => void
  goBack: () => void
  push: (screen: keyof RootStackParamList, params?: any) => void
  replace: (screen: keyof RootStackParamList, params?: any) => void
  reset: (state: any) => void
  addListener: (event: string, callback: () => void) => () => void
}

// Route prop types
export type RouteProp<T extends keyof RootStackParamList> = {
  params: RootStackParamList[T]
  key: string
  name: T
}
