import React from 'react';
import { useRouter, useNavigation } from '../utils/URLRouter';

export { useRouter };

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

export const useIsFocused = (): boolean => {
  return true;
};

export const useCompatNavigation = (): CompatNavigation => {
  const { navigate, goBack } = useNavigation();

  return {
    navigate: (screen: string, params?: Record<string, any>) => {
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
        'Notification': () => navigate('/profile/notifications'),
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
        'AdminStrandedPurchases': () => navigate('/profile/admin/stranded-purchases'),
        'AdminRefunds': () => navigate('/profile/admin/refunds'),
        'AdminWithdrawals': () => navigate('/profile/admin/withdrawals'),
        'Settings': () => navigate('/profile/settings'),
        'HelpSupport': () => navigate('/profile/help'),
        'Auth': () => navigate('/login'),
        'Login': () => navigate('/login'),
        'SignUp': () => navigate('/signup'),
        'TermsAndConditions': () => navigate('/terms'),
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
      if (state.routes && state.routes.length > 0) {
        const firstRoute = state.routes[0];
        navigate(`/${firstRoute.name?.toLowerCase() || 'events'}`);
      }
    },
    setParams: (params) => {
      console.warn('setParams not fully implemented in URL router');
    },
    addListener: (event, callback) => {
      if (event === 'focus') {
        callback();
      }
      return () => {};
    }
  };
};

export const useCompatRoute = (): CompatRoute => {
  const { params, currentPath } = useRouter();

  const pathSegments = currentPath.split('/').filter(Boolean);
  let routeName = 'EventsList';

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
  } else if (pathSegments[0] === 'terms') {
    routeName = 'TermsAndConditions';
  }

  return {
    params,
    name: routeName
  };
};

export const withCompatNavigation = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return (props: P) => {
    const navigation = useCompatNavigation();
    const route = useCompatRoute();

    return <Component {...props} navigation={navigation} route={route} />;
  };
};

export type { CompatNavigation as NavigationProp, CompatRoute as RouteProp };
