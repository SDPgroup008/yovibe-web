/**
 * TokenService - Handles FCM token analytics from tokens.json
 * 
 * This service integrates with the tokens.json file managed through GitHub workflows
 * to provide analytics on notification subscribers.
 */

// Token record interface for detailed tracking
export interface TokenRecord {
  token: string;
  subscribedAt: Date;
  isActive: boolean;
  userAgent?: string;
}

// Daily token subscription stats
export interface DailyTokenStats {
  date: string;
  newTokens: number;
  totalTokens: number;
  activeTokens: number;
}

// Token analytics summary
export interface TokenAnalyticsSummary {
  totalTokens: number;
  activeTokens: number;
  newTokensToday: number;
  growthPercentage: number;
  previousDayCount: number;
  lastUpdated: Date;
}

// Pagination options
export interface TokenPaginationOptions {
  page: number;
  pageSize: number;
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

class TokenService {
  private static instance: TokenService;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly INITIAL_DAYS = 7; // Initial load for daily breakdown
  private readonly TOTAL_DAYS = 30; // Full daily breakdown

  private constructor() {}

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
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
}

export default TokenService.getInstance();
