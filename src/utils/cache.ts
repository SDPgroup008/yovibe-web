/**
 * Simple in-memory cache with TTL (Time To Live) support
 * Prevents redundant data fetching when navigating between screens
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class Cache {
  private cache = new Map<string, CacheEntry<any>>();

  /**
   * Get data from cache if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Entry expired, remove it
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set data in cache with TTL
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void { // Default 5 minutes
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Remove specific entry from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clean expired entries
   */
  clean(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instance
export const dataCache = new Cache();

// Cache keys for different data types
export const CACHE_KEYS = {
  EVENTS: 'events',
  VENUES: 'venues',
  EVENT_DETAILS: (id: string) => `event_${id}`,
  VENUE_DETAILS: (id: string) => `venue_${id}`,
  USER_TICKETS: (userId: string) => `user_tickets_${userId}`,
  NOTIFICATIONS: (userId: string) => `notifications_${userId}`,
  VIBE_IMAGES: (venueId: string, date: string) => `vibe_images_${venueId}_${date}`,
} as const;