/**
 * React hook for scroll position persistence
 * Automatically saves and restores scroll positions
 */

import { useEffect, useRef } from 'react';
import { scrollPersistence, SCREEN_IDS } from '../utils/scrollPersistence';

interface UseScrollPersistenceOptions {
  screenId: string;
  enabled?: boolean;
  saveDelay?: number; // Delay in ms before saving position (default: 100ms)
}

export function useScrollPersistence(options: UseScrollPersistenceOptions) {
  const { screenId, enabled = true, saveDelay = 100 } = options;
  const scrollRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!enabled) return;

    // Restore scroll position when component mounts
    const savedPosition = scrollPersistence.getPosition(screenId);
    if (savedPosition && scrollRef.current) {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
          scrollRef.current.scrollTo({
            x: savedPosition.x,
            y: savedPosition.y,
            animated: false
          });
        }
      }, 0);
    }

    return () => {
      // Clear any pending save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [screenId, enabled]);

  const handleScroll = (event: any) => {
    if (!enabled) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce scroll position saving
    saveTimeoutRef.current = setTimeout(() => {
      const { x, y } = event.nativeEvent.contentOffset || { x: 0, y: 0 };
      scrollPersistence.savePosition(screenId, y, x);
    }, saveDelay);
  };

  return {
    scrollRef,
    onScroll: handleScroll,
    clearPosition: () => scrollPersistence.clearPosition(screenId)
  };
}

// Pre-configured hooks for common screens
export function useEventsScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.EVENTS });
}

export function useVenuesScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.VENUES });
}

export function useMapScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.MAP });
}

export function useCalendarScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.CALENDAR });
}

export function useProfileScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.PROFILE });
}

export function useMyVenuesScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.MY_VENUES });
}

export function useMyTicketsScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.MY_TICKETS });
}

export function useNotificationsScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.NOTIFICATIONS });
}

export function useEventDetailsScroll(eventId: string) {
  return useScrollPersistence({ screenId: SCREEN_IDS.EVENT_DETAILS(eventId) });
}

export function useVenueDetailsScroll(venueId: string) {
  return useScrollPersistence({ screenId: SCREEN_IDS.VENUE_DETAILS(venueId) });
}