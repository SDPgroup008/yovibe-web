/**
 * TokenService - Handles FCM token analytics
 * 
 * This service integrates with both:
 * - Firebase Firestore for authenticated users
 * - tokens.json file for unauthenticated users (legacy)
 * 
 * The admin dashboard can now filter and analyze notification permissions
 * across all user types (authenticated vs unauthenticated).
 */

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

// Token record interface for detailed tracking
export interface TokenRecord {
  token: string;
  subscribedAt: Date;
  isActive: boolean;
  userAgent?: string;
  // New fields for user tracking
  userId?: string;
  isAuthenticated: boolean;
  deviceInfo?: DeviceInfo;
}

// Device information interface
export interface DeviceInfo {
  platform: 'web' | 'ios' | 'android';
  browser?: string;
  os?: string;
  deviceId?: string;
}

// Firestore token document interface
export interface FirestoreToken {
  token: string;
  userId: string | null;  // null for unauthenticated
  isAuthenticated: boolean;
  deviceInfo: DeviceInfo;
  subscribedAt: Date;
  lastActiveAt: Date;
  createdAt: Date;  // When the token was first created
  isActive: boolean;
  userEmail?: string;  // For authenticated users
  userName?: string;   // For authenticated users (or generated guest name)
}

// Daily token subscription stats
export interface DailyTokenStats {
  date: string;
  newTokens: number;
  totalTokens: number;
  activeTokens: number;
  authenticatedNew: number;
  unauthenticatedNew: number;
}

// Token analytics summary
export interface TokenAnalyticsSummary {
  totalTokens: number;
  activeTokens: number;
  newTokensToday: number;
  growthPercentage: number;
  previousDayCount: number;
  lastUpdated: Date;
  // New fields for user type breakdown
  authenticatedCount: number;
  unauthenticatedCount: number;
}

// Filter options for querying tokens
export interface TokenFilterOptions {
  isAuthenticated?: boolean;
  isActive?: boolean;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

// Pagination options
export interface TokenPaginationOptions {
  page: number;
  pageSize: number;
  filter?: TokenFilterOptions;
}

// Cached data interface
interface CachedTokenData {
  tokens: string[];
  timestamp: number;
  lastSyncTime: string;
}

// In-memory cache
let tokenCache: CachedTokenData | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Firestore collection name
const TOKENS_COLLECTION = "YoVibe/data/notificationTokens";

class TokenService {
  private static instance: TokenService;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly INITIAL_DAYS = 7; // Initial load for daily breakdown
  private readonly TOTAL_DAYS = 30; // Full daily breakdown
  private migrationInProgress = false;

  private constructor() {}

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  /**
   * Migrate all tokens from tokens.json to Firestore
   * This ensures legacy tokens are properly stored in Firebase
   */
  public async migrateLegacyTokens(): Promise<{
    migrated: number;
    total: number;
    errors: number;
  }> {
    if (this.migrationInProgress) {
      console.log('[TokenService] Migration already in progress, skipping');
      return { migrated: 0, total: 0, errors: 0 };
    }

    this.migrationInProgress = true;
    let migrated = 0;
    let errors = 0;

    try {
      console.log('[TokenService] Starting migration of legacy tokens...');
      
      // Get all tokens from tokens.json
      const jsonTokens = await this.fetchTokens(true); // Force refresh to get latest
      
      // Get existing tokens from Firestore
      const firestoreTokens = await this.getTokensFromFirestore(undefined, 10000);
      const existingTokenSet = new Set(firestoreTokens.map(t => t.token));
      
      console.log(`[TokenService] Found ${jsonTokens.length} tokens in JSON, ${existingTokenSet.size} in Firestore`);
      
      // Migrate tokens that don't exist in Firestore
      for (const token of jsonTokens) {
        if (!existingTokenSet.has(token)) {
          try {
            await this.saveTokenToFirestore(
              token,  // token
              null,   // userId - null for unauthenticated
              undefined, // email
              undefined // name
            );
            migrated++;
            
            // Add small delay to avoid overwhelming Firestore
            await new Promise(resolve => setTimeout(resolve, 10));
          } catch (error) {
            console.error(`[TokenService] Error migrating token:`, error);
            errors++;
          }
        }
      }
      
      console.log(`[TokenService] Migration complete: ${migrated} tokens migrated, ${errors} errors`);
      
      return { migrated, total: jsonTokens.length, errors };
    } catch (error) {
      console.error('[TokenService] Migration failed:', error);
      return { migrated, total: 0, errors: errors + 1 };
    } finally {
      this.migrationInProgress = false;
    }
  }

  /**
   * Fetch tokens from the server
   * In production, this would fetch from a GitHub raw URL or API endpoint
   */
  public async fetchTokens(forceRefresh: boolean = false): Promise<string[]> {
    const now = Date.now();
    
    // Check cache
    if (!forceRefresh && tokenCache && (now - tokenCache.timestamp) < this.CACHE_DURATION) {
      console.log('Using cached token data');
      return tokenCache.tokens;
    }

    try {
      // Fetch tokens.json from the server
      // For web, we fetch from the public directory
      const response = await fetch('/tokens.json');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tokens: ${response.statusText}`);
      }

      const tokens: string[] = await response.json();
      
      // Update cache
      tokenCache = {
        tokens,
        timestamp: now,
        lastSyncTime: new Date().toISOString(),
      };

      console.log(`Fetched ${tokens.length} tokens from server`);
      return tokens;
    } catch (error) {
      console.error('Error fetching tokens:', error);
      // Return cached data if available, otherwise return empty array
      return tokenCache?.tokens || [];
    }
  }

  /**
   * Get total count of active tokens
   */
  public async getTotalActiveTokens(): Promise<number> {
    const tokens = await this.fetchTokens();
    return tokens.length;
  }

  /**
   * Generate daily breakdown of token subscriptions
   * Since tokens.json doesn't include timestamps, we simulate the breakdown
   * based on the assumption that tokens are added chronologically
   */
  public async getDailyTokenStats(days: number = this.TOTAL_DAYS): Promise<DailyTokenStats[]> {
    const tokens = await this.fetchTokens();
    const totalTokens = tokens.length;
    
    if (totalTokens === 0) {
      return [];
    }

    // Calculate tokens per day based on array position
    // This simulates historical data - in production, you'd store timestamps
    const tokensPerDay = Math.ceil(totalTokens / days);
    const dailyStats: DailyTokenStats[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Calculate tokens for this day
      const startIndex = (days - 1 - i) * tokensPerDay;
      const endIndex = Math.min(startIndex + tokensPerDay, totalTokens);
      const dayTokens = tokens.slice(startIndex, endIndex);
      
      // Simulate that some tokens might be inactive (random 5-10% churn)
      const activeTokens = dayTokens.filter(() => Math.random() > 0.05).length;

      dailyStats.push({
        date: dateStr,
        newTokens: dayTokens.length,
        totalTokens: endIndex,
        activeTokens,
        authenticatedNew: 0, // Legacy tokens.json doesn't track auth
        unauthenticatedNew: dayTokens.length,
      });
    }

    return dailyStats;
  }

  /**
   * Get initial 7 days of daily stats with pagination support
   */
  public async getInitialDailyStats(): Promise<DailyTokenStats[]> {
    return this.getDailyTokenStats(this.INITIAL_DAYS);
  }

  /**
   * Load more daily stats (pagination)
   */
  public async loadMoreDailyStats(currentDays: number, totalDays: number = this.TOTAL_DAYS): Promise<DailyTokenStats[]> {
    if (currentDays >= totalDays) {
      return [];
    }
    return this.getDailyTokenStats(totalDays);
  }

  /**
   * Get token analytics summary
   */
  public async getTokenAnalyticsSummary(): Promise<TokenAnalyticsSummary> {
    const tokens = await this.fetchTokens();
    const totalTokens = tokens.length;
    
    // Get today's stats
    const todayStats = await this.getDailyTokenStats(1);
    const newTokensToday = todayStats.length > 0 ? todayStats[0].newTokens : 0;
    const activeTokensToday = todayStats.length > 0 ? todayStats[0].activeTokens : totalTokens;

    // Calculate previous day count (simulated)
    const previousDayCount = Math.max(0, totalTokens - newTokensToday);
    const growthPercentage = previousDayCount > 0 
      ? ((newTokensToday / previousDayCount) * 100)
      : (newTokensToday > 0 ? 100 : 0);

    return {
      totalTokens,
      activeTokens: activeTokensToday,
      newTokensToday,
      growthPercentage,
      previousDayCount,
      lastUpdated: new Date(),
      authenticatedCount: 0, // Legacy - no auth data from tokens.json
      unauthenticatedCount: totalTokens,
    };
  }

  /**
   * Get paginated token records for the detailed table
   */
  public async getTokenRecords(options: TokenPaginationOptions): Promise<TokenRecord[]> {
    const tokens = await this.fetchTokens();
    const { page, pageSize } = options;
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;

    if (startIndex >= tokens.length) {
      return [];
    }

    const pageTokens = tokens.slice(startIndex, endIndex);
    
    // Generate token records with simulated subscription dates
    // In production, this would come from actual metadata
    return pageTokens.map((token, index) => {
      const totalDays = this.TOTAL_DAYS;
      const daysAgo = Math.floor((tokens.length - startIndex - index) / Math.ceil(tokens.length / totalDays));
      const subscribedAt = new Date();
      subscribedAt.setDate(subscribedAt.getDate() - Math.min(daysAgo, totalDays));

      return {
        token: token.substring(0, 20) + '...', // Truncate for display
        subscribedAt,
        isActive: true, // Simulate all tokens as active
        isAuthenticated: false, // Legacy tokens.json - all unauthenticated
      };
    });
  }

  /**
   * Get total number of pages for pagination
   */
  public async getTotalPages(pageSize: number): Promise<number> {
    const tokens = await this.fetchTokens();
    return Math.ceil(tokens.length / pageSize);
  }

  /**
   * Force refresh token data
   */
  public async forceRefresh(): Promise<void> {
    tokenCache = null;
    await this.fetchTokens(true);
  }

  /**
   * Get last sync time from cache
   */
  public getLastSyncTime(): string | null {
    return tokenCache?.lastSyncTime || null;
  }

  /**
   * Check if cache is valid
   */
  public isCacheValid(): boolean {
    if (!tokenCache) return false;
    return Date.now() - tokenCache.timestamp < this.CACHE_DURATION;
  }

  /**
   * Parse user agent from token metadata (placeholder for future implementation)
   */
  public parseUserAgent(token: string): string {
    // In production, this would extract user agent from stored metadata
    // For now, return a simulated user agent
    const userAgents = [
      'Chrome/120.0.0.0 on Windows',
      'Safari/17.0 on macOS',
      'Chrome/120.0.0.0 on Android',
      'Safari/17.0 on iOS',
      'Firefox/121.0 on Linux',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Validate an FCM token format
   */
  public validateToken(token: string): boolean {
    // FCM tokens are typically long alphanumeric strings
    // This is a basic validation - in production, you'd verify with FCM API
    return typeof token === 'string' && token.length > 50;
  }

  /**
   * Get token health statistics
   */
  public async getTokenHealthStats(): Promise<{
    validTokens: number;
    invalidTokens: number;
    healthPercentage: number;
  }> {
    const tokens = await this.fetchTokens();
    
    let validTokens = 0;
    let invalidTokens = 0;

    for (const token of tokens) {
      if (this.validateToken(token)) {
        validTokens++;
      } else {
        invalidTokens++;
      }
    }

    const healthPercentage = tokens.length > 0 
      ? (validTokens / tokens.length) * 100 
      : 100;

    return {
      validTokens,
      invalidTokens,
      healthPercentage,
    };
  }

  // ============================================================================
  // NEW METHODS FOR FIRESTORE INTEGRATION
  // ============================================================================

  /**
   * Save a notification token to Firestore
   * For authenticated users, stores with userId. For unauthenticated, stores with null userId.
   */
  public async saveTokenToFirestore(
    token: string,
    userId: string | null,
    userEmail?: string,
    userName?: string
  ): Promise<string> {
    try {
      const now = new Date();
      const isAuthenticated = userId !== null;
      
      // Detect device info from user agent
      const deviceInfo = this.detectDeviceInfo();
      
      // Check if token already exists
      const existingToken = await this.findTokenInFirestore(token);
      
      if (existingToken) {
        // Update existing token - link to user if previously unauthenticated
        if (!existingToken.isAuthenticated && isAuthenticated) {
          await updateDoc(doc(db, TOKENS_COLLECTION, existingToken.id), {
            userId,
            isAuthenticated: true,
            userEmail,
            userName,
            lastActiveAt: Timestamp.now(),
            isActive: true,
          });
          console.log("[TokenService] Updated existing token with user info:", existingToken.id);
        } else {
          // Just update last active
          await updateDoc(doc(db, TOKENS_COLLECTION, existingToken.id), {
            lastActiveAt: Timestamp.now(),
            isActive: true,
          });
        }
        return existingToken.id;
      }
      
      // Generate guest name for unauthenticated users
      let finalUserName = userName;
      if (!isAuthenticated && !finalUserName) {
        finalUserName = await this.generateGuestUserName();
      }
      
      // Create new token document
      const tokenData: Omit<FirestoreToken, 'subscribedAt' | 'lastActiveAt' | 'createdAt'> & { subscribedAt: any; lastActiveAt: any; createdAt: any } = {
        token,
        userId,
        isAuthenticated,
        deviceInfo,
        subscribedAt: Timestamp.now(),
        lastActiveAt: Timestamp.now(),
        createdAt: Timestamp.now(),
        isActive: true,
      };
      
      if (userEmail) tokenData.userEmail = userEmail;
      if (finalUserName) tokenData.userName = finalUserName;
      
      const docRef = await addDoc(collection(db, TOKENS_COLLECTION), tokenData);
      console.log("[TokenService] Saved new token to Firestore:", docRef.id);
      return docRef.id;
    } catch (error) {
      console.error("[TokenService] Error saving token to Firestore:", error);
      throw error;
    }
  }
  
  /**
   * Generate a unique guest username for unauthenticated users
   * Finds the highest guest number and increments from there
   */
  private async generateGuestUserName(): Promise<string> {
    try {
      // Query for existing guest users, ordered by userName
      const q = query(
        collection(db, TOKENS_COLLECTION),
        where("isAuthenticated", "==", false),
        orderBy("userName", "desc"),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // No existing guests, start with guest 1
        return "guest 1";
      }
      
      const lastGuest = snapshot.docs[0].data();
      const lastUserName = lastGuest.userName;
      
      // Extract the number from the last guest username (e.g., "guest 15" -> 15)
      const match = lastUserName?.match(/guest\s+(\d+)/i);
      
      if (match) {
        const lastNumber = parseInt(match[1], 10);
        return `guest ${lastNumber + 1}`;
      }
      
      // If we can't parse the number, append a new guest
      return "guest 1";
    } catch (error) {
      console.error("[TokenService] Error generating guest username:", error);
      // Fallback: use timestamp-based unique name
      return `guest_${Date.now()}`;
    }
  }

  /**
   * Find a token in Firestore by token string
   */
  private async findTokenInFirestore(token: string): Promise<{ id: string; isAuthenticated: boolean } | null> {
    try {
      const q = query(collection(db, TOKENS_COLLECTION), where("token", "==", token), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        isAuthenticated: data.isAuthenticated,
      };
    } catch (error) {
      console.error("[TokenService] Error finding token:", error);
      return null;
    }
  }

  /**
   * Detect device information from user agent
   */
  private detectDeviceInfo(): DeviceInfo {
    if (typeof window === 'undefined') {
      return { platform: 'web' };
    }
    
    const ua = navigator.userAgent;
    let platform: 'web' | 'ios' | 'android' = 'web';
    let browser = 'unknown';
    let os = 'unknown';
    
    if (/iPhone|iPad|iPod/.test(ua)) {
      platform = 'ios';
      os = 'iOS';
    } else if (/Android/.test(ua)) {
      platform = 'android';
      os = 'Android';
    }
    
    if (/Chrome/.test(ua) && !/Edge/.test(ua)) {
      browser = 'Chrome';
    } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
      browser = 'Safari';
    } else if (/Firefox/.test(ua)) {
      browser = 'Firefox';
    } else if (/Edge/.test(ua)) {
      browser = 'Edge';
    }
    
    return { platform, browser, os };
  }

  /**
   * Get all tokens from Firestore with optional filtering
   */
  public async getTokensFromFirestore(
    filter?: TokenFilterOptions,
    maxTokens?: number
  ): Promise<FirestoreToken[]> {
    try {
      let q = collection(db, TOKENS_COLLECTION);
      const constraints: any[] = [];
      
      if (filter?.isActive !== undefined) {
        constraints.push(where("isActive", "==", filter.isActive));
      }
      
      if (filter?.isAuthenticated !== undefined) {
        constraints.push(where("isAuthenticated", "==", filter.isAuthenticated));
      }
      
      if (filter?.userId) {
        constraints.push(where("userId", "==", filter.userId));
      }
      
      constraints.push(orderBy("subscribedAt", "desc"));
      
      if (maxTokens) {
        constraints.push(limit(maxTokens));
      }
      
      q = query(q, ...constraints);
      const snapshot = await getDocs(q);
      
      const tokens: FirestoreToken[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        tokens.push({
          token: data.token,
          userId: data.userId,
          isAuthenticated: data.isAuthenticated,
          deviceInfo: data.deviceInfo,
          subscribedAt: data.subscribedAt?.toDate() || new Date(),
          lastActiveAt: data.lastActiveAt?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          isActive: data.isActive,
          userEmail: data.userEmail,
          userName: data.userName,
        });
      });
      
      return tokens;
    } catch (error) {
      console.error("[TokenService] Error getting tokens from Firestore:", error);
      return [];
    }
  }

  /**
   * Get token counts by authentication status
   */
  public async getTokenCountsByAuthStatus(): Promise<{
    total: number;
    authenticated: number;
    unauthenticated: number;
    active: number;
    inactive: number;
  }> {
    try {
      const allTokens = await this.getTokensFromFirestore();
      
      const result = {
        total: allTokens.length,
        authenticated: allTokens.filter(t => t.isAuthenticated).length,
        unauthenticated: allTokens.filter(t => !t.isAuthenticated).length,
        active: allTokens.filter(t => t.isActive).length,
        inactive: allTokens.filter(t => !t.isActive).length,
      };
      
      return result;
    } catch (error) {
      console.error("[TokenService] Error getting token counts:", error);
      return { total: 0, authenticated: 0, unauthenticated: 0, active: 0, inactive: 0 };
    }
  }

  /**
   * Get token records with user type information
   */
  public async getTokenRecordsWithAuthStatus(
    options: TokenPaginationOptions
  ): Promise<TokenRecord[]> {
    try {
      // Get tokens from both sources: Firestore + tokens.json
      const firestoreTokens = await this.getTokensFromFirestore(undefined, 1000);
      const jsonTokens = await this.fetchTokens();
      
      // Combine and deduplicate (Firestore takes priority)
      const firestoreTokenSet = new Set(firestoreTokens.map(t => t.token));
      const unauthenticatedFromJson = jsonTokens
        .filter(t => !firestoreTokenSet.has(t))
        .map(token => ({
          token,
          subscribedAt: new Date(),
          isActive: true,
          isAuthenticated: false,
          userAgent: this.parseUserAgent(token),
        }));
      
      // Convert Firestore tokens to TokenRecord format
      const authenticatedRecords: TokenRecord[] = firestoreTokens.map(t => ({
        token: t.token,
        subscribedAt: t.subscribedAt,
        isActive: t.isActive,
        userAgent: t.deviceInfo?.browser,
        userId: t.userId || undefined,
        isAuthenticated: t.isAuthenticated,
        deviceInfo: t.deviceInfo,
      }));
      
      // Combine both
      const allRecords = [...authenticatedRecords, ...unauthenticatedFromJson];
      
      // Apply pagination
      const { page, pageSize, filter } = options;
      let filtered = allRecords;
      
      if (filter?.isAuthenticated !== undefined) {
        filtered = filtered.filter(t => t.isAuthenticated === filter.isAuthenticated);
      }
      
      if (filter?.isActive !== undefined) {
        filtered = filtered.filter(t => t.isActive === filter.isActive);
      }
      
      const startIndex = page * pageSize;
      return filtered.slice(startIndex, startIndex + pageSize);
    } catch (error) {
      console.error("[TokenService] Error getting token records:", error);
      return [];
    }
  }

  /**
   * Get analytics summary with authentication breakdown
   */
  public async getTokenAnalyticsSummaryWithAuth(): Promise<TokenAnalyticsSummary> {
    try {
      // Get from Firestore
      const counts = await this.getTokenCountsByAuthStatus();
      
      // Also get from tokens.json for legacy unauthenticated
      const jsonTokens = await this.fetchTokens();
      const firestoreTokenSet = new Set((await this.getTokensFromFirestore()).map(t => t.token));
      const unauthenticatedFromJson = jsonTokens.filter(t => !firestoreTokenSet.has(t));
      
      // Total includes both sources
      const totalAuthenticated = counts.authenticated;
      const totalUnauthenticated = counts.unauthenticated + unauthenticatedFromJson.length;
      const total = totalAuthenticated + totalUnauthenticated;
      
      // Get today's new tokens from Firestore
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const allFirestoreTokens = await this.getTokensFromFirestore();
      const newTokensToday = allFirestoreTokens.filter(
        t => t.subscribedAt >= today
      ).length;
      
      const previousDayCount = total - newTokensToday;
      const growthPercentage = previousDayCount > 0 
        ? ((newTokensToday / previousDayCount) * 100)
        : (newTokensToday > 0 ? 100 : 0);
      
      return {
        totalTokens: total,
        activeTokens: counts.active,
        newTokensToday,
        growthPercentage,
        previousDayCount,
        lastUpdated: new Date(),
        authenticatedCount: totalAuthenticated,
        unauthenticatedCount: totalUnauthenticated,
      };
    } catch (error) {
      console.error("[TokenService] Error getting analytics summary:", error);
      return {
        totalTokens: 0,
        activeTokens: 0,
        newTokensToday: 0,
        growthPercentage: 0,
        previousDayCount: 0,
        lastUpdated: new Date(),
        authenticatedCount: 0,
        unauthenticatedCount: 0,
      };
    }
  }

  /**
   * Get daily stats with authentication breakdown
   */
  public async getDailyTokenStatsWithAuth(days: number = 30): Promise<DailyTokenStats[]> {
    try {
      const tokens = await this.getTokensFromFirestore();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dailyStats: DailyTokenStats[] = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const dayTokens = tokens.filter(t => {
          const subDate = new Date(t.subscribedAt);
          return subDate >= date && subDate < nextDate;
        });
        
        dailyStats.push({
          date: date.toISOString().split('T')[0],
          newTokens: dayTokens.length,
          totalTokens: tokens.filter(t => new Date(t.subscribedAt) < nextDate).length,
          activeTokens: dayTokens.filter(t => t.isActive).length,
          authenticatedNew: dayTokens.filter(t => t.isAuthenticated).length,
          unauthenticatedNew: dayTokens.filter(t => !t.isAuthenticated).length,
        });
      }
      
      return dailyStats;
    } catch (error) {
      console.error("[TokenService] Error getting daily stats:", error);
      return [];
    }
  }
}

export default TokenService.getInstance();
