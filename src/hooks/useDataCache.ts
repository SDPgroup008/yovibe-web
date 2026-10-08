/**
 * React hook for data caching
 * Provides cached data fetching with automatic cache management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { dataCache, CACHE_KEYS } from '../utils/cache';
import type { Event } from '../models/Event';
import type { Venue } from '../models/Venue';
import type { VenueGalleryItem } from '../models/VenueGalleryItem';
import type { VibeImage } from '../models/VibeImage';

interface UseDataCacheOptions<T> {
  cacheKey: string;
  fetchFunction: () => Promise<T>;
  ttl?: number; // Time to live in milliseconds
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useDataCache<T>({
  cacheKey,
  fetchFunction,
  ttl = 5 * 60 * 1000, // 5 minutes default
  enabled = true,
  onSuccess,
  onError
}: UseDataCacheOptions<T>) {
  const initialCache = dataCache.peek<T>(cacheKey);
  const [data, setData] = useState<T | null>(() => initialCache?.data ?? null);
  const [loading, setLoading] = useState(() => enabled && !initialCache?.data);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hasInitializedRef = useRef(false);
  const currentCacheKeyRef = useRef(cacheKey);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;

    const cachedSnapshot = dataCache.peek<T>(cacheKey);
    if (!forceRefresh && cachedSnapshot?.isFresh) {
      setData(cachedSnapshot.data);
      setLoading(false);
      onSuccess?.(cachedSnapshot.data);
      return;
    }

    if (cachedSnapshot?.data) setData(cachedSnapshot.data);
    setLoading(!cachedSnapshot?.data);
    setRefreshing(Boolean(cachedSnapshot?.data));
    setError(null);

    try {
      const freshData = await fetchFunction();
      dataCache.set(cacheKey, freshData, ttl);
      setData(freshData);
      onSuccess?.(freshData);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cacheKey, fetchFunction, ttl, enabled, onSuccess, onError]);

  useEffect(() => {
    // Only fetch if cacheKey changed or first time
    if (enabled && (currentCacheKeyRef.current !== cacheKey || !hasInitializedRef.current)) {
      currentCacheKeyRef.current = cacheKey;
      hasInitializedRef.current = true;
      // A mounted screen can switch resources without unmounting. Seed the
      // new resource synchronously so no previous screen's data flashes.
      const cachedSnapshot = dataCache.peek<T>(cacheKey);
      setData(cachedSnapshot?.data ?? null);
      setLoading(!cachedSnapshot?.data);
      fetchData();
    }
  }, [cacheKey, enabled, fetchData]);

  const refetch = useCallback(() => {
    return fetchData(true); // Force refresh
  }, [fetchData]);

  const clearCache = useCallback(() => {
    dataCache.delete(cacheKey);
  }, [cacheKey]);

  const updateCachedData = useCallback((updater: (previous: T | null) => T | null) => {
    setData((previous) => {
      const next = updater(previous);
      if (next !== null) dataCache.set(cacheKey, next, ttl);
      else dataCache.delete(cacheKey);
      return next;
    });
  }, [cacheKey, ttl]);

  // A pathname can change while React keeps the same route component mounted.
  // Never briefly render the prior resource during that transition.
  const cacheKeyChanged = currentCacheKeyRef.current !== cacheKey;
  const nextCacheSnapshot = cacheKeyChanged ? dataCache.peek<T>(cacheKey) : null;
  const visibleData = cacheKeyChanged ? nextCacheSnapshot?.data ?? null : data;
  const visibleLoading = cacheKeyChanged ? enabled && !nextCacheSnapshot?.data : loading;

  return {
    data: visibleData,
    loading: visibleLoading,
    refreshing,
    error,
    refetch,
    clearCache,
    updateCachedData,
  };
}

// Pre-configured hooks for common data fetching
export function useCachedEvents() {
  return useDataCache({
    cacheKey: CACHE_KEYS.EVENTS,
    fetchFunction: async () => {
      const { default: SupabaseService } = await import('../services/SupabaseService');
      return SupabaseService.getEvents();
    },
    ttl: 10 * 60 * 1000 // 10 minutes for events
  });
}

export function useCachedVenues() {
  return useDataCache({
    cacheKey: CACHE_KEYS.VENUES,
    fetchFunction: async () => {
      const { default: SupabaseService } = await import('../services/SupabaseService');
      return SupabaseService.getVenues();
    },
    ttl: 10 * 60 * 1000 // 10 minutes for venues
  });
}

export function useCachedEventDetails(eventId: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.EVENT_DETAILS(eventId),
    fetchFunction: async () => {
      const { default: SupabaseService } = await import('../services/SupabaseService');
      return SupabaseService.getEventById(eventId);
    },
    ttl: 5 * 60 * 1000,
    enabled: !!eventId
  });
}

export function useCachedVenueDetails(venueId: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.VENUE_DETAILS(venueId),
    fetchFunction: async () => {
      const { default: SupabaseService } = await import('../services/SupabaseService');
      return SupabaseService.getVenueById(venueId);
    },
    ttl: 5 * 60 * 1000,
    enabled: !!venueId
  });
}

export interface CachedVenuePage {
  venue: Venue | null;
  events: Event[];
  gallery: VenueGalleryItem[];
  vibes: VibeImage[];
}

export function useCachedVenuePage(venueId: string) {
  return useDataCache<CachedVenuePage>({
    cacheKey: CACHE_KEYS.VENUE_PAGE(venueId),
    fetchFunction: async () => {
      const { default: SupabaseService } = await import('../services/SupabaseService');
      const [venue, events, gallery, vibes] = await Promise.all([
        SupabaseService.getVenueById(venueId),
        SupabaseService.getEventsByVenue(venueId),
        SupabaseService.getVenueGallery(venueId).catch(() => [] as VenueGalleryItem[]),
        SupabaseService.getVibeImagesByVenueAndDate(venueId, new Date()),
      ]);
      return { venue, events, gallery, vibes };
    },
    ttl: 5 * 60 * 1000,
    enabled: !!venueId,
  });
}

export function useCachedUserTickets(userId: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.USER_TICKETS(userId),
    fetchFunction: async () => {
      const { default: SupabaseService } = await import('../services/SupabaseService');
      return SupabaseService.getTicketsByUser(userId);
    },
    ttl: 2 * 60 * 1000, // 2 minutes for tickets (more dynamic)
    enabled: !!userId
  });
}

export function useCachedNotifications(userId?: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.NOTIFICATIONS(userId || 'guest'),
    fetchFunction: async () => {
      const { default: NotificationService } = await import('../services/NotificationService');
      return NotificationService.getUserNotifications(userId);
    },
    ttl: 1 * 60 * 1000, // 1 minute for notifications (very dynamic)
    enabled: true
  });
}
