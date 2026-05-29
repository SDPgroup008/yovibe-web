import { supabase } from '../config/supabase';

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

class AnalyticsService {
  private readonly analyticsDisabledKey = 'yovibe_analytics_disabled';

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
    const VISITOR_ID_KEY = 'yovibe_visitor_id';
    
    if (typeof window !== 'undefined' && window.localStorage) {
      let visitorId = localStorage.getItem(VISITOR_ID_KEY);
      
      if (!visitorId) {
        visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        localStorage.setItem(VISITOR_ID_KEY, visitorId);
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
    if (this.isAnalyticsDisabled()) {
      return '';
    }

    try {
      const uniqueVisitorId = this.getUniqueVisitorId();
      const visitNumber = await this.getTodayVisitCount(uniqueVisitorId) + 1;
      
      const sessionData = {
        user_id: userId,
        unique_visitor_id: uniqueVisitorId,
        is_authenticated: !!userId,
        start_time: new Date().toISOString(),
        platform,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        visit_number: visitNumber,
      };

      const { data, error } = await supabase
        .from('analytics_sessions')
        .insert(sessionData)
        .select('id')
        .single();

      if (error) throw error;

      console.log('Analytics: Session started', data.id, 'Visit #', visitNumber, 'for visitor', uniqueVisitorId);
      return data.id;
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
    if (!sessionId || this.isAnalyticsDisabled()) {
      return;
    }

    try {
      const endTime = new Date();
      
      // Get the session document to calculate duration
      const { data: sessionData, error: fetchError } = await supabase
        .from('analytics_sessions')
        .select('start_time')
        .eq('id', sessionId)
        .single();
      
      if (fetchError) throw fetchError;

      if (sessionData) {
        const startTime = new Date(sessionData.start_time);
        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000); // in seconds

        const { error: updateError } = await supabase
          .from('analytics_sessions')
          .update({
            end_time: endTime.toISOString(),
            duration,
          })
          .eq('id', sessionId);

        if (updateError) throw updateError;

        console.log('Analytics: Session ended', sessionId, 'Duration:', duration, 'seconds');
      }
    } catch (error) {
      if (!this.isRlsOrForbiddenError(error)) {
        console.error('Analytics: Error ending session', error);
      }
    }
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
            visitorFirstSessions.set(visitorId, new Date(firstSession[0].start_time));
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
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      // Initialize 24 hours
      const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get existing visitors before this day
      const { data: previousVisitors, error: prevError } = await supabase
        .from('analytics_sessions')
        .select('unique_visitor_id')
        .lt('start_time', startOfDay.toISOString());

      if (prevError) throw prevError;

      const existingVisitors = new Set<string>();
      (previousVisitors || []).forEach(session => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsToday = new Set<string>();

      (data || []).forEach((session) => {
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
      const startOfWeek = new Date(weekStartDate);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', startOfWeek.toISOString())
        .lt('start_time', endOfWeek.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      // Initialize 7 days
      const dailyData = Array.from({ length: 7 }, (_, day) => ({
        day,
        dayName: dayNames[day],
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get existing visitors before this week
      const { data: previousVisitors, error: prevError } = await supabase
        .from('analytics_sessions')
        .select('unique_visitor_id')
        .lt('start_time', startOfWeek.toISOString());

      if (prevError) throw prevError;

      const existingVisitors = new Set<string>();
      (previousVisitors || []).forEach(session => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsThisWeek = new Set<string>();

      (data || []).forEach((session) => {
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
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);
      const weeksInMonth = Math.ceil((endOfMonth.getDate() + startOfMonth.getDay()) / 7);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', startOfMonth.toISOString())
        .lte('start_time', endOfMonth.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      // Initialize weeks
      const weeklyData = Array.from({ length: weeksInMonth }, (_, week) => ({
        week,
        weekLabel: `Week ${week + 1}`,
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get existing visitors before this month
      const { data: previousVisitors, error: prevError } = await supabase
        .from('analytics_sessions')
        .select('unique_visitor_id')
        .lt('start_time', startOfMonth.toISOString());

      if (prevError) throw prevError;

      const existingVisitors = new Set<string>();
      (previousVisitors || []).forEach(session => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsThisMonth = new Set<string>();

      (data || []).forEach((session) => {
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
      const startOfYear = new Date(year, 0, 1);
      startOfYear.setHours(0, 0, 0, 0);
      const endOfYear = new Date(year + 1, 0, 1);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', startOfYear.toISOString())
        .lt('start_time', endOfYear.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyData = Array.from({ length: 12 }, (_, month) => ({
        month,
        monthName: monthNames[month],
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      const { data: previousVisitors, error: prevError } = await supabase
        .from('analytics_sessions')
        .select('unique_visitor_id')
        .lt('start_time', startOfYear.toISOString());

      if (prevError) throw prevError;

      const existingVisitors = new Set<string>();
      (previousVisitors || []).forEach((session) => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsThisYear = new Set<string>();

      (data || []).forEach((session) => {
        const month = new Date(session.start_time).getMonth();
        monthlyData[month].sessions++;

        const visitorId = session.unique_visitor_id;
        if (visitorId && !visitorsThisYear.has(visitorId)) {
          visitorsThisYear.add(visitorId);
          if (existingVisitors.has(visitorId)) {
            monthlyData[month].returningUsers++;
          } else {
            monthlyData[month].newUsers++;
          }
        }
      });

      return monthlyData;
    } catch (error) {
      console.error('Analytics: Error getting monthly visitors for year', error);
      return Array.from({ length: 12 }, (_, month) => ({
        month,
        monthName: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month],
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));
    }
  }

  /**
   * Get yearly visitor data for a decade
   */
  async getYearlyVisitorsForDecade(decadeStartYear: number): Promise<{ year: number; yearLabel: string; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const startOfDecade = new Date(decadeStartYear, 0, 1);
      startOfDecade.setHours(0, 0, 0, 0);
      const endOfDecade = new Date(decadeStartYear + 10, 0, 1);

      const { data, error } = await supabase
        .from('analytics_sessions')
        .select('*')
        .gte('start_time', startOfDecade.toISOString())
        .lt('start_time', endOfDecade.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;

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

      const { data: previousVisitors, error: prevError } = await supabase
        .from('analytics_sessions')
        .select('unique_visitor_id')
        .lt('start_time', startOfDecade.toISOString());

      if (prevError) throw prevError;

      const existingVisitors = new Set<string>();
      (previousVisitors || []).forEach((session) => {
        if (session.unique_visitor_id) existingVisitors.add(session.unique_visitor_id);
      });

      const visitorsThisDecade = new Set<string>();

      (data || []).forEach((session) => {
        const year = new Date(session.start_time).getFullYear();
        const yearIndex = year - decadeStartYear;
        if (yearIndex < 0 || yearIndex > 9) return;

        yearlyData[yearIndex].sessions++;

        const visitorId = session.unique_visitor_id;
        if (visitorId && !visitorsThisDecade.has(visitorId)) {
          visitorsThisDecade.add(visitorId);
          if (existingVisitors.has(visitorId)) {
            yearlyData[yearIndex].returningUsers++;
          } else {
            yearlyData[yearIndex].newUsers++;
          }
        }
      });

      return yearlyData;
    } catch (error) {
      console.error('Analytics: Error getting yearly visitors for decade', error);
      return Array.from({ length: 10 }, (_, i) => {
        const year = decadeStartYear + i;
        return {
          year,
          yearLabel: `${year}`,
          sessions: 0,
          newUsers: 0,
          returningUsers: 0,
        };
      });
    }
  }

  /**
   * Get trend data (daily/weekly/monthly)
   */
  async getTrendData(period: 'daily' | 'weekly' | 'yearly', limit: number = 30): Promise<TrendData[]> {
    try {
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
          visitorFirstSessions.set(visitorId, new Date(firstSession[0].start_time));
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
          const isNew = firstSession && firstSession >= today && firstSession < tomorrow;
          
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
