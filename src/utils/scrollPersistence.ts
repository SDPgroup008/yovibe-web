/**
 * Scroll position persistence utility
 * Saves and restores scroll positions when navigating between screens
 */

interface ScrollPosition {
  x: number;
  y: number;
  timestamp: number;
}

class ScrollPersistence {
  private storage: Storage;
  private prefix = 'scroll_pos_';

  constructor(storage: Storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
    this.storage = storage;
  }

  /**
   * Generate a unique key for the current screen/route
   */
  private getKey(screenId: string): string {
    return `${this.prefix}${screenId}`;
  }

  /**
   * Save scroll position for a screen
   */
  savePosition(screenId: string, scrollY: number, scrollX: number = 0): void {
    if (!this.storage) return;

    const position: ScrollPosition = {
      x: scrollX,
      y: scrollY,
      timestamp: Date.now()
    };

    try {
      this.storage.setItem(this.getKey(screenId), JSON.stringify(position));
    } catch (error) {
      console.warn('Failed to save scroll position:', error);
    }
  }

  /**
   * Get saved scroll position for a screen
   */
  getPosition(screenId: string): ScrollPosition | null {
    if (!this.storage) return null;

    try {
      const stored = this.storage.getItem(this.getKey(screenId));
      if (!stored) return null;

      const position: ScrollPosition = JSON.parse(stored);

      // Check if position is not too old (max 30 minutes)
      const maxAge = 30 * 60 * 1000; // 30 minutes
      if (Date.now() - position.timestamp > maxAge) {
        this.clearPosition(screenId);
        return null;
      }

      return position;
    } catch (error) {
      console.warn('Failed to get scroll position:', error);
      return null;
    }
  }

  /**
   * Clear saved scroll position for a screen
   */
  clearPosition(screenId: string): void {
    if (!this.storage) return;

    try {
      this.storage.removeItem(this.getKey(screenId));
    } catch (error) {
      console.warn('Failed to clear scroll position:', error);
    }
  }

  /**
   * Clear all saved scroll positions
   */
  clearAll(): void {
    if (!this.storage) return;

    try {
      const keys = Object.keys(this.storage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          this.storage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear all scroll positions:', error);
    }
  }
}

// Global scroll persistence instance
export const scrollPersistence = new ScrollPersistence();

// Screen ID constants
export const SCREEN_IDS = {
  EVENTS: 'events',
  VENUES: 'venues',
  MAP: 'map',
  CALENDAR: 'calendar',
  PROFILE: 'profile',
  MY_VENUES: 'my_venues',
  MY_TICKETS: 'my_tickets',
  NOTIFICATIONS: 'notifications',
  EVENT_DETAILS: (id: string) => `event_details_${id}`,
  VENUE_DETAILS: (id: string) => `venue_details_${id}`,
} as const;