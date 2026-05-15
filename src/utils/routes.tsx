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

// Import compatibility wrapper
import { withCompatNavigation } from './compatNavigation';

// Import router utilities
import { RouterProvider, RouteDefinition, withRouteGuard } from '../utils/URLRouter';

// Authentication guard middleware
const requireAuth: RouteDefinition['middleware'] = (params, path) => {
  // This would integrate with your existing auth system
  // For now, return true to allow all routes
  return true;
};

// Admin guard middleware
const requireAdmin: RouteDefinition['middleware'] = (params, path) => {
  // This would check if user is admin
  // For now, return true to allow all routes
  return true;
};

// Route definitions - comprehensive mapping of all existing screens
export const routes: RouteDefinition[] = [
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
    component: withCompatNavigation(withRouteGuard(AddEventScreen, requireAuth)),
    exact: true
  },
  {
    path: '/events/notifications',
    component: withCompatNavigation(withRouteGuard(NotificationScreen, requireAuth)),
    exact: true
  },
  {
    path: '/events/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
  },
  {
    path: '/events/tickets/:eventId',
    component: withCompatNavigation(withRouteGuard(TicketPurchaseScreen, requireAuth))
  },
  {
    path: '/events/scanner/:eventId',
    component: withCompatNavigation(withRouteGuard(TicketScannerScreen, requireAuth))
  },
  {
    path: '/events/organiser/:eventId',
    component: withCompatNavigation(withRouteGuard(OrganiserDashboardScreen, requireAuth))
  },
  {
    path: '/events/payment-callback',
    component: withCompatNavigation(PaymentCallbackScreen),
    exact: true
  },
  {
    path: '/events/my-tickets',
    component: withCompatNavigation(withRouteGuard(MyTicketsScreen, requireAuth)),
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
    path: '/venues/:venueId/add-event',
    component: withCompatNavigation(withRouteGuard(AddEventScreen, requireAuth))
  },
  {
    path: '/venues/events/:eventId',
    component: withCompatNavigation(EventDetailScreen)
  },
  {
    path: '/venues/:venueId/programs',
    component: withCompatNavigation(withRouteGuard(ManageProgramsScreen, requireAuth))
  },
  {
    path: '/venues/:venueId/vibe',
    component: withCompatNavigation(withRouteGuard(TodaysVibeScreen, requireAuth))
  },
  {
    path: '/venues/ticket-contacts',
    component: withCompatNavigation(TicketContactScreen),
    exact: true
  },
  {
    path: '/venues/tickets/:eventId',
    component: withCompatNavigation(withRouteGuard(TicketPurchaseScreen, requireAuth))
  },
  {
    path: '/venues/scanner/:eventId',
    component: withCompatNavigation(withRouteGuard(TicketScannerScreen, requireAuth))
  },
  {
    path: '/venues/organiser/:eventId',
    component: withCompatNavigation(withRouteGuard(OrganiserDashboardScreen, requireAuth))
  },
  {
    path: '/venues/my-tickets',
    component: withCompatNavigation(withRouteGuard(MyTicketsScreen, requireAuth)),
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
    component: withCompatNavigation(withRouteGuard(TicketPurchaseScreen, requireAuth))
  },
  {
    path: '/map/scanner/:eventId',
    component: withCompatNavigation(withRouteGuard(TicketScannerScreen, requireAuth))
  },
  {
    path: '/map/organiser/:eventId',
    component: withCompatNavigation(withRouteGuard(OrganiserDashboardScreen, requireAuth))
  },
  {
    path: '/map/my-tickets',
    component: withCompatNavigation(withRouteGuard(MyTicketsScreen, requireAuth)),
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
    component: withCompatNavigation(withRouteGuard(TicketPurchaseScreen, requireAuth))
  },
  {
    path: '/calendar/scanner/:eventId',
    component: withCompatNavigation(withRouteGuard(TicketScannerScreen, requireAuth))
  },
  {
    path: '/calendar/organiser/:eventId',
    component: withCompatNavigation(withRouteGuard(OrganiserDashboardScreen, requireAuth))
  },
  {
    path: '/calendar/my-tickets',
    component: withCompatNavigation(withRouteGuard(MyTicketsScreen, requireAuth)),
    exact: true
  },

  // Profile routes
  {
    path: '/profile',
    component: withRouteGuard(ProfileScreen, requireAuth),
    exact: true
  },
  {
    path: '/profile/my-venues',
    component: withRouteGuard(MyVenuesScreen, requireAuth),
    exact: true
  },
  {
    path: '/profile/add-venue',
    component: withRouteGuard(AddVenueScreen, requireAuth),
    exact: true
  },
  {
    path: '/profile/venues/:venueId',
    component: withRouteGuard(VenueDetailScreen, requireAuth)
  },
  {
    path: '/profile/events/:eventId',
    component: withRouteGuard(EventDetailScreen, requireAuth)
  },
  {
    path: '/profile/notifications',
    component: withRouteGuard(NotificationScreen, requireAuth),
    exact: true
  },
  {
    path: '/profile/admin/dashboard',
    component: withRouteGuard(AdminDashboardScreen, requireAdmin),
    exact: true
  },
  {
    path: '/profile/admin/users',
    component: withRouteGuard(AdminUsersScreen, requireAdmin),
    exact: true
  },
  {
    path: '/profile/admin/venues',
    component: withRouteGuard(AdminVenuesScreen, requireAdmin),
    exact: true
  },
  {
    path: '/profile/admin/events',
    component: withRouteGuard(AdminEventsScreen, requireAdmin),
    exact: true
  },
  {
    path: '/profile/admin/ownership-requests',
    component: withRouteGuard(AdminOwnershipRequestsScreen, requireAdmin),
    exact: true
  },
  {
    path: '/profile/add-vibe/:venueId',
    component: withRouteGuard(AddVibeScreen, requireAuth)
  },
  {
    path: '/profile/todays-vibe/:venueId',
    component: withRouteGuard(TodaysVibeScreen, requireAuth)
  },
  {
    path: '/profile/ticket-contacts',
    component: withRouteGuard(TicketContactScreen, requireAuth),
    exact: true
  },
  {
    path: '/profile/tickets/:eventId',
    component: withRouteGuard(TicketPurchaseScreen, requireAuth)
  },
  {
    path: '/profile/scanner/:eventId',
    component: withRouteGuard(TicketScannerScreen, requireAuth)
  },
  {
    path: '/profile/organiser/:eventId',
    component: withRouteGuard(OrganiserDashboardScreen, requireAuth)
  },
  {
    path: '/profile/my-tickets',
    component: withRouteGuard(MyTicketsScreen, requireAuth),
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
export { useRouter, useNavigation, Link, withRouteGuard } from './URLRouter';