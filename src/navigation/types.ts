import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

// Define the param lists for each stack
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type VenuesStackParamList = {
  VenuesList: undefined;
  VenueDetail: { venueId: string };
  AddEvent: { venueId: string; venueName: string };
  ManagePrograms: { venueId: string; weeklyPrograms: Record<string, string> };
  EventDetail: { eventId: string };
};

export type EventsStackParamList = {
  EventsList: undefined;
  EventDetail: { eventId: string };
  AddEvent: { venueId?: string; venueName?: string };
  VenueDetail: { venueId: string };
};

export type MapStackParamList = {
  MapView: { destinationVenueId?: string };
  VenueDetail: { venueId: string };
  EventDetail: { eventId: string };
};

export type CalendarStackParamList = {
  CalendarView: undefined;
  EventDetail: { eventId: string };
  VenueDetail: { venueId: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  MyVenues: undefined;
  AddVenue: undefined;
  EditProfile: undefined;
  VenueDetail: { venueId: string };
  EventDetail: { eventId: string };
  AdminUsers: undefined;
  AdminVenues: undefined;
  AdminEvents: undefined;
};

// Define the tab navigator param list
export type MainTabParamList = {
  Venues: undefined | { screen: keyof VenuesStackParamList; params: any };
  Events: undefined | { screen: keyof EventsStackParamList; params: any };
  Map: undefined | { screen: keyof MapStackParamList; params: any };
  Calendar: undefined | { screen: keyof CalendarStackParamList; params: any };
  Profile: undefined | { screen: keyof ProfileStackParamList; params: any };
};

// Composite navigation type
export type AppNavigation = NativeStackNavigationProp<
  RootStackParamList & AuthStackParamList & VenuesStackParamList & EventsStackParamList & MapStackParamList & CalendarStackParamList & ProfileStackParamList
> &
  BottomTabNavigationProp<MainTabParamList>;

// Screen props using NativeStackScreenProps
export type VenueDetailScreenProps = NativeStackScreenProps<VenuesStackParamList, "VenueDetail">;
export type EventDetailScreenProps = NativeStackScreenProps<EventsStackParamList, "EventDetail">;
export type AddEventScreenProps<T extends VenuesStackParamList | EventsStackParamList> = NativeStackScreenProps<T, "AddEvent">;
export type ManageProgramsScreenProps = NativeStackScreenProps<VenuesStackParamList, "ManagePrograms">;
export type MapScreenProps = NativeStackScreenProps<MapStackParamList, "MapView">;

// Navigation props for each screen
export type VenuesScreenProps = { navigation: AppNavigation };
export type EventsScreenProps = { navigation: AppNavigation };
export type EventCalendarScreenProps = { navigation: AppNavigation };
export type ProfileScreenProps = { navigation: AppNavigation };
export type MyVenuesScreenProps = { navigation: AppNavigation };
export type AddVenueScreenProps = { navigation: AppNavigation };
export type LoginScreenProps = { navigation: NativeStackNavigationProp<AuthStackParamList> };
export type SignUpScreenProps = { navigation: NativeStackNavigationProp<AuthStackParamList> };
export type AdminUsersScreenProps = { navigation: AppNavigation };
export type AdminVenuesScreenProps = { navigation: AppNavigation };
export type AdminEventsScreenProps = { navigation: AppNavigation };