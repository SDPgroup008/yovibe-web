import React from 'react';

// Import all existing screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import VenuesScreen from '../screens/VenuesScreen';
import VenueDetailScreen from '../screens/VenueDetailScreen';
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

// Admin screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminVenuesScreen from '../screens/admin/AdminVenuesScreen';
import AdminEventsScreen from '../screens/admin/AdminEventsScreen';
import AdminOwnershipRequestsScreen from '../screens/admin/AdminOwnershipRequestsScreen';
import OrganiserDashboardScreen from '../screens/OrganiserDashboardScreen';

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

  // Main navigation routes
  {
    path: '/events',
    component: withCompatNavigation(EventsScreen),
    exact: true
  },
  {
    path: '/events/:eventId',
    component: withCompatNavigation(EventDetailScreen)
  },
  {
    path: '/events/add',
    component: withCompatNavigation(AddEventScreen),
    exact: true
  },
  {
    path: '/events/notifications',
    component: withCompatNavigation(NotificationScreen),
    exact: true
  },
  {
    path: '/events/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
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
  {
    path: '/events/payment-callback',
    component: withCompatNavigation(PaymentCallbackScreen),
    exact: true
  },
  {
    path: '/events/my-tickets',
    component: withCompatNavigation(MyTicketsScreen),
    exact: true
  },

  // Venues routes
  {
    path: '/venues',
    component: withCompatNavigation(VenuesScreen),
    exact: true
  },
  {
    path: '/venues/:venueId',
    component: withCompatNavigation(VenueDetailScreen)
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
  {
    path: '/venues/my-tickets',
    component: withCompatNavigation(MyTicketsScreen),
    exact: true
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
  {
    path: '/map/my-tickets',
    component: withCompatNavigation(MyTicketsScreen),
    exact: true
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
  {
    path: '/calendar/my-tickets',
    component: withCompatNavigation(MyTicketsScreen),
    exact: true
  },

  // Profile routes
  {
    path: '/profile',
    component: ProfileScreen,
    exact: true
  },
  {
    path: '/profile/my-venues',
    component: MyVenuesScreen,
    exact: true
  },
  {
    path: '/profile/add-venue',
    component: AddVenueScreen,
    exact: true
  },
  {
    path: '/profile/venues/:venueId',
    component: VenueDetailScreen
  },
  {
    path: '/profile/events/:eventId',
    component: EventDetailScreen
  },
  {
    path: '/profile/notifications',
    component: NotificationScreen,
    exact: true
  },
  {
    path: '/profile/admin/dashboard',
    component: AdminDashboardScreen,
    exact: true
  },
  {
    path: '/profile/admin/users',
    component: AdminUsersScreen,
    exact: true
  },
  {
    path: '/profile/admin/venues',
    component: AdminVenuesScreen,
    exact: true
  },
  {
    path: '/profile/admin/events',
    component: AdminEventsScreen,
    exact: true
  },
  {
    path: '/profile/admin/ownership-requests',
    component: AdminOwnershipRequestsScreen,
    exact: true
  },
  {
    path: '/profile/add-vibe/:venueId',
    component: AddVibeScreen
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
  {
    path: '/profile/my-tickets',
    component: MyTicketsScreen,
    exact: true
  },
  {
    path: '/profile/auth',
    component: SignUpScreen, // This was in the original config
    exact: true
  }
];

// Export the configured router
export { RouterProvider } from './URLRouter';
export { useRouter, useNavigation, Link } from './URLRouter';