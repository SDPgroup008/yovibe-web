import React from 'react';

// Import all existing screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import TermsAndConditionsScreen from '../screens/auth/TermsAndConditionsScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import EventsRouteScreen from '../screens/EventsRouteScreen';
import VenuesScreen from '../screens/VenuesScreen';
import VenueDetailScreen from '../screens/VenueDetailScreen';
import VenuesRouteScreen from '../screens/VenuesRouteScreen';
import MapScreen from '../screens/MapScreen.web';
import EventCalendarScreen from '../screens/EventCalendarScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AddEventScreen from '../screens/AddEventScreen';
import AddVenueScreen from '../screens/AddVenueScreen';
import MyVenuesScreen from '../screens/MyVenuesScreen';
import ManageProgramsScreen from '../screens/ManageProgramsScreen';
import AddVibeScreen from '../screens/AddVibeScreen';
import TodaysVibeScreen from '../screens/TodaysVibeScreen';
import TicketContactScreen from '../screens/TicketContactScreen';
import TicketPurchaseScreen from '../screens/TicketPurchaseScreen';
import TicketScannerScreen from '../screens/TicketScannerScreen';
import MyTicketsScreen from '../screens/MyTicketsScreen';
import NotificationScreen from '../screens/NotificationScreen';
import PaymentCallbackScreen from '../screens/PaymentCallbackScreen';
import ResendTicketScreen from '../screens/ResendTicketScreen';
import AddPhotoScreen from '../screens/AddPhotoScreen';

// Admin screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminVenuesScreen from '../screens/admin/AdminVenuesScreen';
import AdminEventsScreen from '../screens/admin/AdminEventsScreen';
import AdminOwnershipRequestsScreen from '../screens/admin/AdminOwnershipRequestsScreen';
import AdminStrandedPurchasesScreen from '../screens/admin/AdminStrandedPurchasesScreen';
import OrganiserDashboardScreen from '../screens/OrganiserDashboardScreen';
import TokenScannerScreen from '../screens/auth/TokenScannerScreen';

// Import compatibility wrapper
import { withCompatNavigation } from './compatNavigation';

// Import router utilities
import { RouterProvider, RouteDefinition } from '../utils/URLRouter';

// Authentication and admin guards are handled by individual screens using withAuth HOC
// No global middleware needed - screens manage their own auth requirements

// Route definitions - comprehensive mapping of all existing screens
export const routes: RouteDefinition[] = [
  // Root route - redirect to main events screen
  {
    path: '/',
    component: () => {
      // Redirect root to events
      React.useEffect(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/events';
        }
      }, []);
      return null;
    },
    exact: true
  },

  // Authentication routes
  {
    path: '/login',
    component: LoginScreen,
    exact: true
  },
  {
    path: '/signup',
    component: SignUpScreen,
    exact: true
  },
  {
    path: '/terms',
    component: TermsAndConditionsScreen,
    exact: true
  },
  {
    path: '/scan/:token',
    component: withCompatNavigation(TokenScannerScreen),
    exact: true
  },

  // Main navigation routes
  {
    path: '/events',
    component: withCompatNavigation(EventsScreen),
    exact: true
  },
  // Static sub-routes must come BEFORE the dynamic /events/:eventId
  {
    path: '/events/add',
    component: withCompatNavigation(AddEventScreen),
    exact: true
  },
  {
    path: '/events/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
  },
  {
    path: '/events/payment-callback',
    component: withCompatNavigation(PaymentCallbackScreen),
    exact: true
  },
  // Dynamic catch-all for event details (must be after static routes)
  {
    path: '/events/:eventId',
    component: withCompatNavigation(EventsRouteScreen)
  },
  {
    path: '/events/tickets/:eventId',
    component: withCompatNavigation(TicketPurchaseScreen)
  },
  {
    path: '/events/scanner/:eventId',
    component: withCompatNavigation(TicketScannerScreen)
  },
  {
    path: '/events/organiser/:eventId',
    component: withCompatNavigation(OrganiserDashboardScreen)
  },


  // Venues routes
  {
    path: '/venues',
    component: withCompatNavigation(VenuesScreen),
    exact: true
  },
  {
    path: '/venues/add-event',
    component: withCompatNavigation(AddEventScreen),
    exact: true
  },
  {
    path: '/venues/:venueId/programs',
    component: withCompatNavigation(ManageProgramsScreen)
  },
  {
    path: '/venues/:venueId/vibe',
    component: withCompatNavigation(TodaysVibeScreen)
  },
  {
    path: '/venues/events/:eventId',
    component: withCompatNavigation(EventDetailScreen)
  },
  {
    path: '/venues/:venueId/programs',
    component: withCompatNavigation(ManageProgramsScreen)
  },
  {
    path: '/venues/:venueId/vibe',
    component: withCompatNavigation(TodaysVibeScreen)
  },
  {
    path: '/venues/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
  },
  {
    path: '/venues/tickets/:eventId',
    component: withCompatNavigation(TicketPurchaseScreen)
  },
  {
    path: '/venues/scanner/:eventId',
    component: withCompatNavigation(TicketScannerScreen)
  },
  {
    path: '/venues/organiser/:eventId',
    component: withCompatNavigation(OrganiserDashboardScreen)
  },
  // Dynamic catch-all for venue detail or location-filtered listings (must be after static routes)
  {
    path: '/venues/:venueId',
    component: withCompatNavigation(VenuesRouteScreen)
  },


  // Map routes
  {
    path: '/map',
    component: withCompatNavigation(MapScreen),
    exact: true
  },
  {
    path: '/map/venues/:venueId',
    component: withCompatNavigation(VenueDetailScreen)
  },
  {
    path: '/map/events/:eventId',
    component: withCompatNavigation(EventDetailScreen)
  },
  {
    path: '/map/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
  },
  {
    path: '/map/tickets/:eventId',
    component: withCompatNavigation(TicketPurchaseScreen)
  },
  {
    path: '/map/scanner/:eventId',
    component: withCompatNavigation(TicketScannerScreen)
  },
  {
    path: '/map/organiser/:eventId',
    component: withCompatNavigation(OrganiserDashboardScreen)
  },


  // Calendar routes
  {
    path: '/calendar',
    component: withCompatNavigation(EventCalendarScreen),
    exact: true
  },
  {
    path: '/calendar/events/:eventId',
    component: withCompatNavigation(EventDetailScreen)
  },
  {
    path: '/calendar/venues/:venueId',
    component: withCompatNavigation(VenueDetailScreen)
  },
  {
    path: '/calendar/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
  },
  {
    path: '/calendar/tickets/:eventId',
    component: withCompatNavigation(TicketPurchaseScreen)
  },
  {
    path: '/calendar/scanner/:eventId',
    component: withCompatNavigation(TicketScannerScreen)
  },
  {
    path: '/calendar/organiser/:eventId',
    component: withCompatNavigation(OrganiserDashboardScreen)
  },


  // Profile routes
  {
    path: '/profile',
    component: withCompatNavigation(ProfileScreen),
    exact: true
  },
  {
    path: '/profile/my-venues',
    component: withCompatNavigation(MyVenuesScreen),
    exact: true
  },
  {
    path: '/profile/add-venue',
    component: withCompatNavigation(AddVenueScreen),
    exact: true
  },
  {
    path: '/profile/venues/:venueId',
    component: withCompatNavigation(VenueDetailScreen)
  },
  {
    path: '/profile/events/:eventId',
    component: withCompatNavigation(EventDetailScreen)
  },
  {
    path: '/profile/notifications',
    component: withCompatNavigation(NotificationScreen),
    exact: true
  },
  {
    path: '/profile/admin/dashboard',
    component: withCompatNavigation(AdminDashboardScreen),
    exact: true
  },
  {
    path: '/profile/admin/users',
    component: withCompatNavigation(AdminUsersScreen),
    exact: true
  },
  {
    path: '/profile/admin/venues',
    component: withCompatNavigation(AdminVenuesScreen),
    exact: true
  },
  {
    path: '/profile/admin/events',
    component: withCompatNavigation(AdminEventsScreen),
    exact: true
  },
  {
    path: '/profile/admin/ownership-requests',
    component: withCompatNavigation(AdminOwnershipRequestsScreen),
    exact: true
  },
  {
    path: '/profile/admin/stranded-purchases',
    component: withCompatNavigation(AdminStrandedPurchasesScreen),
    exact: true
  },
  {
    path: '/profile/add-vibe/:venueId',
    component: withCompatNavigation(AddVibeScreen)
  },
  {
    path: '/profile/todays-vibe/:venueId',
    component: withCompatNavigation(TodaysVibeScreen)
  },
  {
    path: '/profile/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
  },
  {
    path: '/profile/tickets/:eventId',
    component: withCompatNavigation(TicketPurchaseScreen)
  },
  {
    path: '/profile/scanner/:eventId',
    component: withCompatNavigation(TicketScannerScreen)
  },
  {
    path: '/profile/organiser/:eventId',
    component: withCompatNavigation(OrganiserDashboardScreen)
  },
  {
    path: '/profile/my-tickets',
    component: withCompatNavigation(MyTicketsScreen),
    exact: true
  },
  {
    path: '/profile/resend-ticket',
    component: withCompatNavigation(ResendTicketScreen),
    exact: true
  },
  {
    path: '/add-photo',
    component: withCompatNavigation(AddPhotoScreen),
    exact: true
  },

  {
    path: '/profile/todays-vibe/:venueId',
    component: TodaysVibeScreen
  },
  {
    path: '/profile/ticket-contacts',
    component: TicketContactScreen,
    exact: true
  },
  {
    path: '/profile/tickets/:eventId',
    component: TicketPurchaseScreen
  },
  {
    path: '/profile/scanner/:eventId',
    component: TicketScannerScreen
  },
  {
    path: '/profile/organiser/:eventId',
    component: OrganiserDashboardScreen
  },

];

// Export the configured router
export { RouterProvider } from './URLRouter';
export { useRouter, useNavigation, Link } from './URLRouter';