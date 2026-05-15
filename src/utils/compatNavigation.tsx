import React from 'react';
import { useRouter, useNavigation } from '../utils/URLRouter';

// Compatibility layer for existing screens
// This provides the same interface as React Navigation

export interface CompatRoute {
  params: Record<string, any>;
  name?: string;
}

export interface CompatNavigation {
  navigate: (screen: string, params?: Record<string, any>) => void;
  goBack: () => void;
  reset: (state: any) => void;
  setParams: (params: Record<string, any>) => void;
  addListener: (event: string, callback: () => void) => () => void;
}

// Compatibility hook for useIsFocused
export const useIsFocused = (): boolean => {
  // For URL routing, a screen is "focused" when it matches the current path
  // Since we don't have a concept of focus in URL routing like React Navigation,
  // we'll return true for now (screens are always "focused" in single-page apps)
  return true;
};

// Hook that provides React Navigation compatible interface
export const useCompatNavigation = (): CompatNavigation => {
  const { navigate, goBack } = useNavigation();

  return {
    navigate: (screen: string, params?: Record<string, any>) => {
      // Convert screen names to routes
      const routeMap: Record<string, (params?: Record<string, any>) => void> = {
        'Events': () => navigate('/events'),
        'EventDetail': (params) => navigate(`/events/${params?.eventId}`),
        'Venues': () => navigate('/venues'),
        'VenueDetail': (params) => navigate(`/venues/${params?.venueId}`),
        'MapView': () => navigate('/map'),
        'CalendarView': () => navigate('/calendar'),
        'ProfileMain': () => navigate('/profile'),
        'AddEvent': (params) => navigate('/events/add', params),
        'TicketPurchase': (params) => navigate(`/events/tickets/${params?.eventId}`, params),
        'TicketScanner': (params) => navigate(`/events/scanner/${params?.eventId}`, params),
        'OrganiserDashboard': (params) => navigate(`/events/organiser/${params?.eventId}`, params),
        'TicketContactScreen': (params) => navigate('/events/ticket-contacts', params),
        'MyTickets': () => navigate('/profile/my-tickets'),
        'Notification': () => navigate('/events/notifications'),
        'PaymentCallback': () => navigate('/events/payment-callback'),
        'AddVenue': () => navigate('/profile/add-venue'),
        'MyVenues': () => navigate('/profile/my-venues'),
        'ManagePrograms': (params) => navigate(`/venues/${params?.venueId}/programs`, params),
        'TodaysVibe': (params) => navigate(`/venues/${params?.venueId}/vibe`, params),
        'AddVibe': (params) => navigate(`/profile/add-vibe/${params?.venueId}`, params),
        'AdminDashboard': () => navigate('/profile/admin/dashboard'),
        'AdminUsers': () => navigate('/profile/admin/users'),
        'AdminVenues': () => navigate('/profile/admin/venues'),
        'AdminEvents': () => navigate('/profile/admin/events'),
        'AdminOwnershipRequests': () => navigate('/profile/admin/ownership-requests'),
        'Auth': () => navigate('/login'),
        'Login': () => navigate('/login'),
        'SignUp': () => navigate('/signup'),
      };

      const navigateFn = routeMap[screen];
      if (navigateFn) {
        navigateFn(params);
      } else {
        console.warn(`No route mapping found for screen: ${screen}`);
      }
    },
    goBack,
    reset: (state) => {
      // Simplified reset - just navigate to the first route
      if (state.routes && state.routes.length > 0) {
        const firstRoute = state.routes[0];
        navigate(`/${firstRoute.name?.toLowerCase() || 'events'}`);
      }
    },
    setParams: (params) => {
      // This would be complex to implement - skip for compatibility
      console.warn('setParams not fully implemented in URL router');
    },
    addListener: (event, callback) => {
      // Return unsubscribe function
      if (event === 'focus') {
        callback(); // Call immediately for compatibility
      }
      return () => {}; // No-op unsubscribe
    }
  };
};

// Hook that provides route params
export const useCompatRoute = (): CompatRoute => {
  const { params, currentPath } = useRouter();

  // Extract route name from path
  const pathSegments = currentPath.split('/').filter(Boolean);
  let routeName = 'EventsList'; // default

  if (pathSegments[0] === 'events') {
    routeName = pathSegments[1] ? 'EventDetail' : 'EventsList';
  } else if (pathSegments[0] === 'venues') {
    routeName = pathSegments[1] ? 'VenueDetail' : 'VenuesList';
  } else if (pathSegments[0] === 'map') {
    routeName = 'MapView';
  } else if (pathSegments[0] === 'calendar') {
    routeName = 'CalendarView';
  } else if (pathSegments[0] === 'profile') {
    routeName = 'ProfileMain';
  }

  return {
    params,
    name: routeName
  };
};

// HOC to make screens compatible with URL router
export const withCompatNavigation = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return (props: P) => {
    const navigation = useCompatNavigation();
    const route = useCompatRoute();

    return <Component {...props} navigation={navigation} route={route} />;
  };
};

// Export compatibility types
export type { CompatNavigation as NavigationProp, CompatRoute as RouteProp };