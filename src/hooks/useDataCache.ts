/**
 * React hook for data caching
 * Provides cached data fetching with automatic cache management
 */

import { useState, useEffect, useCallback } from 'react';
import { dataCache, CACHE_KEYS } from '../utils/cache';

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
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      let cachedData: T | null = null;

      if (!forceRefresh) {
        cachedData = dataCache.get<T>(cacheKey);
      }

      if (cachedData) {
        setData(cachedData);
        onSuccess?.(cachedData);
      } else {
        const freshData = await fetchFunction();
        dataCache.set(cacheKey, freshData, ttl);
        setData(freshData);
        onSuccess?.(freshData);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, fetchFunction, ttl, enabled, onSuccess, onError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData(true); // Force refresh
  }, [fetchData]);

  const clearCache = useCallback(() => {
    dataCache.delete(cacheKey);
  }, [cacheKey]);

  return {
    data,
    loading,
    error,
    refetch,
    clearCache
  };
}

// Pre-configured hooks for common data fetching
export function useCachedEvents() {
  return useDataCache({
    cacheKey: CACHE_KEYS.EVENTS,
    fetchFunction: async () => {
      const { default: FirebaseService } = await import('../services/FirebaseService');
      return FirebaseService.getEvents();
    },
    ttl: 10 * 60 * 1000 // 10 minutes for events
  });
}

export function useCachedVenues() {
  return useDataCache({
    cacheKey: CACHE_KEYS.VENUES,
    fetchFunction: async () => {
      const { default: FirebaseService } = await import('../services/FirebaseService');
      return FirebaseService.getVenues();
    },
    ttl: 10 * 60 * 1000 // 10 minutes for venues
  });
}

export function useCachedEventDetails(eventId: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.EVENT_DETAILS(eventId),
    fetchFunction: async () => {
      const { default: FirebaseService } = await import('../services/FirebaseService');
      return FirebaseService.getEventById(eventId);
    },
    ttl: 30 * 60 * 1000, // 30 minutes for event details
    enabled: !!eventId
  });
}

export function useCachedVenueDetails(venueId: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.VENUE_DETAILS(venueId),
    fetchFunction: async () => {
      const { default: FirebaseService } = await import('../services/FirebaseService');
      return FirebaseService.getVenueById(venueId);
    },
    ttl: 30 * 60 * 1000, // 30 minutes for venue details
    enabled: !!venueId
  });
}

export function useCachedUserTickets(userId: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.USER_TICKETS(userId),
    fetchFunction: async () => {
      const { default: FirebaseService } = await import('../services/FirebaseService');
      return FirebaseService.getTicketsByUser(userId);
    },
    ttl: 2 * 60 * 1000, // 2 minutes for tickets (more dynamic)
    enabled: !!userId
  });
}

export function useCachedNotifications(userId: string) {
  return useDataCache({
    cacheKey: CACHE_KEYS.NOTIFICATIONS(userId),
    fetchFunction: async () => {
      const { default: NotificationService } = await import('../services/NotificationService');
      return NotificationService.getUserNotifications(userId);
    },
    ttl: 1 * 60 * 1000, // 1 minute for notifications (very dynamic)
    enabled: !!userId
  });
}