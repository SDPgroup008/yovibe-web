/**
 * SEORouter.ts - SEO Configuration for URL Routing System
 * 
 * Maps all routes to their appropriate SEO metadata and configurations.
 * Ensures proper meta tags, canonical URLs, and structured data for each page.
 * 
 * This file works in conjunction with:
 * - src/utils/URLRouter.tsx (URL routing)
 * - src/components/SEOMetadata.tsx (Meta tag generation)
 * - public/sitemap.xml (Search engine discovery)
 * - public/robots.txt (Crawl directives)
 */

import { SEOMetadataProps } from '../components/SEOMetadata';

export interface RouteSEOConfig {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  priority: 'high' | 'medium' | 'low';
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  noindex?: boolean;
  nofollow?: boolean;
  type?: 'website' | 'article' | 'event' | 'venue' | 'profile';
}

/**
 * Complete SEO Configuration for all routes
 * Used by:
 * - Sitemap generation
 * - robots.txt configuration
 * - Meta tag injection
 * - Canonical URL generation
 */
export const ROUTE_SEO_CONFIG: Record<string, RouteSEOConfig> = {
  // ============================================
  // PRIMARY ROUTES - High Priority
  // ============================================
  
  '/': {
    path: '/',
    title: 'YoVibe | Best Nightlife Events, Parties & Venues in Uganda',
    description: 'YoVibe is your ultimate guide to nightlife, events, entertainment, and vibes in Uganda. Discover the best venues, clubs, bars, parties, concerts, and experiences.',
    keywords: ['yovibe', 'nightlife', 'events', 'venues', 'parties', 'uganda', 'kampala'],
    priority: 'high',
    changefreq: 'daily',
    type: 'website',
  },

  '/events': {
    path: '/events',
    title: 'Events in Kampala - Parties, Concerts & Nightlife | YoVibe',
    description: 'Browse all upcoming events, parties, concerts, DJ nights, and live music in Kampala and Uganda. Find the best events, see who\'s going, and buy tickets on YoVibe.',
    keywords: ['events', 'parties', 'concerts', 'DJ nights', 'live music', 'kampala events', 'uganda events'],
    priority: 'high',
    changefreq: 'daily',
    type: 'website',
  },

  '/venues': {
    path: '/venues',
    title: 'Nightlife Venues & Clubs in Kampala | YoVibe',
    description: 'Discover the best nightlife venues, clubs, bars, lounges, and rooftop bars in Kampala. Find the perfect venue for your night out with YoVibe.',
    keywords: ['venues', 'clubs', 'bars', 'lounges', 'rooftops', 'nightlife', 'kampala venues'],
    priority: 'high',
    changefreq: 'daily',
    type: 'website',
  },

  '/map': {
    path: '/map',
    title: 'Explore Nightlife Map - YoVibe',
    description: 'Explore nightlife venues and events on the map. Find clubs, bars, and entertainment spots near you in Kampala and Uganda.',
    keywords: ['map', 'nightlife map', 'venues near me', 'clubs near me', 'kampala map'],
    priority: 'medium',
    changefreq: 'weekly',
    type: 'website',
  },

  '/calendar': {
    path: '/calendar',
    title: 'Event Calendar - Upcoming Events | YoVibe',
    description: 'View the complete calendar of events, parties, concerts, and nightlife experiences in Kampala and Uganda. Plan your weekends with YoVibe.',
    keywords: ['calendar', 'events calendar', 'schedule', 'upcoming events', 'weekend events'],
    priority: 'high',
    changefreq: 'daily',
    type: 'website',
  },

  // ============================================
  // EVENTS ROUTES - High Priority (Dynamic)
  // ============================================

  '/events/:eventId': {
    path: '/events/:eventId',
    title: 'Event Details - YoVibe',
    description: 'View detailed information about this event including date, time, venue, and ticket information.',
    keywords: ['event details', 'event tickets', 'party', 'concert', 'nightlife'],
    priority: 'high',
    changefreq: 'daily',
    type: 'event',
  },

  // ============================================
  // VENUES ROUTES - High Priority (Dynamic)
  // ============================================

  '/venues/:venueId': {
    path: '/venues/:venueId',
    title: 'Venue Details - YoVibe',
    description: 'View detailed information about this nightlife venue including location, events, ratings, and contact information.',
    keywords: ['venue details', 'club', 'bar', 'lounge', 'venue information'],
    priority: 'high',
    changefreq: 'daily',
    type: 'venue',
  },

  '/venues/:venueId/programs': {
    path: '/venues/:venueId/programs',
    title: 'Venue Programs & Schedule - YoVibe',
    description: 'View all upcoming events and programs at this venue.',
    keywords: ['venue programs', 'events schedule', 'venue events'],
    priority: 'medium',
    changefreq: 'weekly',
    type: 'website',
  },

  '/venues/:venueId/vibe': {
    path: '/venues/:venueId/vibe',
    title: 'Today\'s Vibe - YoVibe',
    description: 'See what\'s happening at this venue today including the current vibe and atmosphere.',
    keywords: ['vibe', 'venue vibe', 'tonight', 'atmosphere'],
    priority: 'medium',
    changefreq: 'daily',
    type: 'website',
  },

  // ============================================
  // CALENDAR VIEW ROUTES
  // ============================================

  '/calendar/events/:eventId': {
    path: '/calendar/events/:eventId',
    title: 'Event Details - Calendar View - YoVibe',
    description: 'View event details from calendar view.',
    keywords: ['event', 'calendar', 'details'],
    priority: 'medium',
    changefreq: 'daily',
    type: 'event',
  },

  '/calendar/venues/:venueId': {
    path: '/calendar/venues/:venueId',
    title: 'Venue Details - Calendar View - YoVibe',
    description: 'View venue details from calendar view.',
    keywords: ['venue', 'calendar', 'details'],
    priority: 'medium',
    changefreq: 'daily',
    type: 'venue',
  },

  // ============================================
  // MAP VIEW ROUTES
  // ============================================

  '/map/venues/:venueId': {
    path: '/map/venues/:venueId',
    title: 'Venue Details - Map View - YoVibe',
    description: 'View venue details from map view.',
    keywords: ['venue', 'map', 'details', 'location'],
    priority: 'medium',
    changefreq: 'daily',
    type: 'venue',
  },

  '/map/events/:eventId': {
    path: '/map/events/:eventId',
    title: 'Event Details - Map View - YoVibe',
    description: 'View event details from map view.',
    keywords: ['event', 'map', 'details', 'location'],
    priority: 'medium',
    changefreq: 'daily',
    type: 'event',
  },

  // ============================================
  // AUTHENTICATION ROUTES - Should NOT be indexed
  // ============================================

  '/login': {
    path: '/login',
    title: 'Login - YoVibe',
    description: 'Sign in to your YoVibe account to discover events, venues, and connect with friends.',
    keywords: ['login', 'sign in', 'account', 'yovibe'],
    priority: 'low',
    changefreq: 'monthly',
    noindex: true,
    nofollow: true,
    type: 'website',
  },

  '/signup': {
    path: '/signup',
    title: 'Sign Up - YoVibe',
    description: 'Create a YoVibe account to discover the best nightlife, events, and venues in Uganda.',
    keywords: ['signup', 'register', 'create account', 'join yovibe'],
    priority: 'low',
    changefreq: 'monthly',
    noindex: true,
    nofollow: true,
    type: 'website',
  },

  // ============================================
  // PROFILE ROUTES - Low Priority / Noindex
  // ============================================

  '/profile': {
    path: '/profile',
    title: 'My Profile - YoVibe',
    description: 'Manage your YoVibe profile, saved venues, attending events, and preferences.',
    keywords: ['profile', 'account', 'settings'],
    priority: 'low',
    changefreq: 'monthly',
    noindex: true,
    type: 'profile',
  },

  '/profile/my-venues': {
    path: '/profile/my-venues',
    title: 'My Venues - YoVibe',
    description: 'Manage your venues on YoVibe.',
    keywords: ['my venues', 'venue management'],
    priority: 'low',
    changefreq: 'weekly',
    noindex: true,
    type: 'website',
  },

  '/profile/my-tickets': {
    path: '/profile/my-tickets',
    title: 'My Tickets - YoVibe',
    description: 'View and manage your event tickets.',
    keywords: ['my tickets', 'tickets', 'events'],
    priority: 'low',
    changefreq: 'daily',
    noindex: true,
    type: 'website',
  },

  '/profile/notifications': {
    path: '/profile/notifications',
    title: 'Notifications - YoVibe',
    description: 'View your YoVibe notifications.',
    keywords: ['notifications', 'alerts'],
    priority: 'low',
    changefreq: 'daily',
    noindex: true,
    type: 'website',
  },

  '/profile/add-venue': {
    path: '/profile/add-venue',
    title: 'Add Venue - YoVibe',
    description: 'Add a new nightlife venue to YoVibe.',
    keywords: ['add venue', 'venue creation'],
    priority: 'low',
    changefreq: 'monthly',
    noindex: true,
    type: 'website',
  },

  // ============================================
  // ADMIN ROUTES - Should NEVER be indexed
  // ============================================

  '/profile/admin/dashboard': {
    path: '/profile/admin/dashboard',
    title: 'Admin Dashboard - YoVibe Administration',
    description: 'YoVibe administration dashboard for authorized administrators only.',
    keywords: ['admin', 'dashboard', 'administration'],
    priority: 'low',
    changefreq: 'weekly',
    noindex: true,
    nofollow: true,
    type: 'website',
  },

  '/profile/admin/users': {
    path: '/profile/admin/users',
    title: 'Admin Users - YoVibe Administration',
    description: 'Manage YoVibe users.',
    keywords: ['admin', 'users', 'management'],
    priority: 'low',
    changefreq: 'weekly',
    noindex: true,
    nofollow: true,
    type: 'website',
  },

  '/profile/admin/venues': {
    path: '/profile/admin/venues',
    title: 'Admin Venues - YoVibe Administration',
    description: 'Manage YoVibe venues.',
    keywords: ['admin', 'venues', 'management'],
    priority: 'low',
    changefreq: 'weekly',
    noindex: true,
    nofollow: true,
    type: 'website',
  },

  '/profile/admin/events': {
    path: '/profile/admin/events',
    title: 'Admin Events - YoVibe Administration',
    description: 'Manage YoVibe events.',
    keywords: ['admin', 'events', 'management'],
    priority: 'low',
    changefreq: 'weekly',
    noindex: true,
    nofollow: true,
    type: 'website',
  },

  '/profile/admin/ownership-requests': {
    path: '/profile/admin/ownership-requests',
    title: 'Admin Ownership Requests - YoVibe Administration',
    description: 'Manage venue ownership requests.',
    keywords: ['admin', 'ownership', 'requests'],
    priority: 'low',
    changefreq: 'weekly',
    noindex: true,
    nofollow: true,
    type: 'website',
  },

  // ============================================
  // TICKET/BOOKING ROUTES - Medium Priority
  // ============================================

  '/events/tickets/:eventId': {
    path: '/events/tickets/:eventId',
    title: 'Buy Tickets - YoVibe',
    description: 'Purchase tickets for this event.',
    keywords: ['tickets', 'buy tickets', 'event tickets'],
    priority: 'medium',
    changefreq: 'daily',
    type: 'website',
  },

  '/profile/tickets/:eventId': {
    path: '/profile/tickets/:eventId',
    title: 'My Event Tickets - YoVibe',
    description: 'View your tickets for this event.',
    keywords: ['my tickets', 'event tickets'],
    priority: 'low',
    changefreq: 'daily',
    noindex: true,
    type: 'website',
  },

  // ============================================
  // ORGANIZER DASHBOARD - Medium Priority
  // ============================================

  '/events/organiser/:eventId': {
    path: '/events/organiser/:eventId',
    title: 'Event Dashboard - YoVibe',
    description: 'Manage your event details and see attendee information.',
    keywords: ['event dashboard', 'event management'],
    priority: 'low',
    changefreq: 'daily',
    noindex: true,
    type: 'website',
  },
};

/**
 * Get SEO configuration for a given route
 * @param routePath - The URL path (may include parameters)
 * @returns SEO configuration or undefined if not found
 */
export function getRouteSEOConfig(routePath: string): RouteSEOConfig | undefined {
  // First try exact match
  if (ROUTE_SEO_CONFIG[routePath]) {
    return ROUTE_SEO_CONFIG[routePath];
  }

  // Then try pattern matching (for dynamic routes like /events/:eventId)
  for (const [configPath, config] of Object.entries(ROUTE_SEO_CONFIG)) {
    if (matchRoutePath(configPath, routePath)) {
      return config;
    }
  }

  return undefined;
}

/**
 * Match a route pattern against an actual path
 * Handles dynamic segments like :eventId
 */
function matchRoutePath(pattern: string, path: string): boolean {
  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);

  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  return patternSegments.every((segment, index) => {
    // Dynamic segment (starts with :)
    if (segment.startsWith(':')) {
      return pathSegments[index] !== undefined;
    }
    // Exact match
    return segment === pathSegments[index];
  });
}

/**
 * Convert route SEO config to SEOMetadata props
 */
export function routeConfigToSEOProps(
  config: RouteSEOConfig,
  overrides?: Partial<SEOMetadataProps>
): SEOMetadataProps {
  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    noindex: config.noindex || false,
    nofollow: config.nofollow || false,
    type: config.type as any,
    ...overrides,
  };
}

/**
 * List all routes for sitemap generation
 */
export function getAllRoutesForSitemap(): Array<{ path: string; config: RouteSEOConfig }> {
  return Object.entries(ROUTE_SEO_CONFIG)
    .filter(([_, config]) => !config.noindex) // Exclude noindex routes
    .map(([path, config]) => ({ path, config }));
}

/**
 * Check if a route should be indexed
 */
export function shouldIndexRoute(routePath: string): boolean {
  const config = getRouteSEOConfig(routePath);
  return config ? !config.noindex : true;
}

/**
 * Check if a route should have nofollow directive
 */
export function shouldNofollowRoute(routePath: string): boolean {
  const config = getRouteSEOConfig(routePath);
  return config ? !!config.nofollow : false;
}

export default ROUTE_SEO_CONFIG;
