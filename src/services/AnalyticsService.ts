import { supabase } from '../config/supabase';

const devLog = (..._args: any[]) => { if (__DEV__) { /* logging disabled for production safety */ } }

export interface SessionData {
  id?: string;
  userId: string | null; // null for unauthenticated users
  uniqueVisitorId: string; // Generated ID for tracking unique visitors
  isAuthenticated: boolean;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in seconds
  platform: 'web' | 'mobile';
  userAgent?: string;
  visitNumber?: number; // How many times this user visited today
}

export interface AnalyticsSummary {
  authenticatedUsers: number;
  unauthenticatedUsers: number;
  totalSessions: number;
  averageDuration: number; // in seconds
  totalDuration: number; // in seconds
  uniqueAuthenticatedUsers: number;
  uniqueUnauthenticatedUsers: number;
  totalUniqueUsers: number;
  averageVisitsPerUser: number;
  newAuthenticatedUsers: number;
  newUnauthenticatedUsers: number;
  totalNewUsers: number;
}

export interface TrendData {
  date: string;
  authenticatedSessions: number;
  unauthenticatedSessions: number;
  totalSessions: number;
  averageDuration: number;
  uniqueAuthenticatedUsers: number;
  uniqueUnauthenticatedUsers: number;
  totalUniqueUsers: number;
  newAuthenticatedUsers: number;
  newUnauthenticatedUsers: number;
  totalNewUsers: number;
}

export interface UserVisitData {
  uniqueVisitorId: string;
  userId: string | null;
  isAuthenticated: boolean;
  visitCount: number;
  lastVisit: Date;
}

export interface TodaySummary {
  totalSessions: number;
  newAuthenticatedUsers: number;
  newUnauthenticatedUsers: number;
  returningAuthenticatedUsers: number;
  returningUnauthenticatedUsers: number;
  totalNewUsers: number;
  totalReturningUsers: number;
  averageDuration: number;
  lastUpdated: Date;
}

export interface VisitorSessionRow {
  start_time: string;
  unique_visitor_id: string | null;
}

export interface VisitorBucketCounts {
  sessions: number;
  newUsers: number;
  returningUsers: number;
}

export interface VisitorAnalyticsBucket {
  key: string;
  start: string;
  sessions: number;
  newVisitors: number;
  returningVisitors: number;
  uniqueVisitors: number;
}

export interface VisitorAnalyticsResponse {
  timezone: 'Africa/Kampala';
  period: 'day' | 'week' | 'month' | 'year' | 'decade';
  range: { start: string; end: string };
  buckets: VisitorAnalyticsBucket[];
  totals: { sessions: number; uniqueVisitors: number; newVisitors: number; returningVisitors: number; unidentifiedSessions: number; averageDuration: number };
}

interface AnalyticsDateRange {
  start: Date;
  end: Date;
}

const localDayRange = (date: Date): AnalyticsDateRange => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const localWeekRange = (date: Date): AnalyticsDateRange => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
};

const localMonthRange = (year: number, month: number): AnalyticsDateRange => ({
  start: new Date(year, month, 1),
  end: new Date(year, month + 1, 1),
});

const localYearRange = (year: number): AnalyticsDateRange => ({
  start: new Date(year, 0, 1),
  end: new Date(year + 1, 0, 1),
});

const localDecadeRange = (decadeStartYear: number): AnalyticsDateRange => ({
  start: new Date(decadeStartYear, 0, 1),
  end: new Date(decadeStartYear + 10, 0, 1),
});

const FUNCTIONS_BASE_URL = (
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ||
  process.env.EXPO_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  ''
).replace(/\/$/, '');

const functionUrl = (name: string) => `${FUNCTIONS_BASE_URL}/.netlify/functions/${name}`;

/**
 * Aggregate visitor sessions into period buckets. A visitor is counted once
 * per displayed bucket, while every session contributes to the sessions
 * count. A visitor is returning in a bucket when they have a session before
 * that bucket, including an earlier bucket in the same selected period.
 */
export function aggregateVisitorSessions(
  rows: VisitorSessionRow[],
  existingVisitorIds: Set<string>,
  bucketCount: number,
  getBucketIndex: (startTime: Date) => number,
): VisitorBucketCounts[] {
  const buckets = Array.from({ length: bucketCount }, () => ({
    sessions: 0,
    newUsers: 0,
    returningUsers: 0,
  }));
  const knownVisitors = new Set(existingVisitorIds);
  const visitorsInBucket = Array.from({ length: bucketCount }, () => new Set<string>());

  [...rows].sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach((row) => {
    const bucketIndex = getBucketIndex(new Date(row.start_time));
    if (bucketIndex < 0 || bucketIndex >= bucketCount || !Number.isInteger(bucketIndex)) return;

    buckets[bucketIndex].sessions += 1;
    const visitorId = row.unique_visitor_id;
    if (visitorId && !visitorsInBucket[bucketIndex].has(visitorId)) {
      visitorsInBucket[bucketIndex].add(visitorId);
      if (knownVisitors.has(visitorId)) buckets[bucketIndex].returningUsers += 1;
      else buckets[bucketIndex].newUsers += 1;
    }

    if (visitorId) knownVisitors.add(visitorId);
  });

  return buckets;
}

class AnalyticsService {
  private readonly analyticsDisabledKey = 'yovibe_analytics_disabled';
  private readonly visitorIdKey = 'yovibe_visitor_id';

  private async functionRequest<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const response = await fetch(functionUrl(name), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Analytics request failed (${response.status})`);
    this.enableAnalytics();
    return payload as T;
  }

  async getVisitorAnalytics(period: VisitorAnalyticsResponse['period']): Promise<VisitorAnalyticsResponse> {
    return this.functionRequest<VisitorAnalyticsResponse>('analytics-admin', { period });
  }

  private isAnalyticsDisabled(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }

      return localStorage.getItem(this.analyticsDisabledKey) === 'true';
    } catch {
      return false;
    }
  }

  private disableAnalytics(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      localStorage.setItem(this.analyticsDisabledKey, 'true');
    } catch {
      // Ignore storage failures; analytics is best-effort only.
    }
  }

  private isRlsOrForbiddenError(error: any): boolean {
    return error?.code === '42501' || error?.status === 401 || error?.status === 403 || /row-level security|forbidden/i.test(error?.message || '');
  }

  private enableAnalytics(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) localStorage.removeItem(this.analyticsDisabledKey);
    } catch {
      // Storage availability must not affect analytics requests.
    }
  }

  private async fetchVisitorSessions(startTime?: string, endTime?: string): Promise<VisitorSessionRow[]> {
    const rows: VisitorSessionRow[] = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      let query = supabase
        .from('analytics_sessions')
        .select('start_time, unique_visitor_id')
        .order('start_time', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (startTime) query = query.gte('start_time', startTime);
      if (endTime) query = query.lt('start_time', endTime);

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;

      rows.push(...(data as VisitorSessionRow[]));
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return rows;
  }

  /**
   * Check if a visitor is new (first time visiting EVER)
   */
  private async isFirstTimeVisitor(uniqueVisitorId: string): Promise<boolean> {
    if (this.isAnalyticsDisabled()) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('id')
        .eq('unique_visitor_id', uniqueVisitorId)
        .order('start_time', { ascending: true });

      if (error) throw error;

      // New if this is their first or only session
      return (data?.length || 0) <= 1;
    } catch (error) {
      console.error('Analytics: Error checking first time visitor', error);
      return false;
    }
  }

  /**
   * Check if visitor's first session was within a date range
   */
  private async isNewInPeriod(uniqueVisitorId: string, startDate: Date, endDate: Date): Promise<boolean> {
    if (this.isAnalyticsDisabled()) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('start_time')
        .eq('unique_visitor_id', uniqueVisitorId)
        .order('start_time', { ascending: true })
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return false;
      
      // Get first session ever
      const firstVisit = new Date(data[0].start_time);
      
      // Check if first visit was in this period
      return firstVisit >= startDate && firstVisit < endDate;
    } catch (error) {
      console.error('Analytics: Error checking new in period', error);
      return false;
    }
  }

  /**
   * Get or create a unique visitor ID for tracking
   */
  private getUniqueVisitorId(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      let visitorId = localStorage.getItem(this.visitorIdKey);
      
      if (!visitorId) {
        visitorId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `visitor_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        localStorage.setItem(this.visitorIdKey, visitorId);
      }
      
      return visitorId;
    }
    
    // Fallback for non-browser environments
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get today's visit count for this visitor
   */
  private async getTodayVisitCount(uniqueVisitorId: string): Promise<number> {
    if (this.isAnalyticsDisabled()) {
      return 0;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('id')
        .eq('unique_visitor_id', uniqueVisitorId)
        .gte('start_time', today.toISOString())
        .lt('start_time', tomorrow.toISOString());

      if (error) throw error;

      return data?.length || 0;
    } catch (error) {
      console.error('Analytics: Error getting visit count', error);
      return 0;
    }
  }

  /**
   * Start a new session
   */
  async startSession(userId: string | null, platform: 'web' | 'mobile'): Promise<string> {
    try {
      void userId; // The function derives account identity from the verified access token.
      const result = await this.functionRequest<{ sessionId: string }>('analytics-session', {
        action: 'start', guestVisitorId: this.getUniqueVisitorId(), platform,
      });
      return result.sessionId;
    } catch (error) {
      if (this.isRlsOrForbiddenError(error)) {
        this.disableAnalytics();
        console.warn('Analytics: Disabled session tracking because Supabase blocked writes for analytics_sessions');
        return '';
      }

      console.error('Analytics: Error starting session', error);
      return '';
    }
  }

  /**
   * End a session and record duration
   */
  async endSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    try {
      await this.functionRequest('analytics-session', {
        action: 'end', sessionId, guestVisitorId: this.getUniqueVisitorId(), platform: 'web',
      });
    } catch (error) {
      if (!this.isRlsOrForbiddenError(error)) {
        console.error('Analytics: Error ending session', error);
      }
    }
  }

  async touchSession(sessionId: string, platform: 'web' | 'mobile'): Promise<string> {
    const result = await this.functionRequest<{ sessionId: string }>('analytics-session', {
      action: 'touch', sessionId, guestVisitorId: this.getUniqueVisitorId(), platform,
    });
    return result.sessionId;
  }

  async promoteSession(sessionId: string): Promise<string> {
    const result = await this.functionRequest<{ sessionId: string }>('analytics-session', {
      action: 'promote', sessionId, guestVisitorId: this.getUniqueVisitorId(), platform: 'web',
    });
    return result.sessionId;
  }

  rotateGuestVisitorId(): void {
    if (typeof window !== 'undefined' && window.localStorage) localStorage.removeItem(this.visitorIdKey);
  }

  /**
   * Get analytics summary for the last 30 days
   */
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    if (this.isAnalyticsDisabled()) {
      return {
        authenticatedUsers: 0,
        unauthenticatedUsers: 0,
        totalSessions: 0,
        averageDuration: 0,
        totalDuration: 0,
        uniqueAuthenticatedUsers: 0,
        uniqueUnauthenticatedUsers: 0,
        totalUniqueUsers: 0,
        averageVisitsPerUser: 0,
        newAuthenticatedUsers: 0,
        newUnauthenticatedUsers: 0,
        totalNewUsers: 0,
      };
    }

    try {
      const analytics = await this.getVisitorAnalytics('month');
      return {
        authenticatedUsers: 0,
        unauthenticatedUsers: 0,
        totalSessions: analytics.totals.sessions,
        averageDuration: 0,
        totalDuration: 0,
        uniqueAuthenticatedUsers: 0,
        uniqueUnauthenticatedUsers: analytics.totals.uniqueVisitors,
        totalUniqueUsers: analytics.totals.uniqueVisitors,
        averageVisitsPerUser: analytics.totals.uniqueVisitors ? analytics.totals.sessions / analytics.totals.uniqueVisitors : 0,
        newAuthenticatedUsers: 0,
        newUnauthenticatedUsers: analytics.totals.newVisitors,
        totalNewUsers: analytics.totals.newVisitors,
      };
      /* Legacy browser-side aggregation remains below temporarily for source compatibility. */
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', thirtyDaysAgo.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      let authenticatedCount = 0;
      let unauthenticatedCount = 0;
      let totalDuration = 0;
      let sessionsWithDuration = 0;
      const uniqueAuthUsers = new Set<string>();
      const uniqueUnauthUsers = new Set<string>();
      let totalVisits = 0;

      // Collect all unique visitor IDs first
      const allVisitorIds: string[] = [];
      
      (data || []).forEach((session) => {
        if (session.is_authenticated) {
          authenticatedCount++;
          if (session.user_id) uniqueAuthUsers.add(session.user_id);
        } else {
          unauthenticatedCount++;
          if (session.unique_visitor_id) {
            uniqueUnauthUsers.add(session.unique_visitor_id);
            allVisitorIds.push(session.unique_visitor_id);
          }
        }

        if (session.duration) {
          totalDuration += session.duration;
          sessionsWithDuration++;
        }
        
        totalVisits += session.visit_number || 1;
      });

      // Get first sessions for unique visitors
      const uniqueVisitorsArray = Array.from(uniqueUnauthUsers);
      const visitorFirstSessions = new Map<string, Date>();
      
      if (uniqueVisitorsArray.length > 0) {
        for (const visitorId of uniqueVisitorsArray) {
          const { data: firstSession, error: firstError } = await supabase
            .from('analytics_sessions')
            .select('start_time')
            .eq('unique_visitor_id', visitorId)
            .order('start_time', { ascending: true })
            .limit(1);

          if (!firstError && firstSession && firstSession.length > 0) {
            visitorFirstSessions.set(visitorId, new Date(firstSession[0]!.start_time));
          }
        }
      }

      // Determine new vs returning users
      const newUnauthUsers = new Set<string>();
      uniqueUnauthUsers.forEach((visitorId) => {
        const firstSession = visitorFirstSessions.get(visitorId);
        if (firstSession && firstSession >= thirtyDaysAgo) {
          newUnauthUsers.add(visitorId);
        }
      });

      // For authenticated users, assume all tracked users in the period are "new"
      const newAuthUsers = new Set<string>(uniqueAuthUsers);

      const totalUniqueUsers = uniqueAuthUsers.size + uniqueUnauthUsers.size;

      return {
        authenticatedUsers: authenticatedCount,
        unauthenticatedUsers: unauthenticatedCount,
        totalSessions: data?.length || 0,
        totalDuration,
        averageDuration: sessionsWithDuration > 0 ? totalDuration / sessionsWithDuration : 0,
        uniqueAuthenticatedUsers: uniqueAuthUsers.size,
        uniqueUnauthenticatedUsers: uniqueUnauthUsers.size,
        totalUniqueUsers,
        averageVisitsPerUser: totalUniqueUsers > 0 ? totalVisits / totalUniqueUsers : 0,
        newAuthenticatedUsers: newAuthUsers.size,
        newUnauthenticatedUsers: newUnauthUsers.size,
        totalNewUsers: newAuthUsers.size + newUnauthUsers.size,
      };
    } catch (error) {
      if (this.isRlsOrForbiddenError(error)) {
        this.disableAnalytics();
        return {
          authenticatedUsers: 0,
          unauthenticatedUsers: 0,
          totalSessions: 0,
          averageDuration: 0,
          totalDuration: 0,
          uniqueAuthenticatedUsers: 0,
          uniqueUnauthenticatedUsers: 0,
          totalUniqueUsers: 0,
          averageVisitsPerUser: 0,
          newAuthenticatedUsers: 0,
          newUnauthenticatedUsers: 0,
          totalNewUsers: 0,
        };
      }

      console.error('Analytics: Error getting summary', error);
      throw error;
    }
  }

  /**
   * Get hourly visitor data for a specific day
   */
  async getHourlyVisitorsForDay(date: Date): Promise<{ hour: number; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const { start: startOfDay, end: endOfDay } = localDayRange(date);

      const data = await this.fetchVisitorSessions(startOfDay.toISOString(), endOfDay.toISOString());
      
      // Initialize 24 hours
      const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get existing visitors before this day
      const existingVisitors = new Set<string>();
      const previousVisitors = await this.fetchVisitorSessions(undefined, startOfDay.toISOString());
      previousVisitors.forEach(session => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsToday = new Set<string>();

      data.forEach((session) => {
        const hour = new Date(session.start_time).getHours();
        hourlyData[hour].sessions++;
        
        const visitorId = session.unique_visitor_id;
        if (visitorId) {
          if (!visitorsToday.has(visitorId)) {
            visitorsToday.add(visitorId);
            if (existingVisitors.has(visitorId)) {
              hourlyData[hour].returningUsers++;
            } else {
              hourlyData[hour].newUsers++;
            }
          }
        }
      });

      return hourlyData;
    } catch (error) {
      console.error('Analytics: Error getting hourly visitors', error);
      return Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, newUsers: 0, returningUsers: 0 }));
    }
  }

  /**
   * Get daily visitor data for a week
   */
  async getDailyVisitorsForWeek(weekStartDate: Date): Promise<{ day: number; dayName: string; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const { start: startOfWeek, end: endOfWeek } = localWeekRange(weekStartDate);

      const data = await this.fetchVisitorSessions(startOfWeek.toISOString(), endOfWeek.toISOString());
      
      // Initialize 7 days
      const dailyData = Array.from({ length: 7 }, (_, day) => ({
        day,
        dayName: dayNames[day],
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get existing visitors before this week
      const existingVisitors = new Set<string>();
      const previousVisitors = await this.fetchVisitorSessions(undefined, startOfWeek.toISOString());
      previousVisitors.forEach(session => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsThisWeek = new Set<string>();

      data.forEach((session) => {
        const day = new Date(session.start_time).getDay();
        dailyData[day].sessions++;
        
        const visitorId = session.unique_visitor_id;
        if (visitorId) {
          if (!visitorsThisWeek.has(visitorId)) {
            visitorsThisWeek.add(visitorId);
            if (existingVisitors.has(visitorId)) {
              dailyData[day].returningUsers++;
            } else {
              dailyData[day].newUsers++;
            }
          }
        }
      });

      return dailyData;
    } catch (error) {
      console.error('Analytics: Error getting daily visitors for week', error);
      return Array.from({ length: 7 }, (_, day) => ({ day, dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day], sessions: 0, newUsers: 0, returningUsers: 0 }));
    }
  }

  /**
   * Get weekly visitor data for a month
   */
  async getWeeklyVisitorsForMonth(year: number, month: number): Promise<{ week: number; weekLabel: string; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const { start: startOfMonth, end: endOfMonth } = localMonthRange(year, month);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const weeksInMonth = Math.ceil((daysInMonth + startOfMonth.getDay()) / 7);

      const allData = await this.fetchVisitorSessions(startOfMonth.toISOString(), endOfMonth.toISOString());
      devLog('getWeeklyVisitorsForMonth: fetched', allData.length, `sessions for ${year}/${month + 1}`);
      
      // Initialize weeks
      const weeklyData = Array.from({ length: weeksInMonth }, (_, week) => ({
        week,
        weekLabel: `Week ${week + 1}`,
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get existing visitors before this month
      const existingVisitors = new Set<string>();
      const previousVisitors = await this.fetchVisitorSessions(undefined, startOfMonth.toISOString());
      previousVisitors.forEach(session => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsThisMonth = new Set<string>();

      allData.forEach((session) => {
        const sessionDate = new Date(session.start_time);
        const dayOfMonth = sessionDate.getDate();
        const week = Math.floor((dayOfMonth + startOfMonth.getDay() - 1) / 7);
        
        if (weeklyData[week]) {
          weeklyData[week].sessions++;
          
          const visitorId = session.unique_visitor_id;
          if (visitorId) {
            if (!visitorsThisMonth.has(visitorId)) {
              visitorsThisMonth.add(visitorId);
              if (existingVisitors.has(visitorId)) {
                weeklyData[week].returningUsers++;
              } else {
                weeklyData[week].newUsers++;
              }
            }
          }
        }
      });

      return weeklyData;
    } catch (error) {
      console.error('Analytics: Error getting weekly visitors for month', error);
      return [];
    }
  }

  /**
   * Get monthly visitor data for a year
   */
  async getMonthlyVisitorsForYear(year: number): Promise<{ month: number; monthName: string; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const { start: startOfYear, end: endOfYear } = localYearRange(year);

      const allData = await this.fetchVisitorSessions(startOfYear.toISOString(), endOfYear.toISOString());
      devLog('getMonthlyVisitorsForYear: fetched', allData.length, 'sessions for', year);

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyData = Array.from({ length: 12 }, (_, month) => ({
        month,
        monthName: monthNames[month],
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      const existingVisitors = new Set<string>();
      const previousVisitors = await this.fetchVisitorSessions(undefined, startOfYear.toISOString());
      previousVisitors.forEach((session) => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const counts = aggregateVisitorSessions(allData, existingVisitors, 12, (date) => date.getMonth());
      monthlyData.forEach((month, index) => Object.assign(month, counts[index]));

      devLog('getMonthlyVisitorsForYear: monthly totals', monthlyData.map(m => `${m.monthName}:${m.sessions}`).join(', '));
      return monthlyData;
    } catch (error) {
      console.error('Analytics: Error getting monthly visitors for year', error);
      throw error;
    }
  }

  /**
   * Get yearly visitor data for a decade
   */
  async getYearlyVisitorsForDecade(decadeStartYear: number): Promise<{ year: number; yearLabel: string; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const { start: startOfDecade, end: endOfDecade } = localDecadeRange(decadeStartYear);


      const allData = await this.fetchVisitorSessions(startOfDecade.toISOString(), endOfDecade.toISOString());
      devLog('getYearlyVisitorsForDecade: fetched', allData.length, 'sessions for decade', decadeStartYear);

      const yearlyData = Array.from({ length: 10 }, (_, i) => {
        const year = decadeStartYear + i;
        return {
          year,
          yearLabel: `${year}`,
          sessions: 0,
          newUsers: 0,
          returningUsers: 0,
        };
      });

      const existingVisitors = new Set<string>();
      const previousVisitors = await this.fetchVisitorSessions(undefined, startOfDecade.toISOString());
      previousVisitors.forEach((session) => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const counts = aggregateVisitorSessions(allData, existingVisitors, 10, (date) => date.getFullYear() - decadeStartYear);
      yearlyData.forEach((year, index) => Object.assign(year, counts[index]));

      return yearlyData;
    } catch (error) {
      console.error('Analytics: Error getting yearly visitors for decade', error);
      throw error;
    }
  }

  /**
   * Get trend data (daily/weekly/monthly)
   */
  async getTrendData(period: 'daily' | 'weekly' | 'yearly', limit: number = 30): Promise<TrendData[]> {
    try {
      const visitorPeriod = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'year';
      const analytics = await this.getVisitorAnalytics(visitorPeriod);
      return analytics.buckets.map((bucket) => ({
        // The overview chart formats this as a Date. The server supplies the
        // Africa/Kampala bucket boundary so labels never depend on a display key.
        date: bucket.start,
        authenticatedSessions: 0,
        unauthenticatedSessions: bucket.sessions,
        totalSessions: bucket.sessions,
        averageDuration: analytics.totals.averageDuration,
        uniqueAuthenticatedUsers: 0,
        uniqueUnauthenticatedUsers: bucket.uniqueVisitors,
        totalUniqueUsers: bucket.uniqueVisitors,
        newAuthenticatedUsers: 0,
        newUnauthenticatedUsers: bucket.newVisitors,
        totalNewUsers: bucket.newVisitors,
      }));
      /* Legacy browser-side aggregation remains below temporarily for source compatibility. */
      const now = new Date();
      let startDate = new Date();

      // Calculate start date based on period
      switch (period) {
        case 'daily':
          startDate.setDate(now.getDate() - limit);
          break;
        case 'weekly':
          startDate.setDate(now.getDate() - (limit * 7));
          break;
        case 'yearly':
          startDate.setMonth(now.getMonth() - limit);
          break;
      }

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', startDate.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;

      const dataByDate: Record<string, {
        authenticated: number;
        unauthenticated: number;
        totalDuration: number;
        count: number;
        uniqueAuthUsers: Set<string>;
        uniqueUnauthUsers: Set<string>;
        newAuthUsers: Set<string>;
        newUnauthUsers: Set<string>;
        sessions: any[];
      }> = {};

      (data || []).forEach((session) => {
        const date = new Date(session.start_time);
        let dateKey: string;

        // Group by period
        switch (period) {
          case 'daily':
            dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
            break;
          case 'weekly':
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            dateKey = weekStart.toISOString().split('T')[0];
            break;
          case 'yearly':
            dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            dateKey = date.toISOString().split('T')[0];
        }

        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = {
            authenticated: 0,
            unauthenticated: 0,
            totalDuration: 0,
            count: 0,
            uniqueAuthUsers: new Set<string>(),
            uniqueUnauthUsers: new Set<string>(),
            newAuthUsers: new Set<string>(),
            newUnauthUsers: new Set<string>(),
            sessions: [],
          };
        }

        dataByDate[dateKey].sessions.push(session);

        if (session.is_authenticated) {
          dataByDate[dateKey].authenticated++;
          if (session.user_id) dataByDate[dateKey].uniqueAuthUsers.add(session.user_id);
        } else {
          dataByDate[dateKey].unauthenticated++;
          if (session.unique_visitor_id) dataByDate[dateKey].uniqueUnauthUsers.add(session.unique_visitor_id);
        }

        if (session.duration) {
          dataByDate[dateKey].totalDuration += session.duration;
          dataByDate[dateKey].count++;
        }
      });

      // Check for new users in each period
      for (const [dateKey, stats] of Object.entries(dataByDate)) {
        const periodStart = new Date(dateKey);
        let periodEnd: Date;
        
        // Calculate period end based on type
        switch (period) {
          case 'daily':
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + 1);
            break;
          case 'weekly':
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + 7);
            break;
          case 'yearly':
            periodEnd = new Date(periodStart);
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            break;
          default:
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + 1);
        }
        
        const processedVisitors = new Set<string>();
        
        for (const session of stats.sessions) {
          const visitorId = session.unique_visitor_id;
          
          // Only check once per unique visitor
          if (visitorId && !processedVisitors.has(visitorId)) {
            processedVisitors.add(visitorId);
            
            // Get first session for this visitor
            const isNew = await this.isNewInPeriod(visitorId, periodStart, periodEnd);
            
            if (isNew) {
              if (session.is_authenticated && session.user_id) {
                stats.newAuthUsers.add(session.user_id);
              } else if (session.unique_visitor_id) {
                stats.newUnauthUsers.add(session.unique_visitor_id);
              }
            }
          }
        }
      }

      // Convert to array and sort by date
      return Object.entries(dataByDate)
        .map(([date, stats]) => ({
          date,
          authenticatedSessions: stats.authenticated,
          unauthenticatedSessions: stats.unauthenticated,
          totalSessions: stats.authenticated + stats.unauthenticated,
          averageDuration: stats.count > 0 ? stats.totalDuration / stats.count : 0,
          uniqueAuthenticatedUsers: stats.uniqueAuthUsers.size,
          uniqueUnauthenticatedUsers: stats.uniqueUnauthUsers.size,
          totalUniqueUsers: stats.uniqueAuthUsers.size + stats.uniqueUnauthUsers.size,
          newAuthenticatedUsers: stats.newAuthUsers.size,
          newUnauthenticatedUsers: stats.newUnauthUsers.size,
          totalNewUsers: stats.newAuthUsers.size + stats.newUnauthUsers.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error('Analytics: Error getting trend data', error);
      throw error;
    }
  }

  /**
   * Get today's summary with new and returning users breakdown
   */
  async getTodaySummary(): Promise<TodaySummary> {
    try {
      const analytics = await this.getVisitorAnalytics('day');
      return {
        totalSessions: analytics.totals.sessions,
        newAuthenticatedUsers: 0,
        newUnauthenticatedUsers: analytics.totals.newVisitors,
        returningAuthenticatedUsers: 0,
        returningUnauthenticatedUsers: analytics.totals.returningVisitors,
        totalNewUsers: analytics.totals.newVisitors,
        totalReturningUsers: analytics.totals.returningVisitors,
        averageDuration: analytics.totals.averageDuration,
        lastUpdated: new Date(),
      };
      /* Legacy browser-side aggregation remains below temporarily for source compatibility. */
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', today.toISOString())
        .lt('start_time', tomorrow.toISOString())
        .order('start_time', { ascending: true});

      if (error) throw error;
      
      const newAuthUsers = new Set<string>();
      const newUnauthUsers = new Set<string>();
      const returningAuthUsers = new Set<string>();
      const returningUnauthUsers = new Set<string>();
      
      let totalDuration = 0;
      let sessionsWithDuration = 0;

      // Get all visitor IDs
      const allVisitorIds = new Set<string>();
      (data || []).forEach((session) => {
        const vid = session.unique_visitor_id;
        if (vid) allVisitorIds.add(vid);
      });

      // Get first sessions for all visitors
      const visitorFirstSessions = new Map<string, Date>();
      for (const visitorId of allVisitorIds) {
        const { data: firstSession, error: firstError } = await supabase
          .from('analytics_sessions')
          .select('start_time')
          .eq('unique_visitor_id', visitorId)
          .order('start_time', { ascending: true })
          .limit(1);

        if (!firstError && firstSession && firstSession.length > 0) {
          visitorFirstSessions.set(visitorId, new Date(firstSession[0]!.start_time));
        }
      }

      // Process each session
      const processedVisitors = new Set<string>();
      
      for (const session of (data || [])) {
        const visitorId = session.unique_visitor_id;
        
        // Track duration
        if (session.duration) {
          totalDuration += session.duration;
          sessionsWithDuration++;
        }
        
        // Check if new or returning (only once per visitor)
        if (visitorId && !processedVisitors.has(visitorId)) {
          processedVisitors.add(visitorId);
          
          const firstSession = visitorFirstSessions.get(visitorId);
          const isNew = Boolean(firstSession && firstSession >= today && firstSession < tomorrow);
          
          if (isNew) {
            // New user today
            if (session.is_authenticated && session.user_id) {
              newAuthUsers.add(session.user_id);
            } else if (session.unique_visitor_id) {
              newUnauthUsers.add(session.unique_visitor_id);
            }
          } else {
            // Returning user
            if (session.is_authenticated && session.user_id) {
              returningAuthUsers.add(session.user_id);
            } else if (session.unique_visitor_id) {
              returningUnauthUsers.add(session.unique_visitor_id);
            }
          }
        }
      }

      return {
        totalSessions: data?.length || 0,
        newAuthenticatedUsers: newAuthUsers.size,
        newUnauthenticatedUsers: newUnauthUsers.size,
        returningAuthenticatedUsers: returningAuthUsers.size,
        returningUnauthenticatedUsers: returningUnauthUsers.size,
        totalNewUsers: newAuthUsers.size + newUnauthUsers.size,
        totalReturningUsers: returningAuthUsers.size + returningUnauthUsers.size,
        averageDuration: sessionsWithDuration > 0 ? totalDuration / sessionsWithDuration : 0,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error('Analytics: Error getting today summary', error);
      throw error;
    }
  }

  /**
   * Get users with multiple visits today
   */
  async getFrequentVisitorsToday(): Promise<UserVisitData[]> {
    try {
      const result = await this.functionRequest<{ visitors: UserVisitData[] }>('analytics-admin', { action: 'frequent' });
      return result.visitors.map((visitor) => ({ ...visitor, lastVisit: new Date(visitor.lastVisit) }));
      /* Legacy browser-side aggregation remains below temporarily for source compatibility. */
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', today.toISOString())
        .lt('start_time', tomorrow.toISOString())
        .order('start_time', { ascending: false })
        .limit(500); // Limit to 500 most recent sessions for performance

      if (error) throw error;

      const visitorMap = new Map<string, UserVisitData>();

      (data || []).forEach((session) => {
        const visitorId = session.unique_visitor_id;

        if (visitorMap.has(visitorId)) {
          const existing = visitorMap.get(visitorId)!;
          existing.visitCount++;
          existing.lastVisit = new Date(session.start_time);
        } else {
          visitorMap.set(visitorId, {
            uniqueVisitorId: visitorId,
            userId: session.user_id || null,
            isAuthenticated: session.is_authenticated,
            visitCount: 1,
            lastVisit: new Date(session.start_time),
          });
        }
      });

      // Return sorted by visit count (highest first), limited to top 20
      return Array.from(visitorMap.values())
        .sort((a, b) => b.visitCount - a.visitCount)
        .slice(0, 20);
    } catch (error) {
      console.error('Analytics: Error getting frequent visitors', error);
      throw error;
    }
  }

  /**
   * Get all unique unauthenticated visitor IDs
   */
  async getAllUnauthenticatedVisitors(): Promise<UserVisitData[]> {
    try {
      const result = await this.functionRequest<{ visitors: UserVisitData[] }>('analytics-admin', { action: 'guests' });
      return result.visitors.map((visitor) => ({ ...visitor, lastVisit: new Date(visitor.lastVisit) }));
      /* Legacy browser-side aggregation remains below temporarily for source compatibility. */
      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .eq('is_authenticated', false);

      if (error) throw error;

      const visitorMap = new Map<string, UserVisitData>();

      (data || []).forEach((session) => {
        const visitorId = session.unique_visitor_id;

        if (!visitorMap.has(visitorId)) {
          visitorMap.set(visitorId, {
            uniqueVisitorId: visitorId,
            userId: session.user_id || null,
            isAuthenticated: false,
            visitCount: 1,
            lastVisit: new Date(session.start_time),
          });
        } else {
          const existing = visitorMap.get(visitorId)!;
          existing.visitCount++;
          existing.lastVisit = new Date(session.start_time);
        }
      });

      // Return sorted by visit count (highest first)
      return Array.from(visitorMap.values())
        .sort((a, b) => b.visitCount - a.visitCount);
    } catch (error) {
      console.error('Analytics: Error getting all unauthenticated visitors', error);
      throw error;
    }
  }
}

export default new AnalyticsService();
