import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  Timestamp,
  DocumentData,
  updateDoc,
  doc,
  getDoc,
  limit
} from 'firebase/firestore';
import { db } from '../config/firebase';

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
  private sessionsCollection = collection(db, 'analytics_sessions');

  /**
   * Check if a visitor is new (first time visiting EVER)
   */
  private async isFirstTimeVisitor(uniqueVisitorId: string): Promise<boolean> {
    try {
      const q = query(
        this.sessionsCollection,
        where('uniqueVisitorId', '==', uniqueVisitorId),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      // New if this is their first or only session
      return snapshot.size <= 1;
    } catch (error) {
      console.error('Analytics: Error checking first time visitor', error);
      return false;
    }
  }

  /**
   * Check if visitor's first session was within a date range
   */
  private async isNewInPeriod(uniqueVisitorId: string, startDate: Date, endDate: Date): Promise<boolean> {
    try {
      const q = query(
        this.sessionsCollection,
        where('uniqueVisitorId', '==', uniqueVisitorId),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) return false;
      
      // Get first session ever
      const firstSession = snapshot.docs[0].data();
      const firstVisit = firstSession.startTime.toDate();
      
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
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const q = query(
        this.sessionsCollection,
        where('uniqueVisitorId', '==', uniqueVisitorId),
        where('startTime', '>=', Timestamp.fromDate(today)),
        where('startTime', '<', Timestamp.fromDate(tomorrow))
      );

      const snapshot = await getDocs(q);
      return snapshot.size;
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
      const uniqueVisitorId = this.getUniqueVisitorId();
      const visitNumber = await this.getTodayVisitCount(uniqueVisitorId) + 1;
      
      const sessionData: Omit<SessionData, 'id'> = {
        userId,
        uniqueVisitorId,
        isAuthenticated: !!userId,
        startTime: new Date(),
        platform,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        visitNumber,
      };

      const docRef = await addDoc(this.sessionsCollection, {
        ...sessionData,
        startTime: Timestamp.fromDate(sessionData.startTime),
      });

      console.log('Analytics: Session started', docRef.id, 'Visit #', visitNumber, 'for visitor', uniqueVisitorId);
      return docRef.id;
    } catch (error) {
      console.error('Analytics: Error starting session', error);
      throw error;
    }
  }

  /**
   * End a session and record duration
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const endTime = new Date();
      
      // Get the session document to calculate duration
      const sessionDoc = doc(db, 'analytics_sessions', sessionId);
      const sessionSnap = await getDoc(sessionDoc);
      
      if (sessionSnap.exists()) {
        const startTime = sessionSnap.data().startTime.toDate();
        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000); // in seconds

        await updateDoc(sessionDoc, {
          endTime: Timestamp.fromDate(endTime),
          duration,
        });

        console.log('Analytics: Session ended', sessionId, 'Duration:', duration, 'seconds');
      }
    } catch (error) {
      console.error('Analytics: Error ending session', error);
    }
  }

  /**
   * Get analytics summary for the last 30 days
   */
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(thirtyDaysAgo)),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      
      let authenticatedCount = 0;
      let unauthenticatedCount = 0;
      let totalDuration = 0;
      let sessionsWithDuration = 0;
      const uniqueAuthUsers = new Set<string>();
      const uniqueUnauthUsers = new Set<string>();
      let totalVisits = 0;

      // Collect all unique visitor IDs first
      const allVisitorIds: string[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isAuthenticated) {
          authenticatedCount++;
          if (data.userId) uniqueAuthUsers.add(data.userId);
        } else {
          unauthenticatedCount++;
          if (data.uniqueVisitorId) {
            uniqueUnauthUsers.add(data.uniqueVisitorId);
            allVisitorIds.push(data.uniqueVisitorId);
          }
        }

        if (data.duration) {
          totalDuration += data.duration;
          sessionsWithDuration++;
        }
        
        totalVisits += data.visitNumber || 1;
      });

      // OPTIMIZATION: Single batched query to get all visitors' first session times
      // instead of N+1 queries (one per unique visitor)
      const uniqueVisitorsArray = Array.from(uniqueUnauthUsers);
      const visitorFirstSessions = new Map<string, Date>();
      
      if (uniqueVisitorsArray.length > 0) {
        // Fetch in batches of 30 (Firestore 'in' limit)
        const BATCH_SIZE = 30;
        for (let i = 0; i < uniqueVisitorsArray.length; i += BATCH_SIZE) {
          const batch = uniqueVisitorsArray.slice(i, i + BATCH_SIZE);
          const batchQuery = query(
            this.sessionsCollection,
            where('uniqueVisitorId', 'in', batch),
            orderBy('startTime', 'asc')
          );
          
          const batchSnapshot = await getDocs(batchQuery);
          batchSnapshot.forEach((doc) => {
            const data = doc.data();
            const vid = data.uniqueVisitorId;
            if (vid && !visitorFirstSessions.has(vid)) {
              visitorFirstSessions.set(vid, data.startTime.toDate());
            }
          });
        }
      }

      // Determine new vs returning users using the batched data
      const newUnauthUsers = new Set<string>();
      uniqueUnauthUsers.forEach((visitorId) => {
        const firstSession = visitorFirstSessions.get(visitorId);
        if (firstSession && firstSession >= thirtyDaysAgo) {
          newUnauthUsers.add(visitorId);
        }
      });

      // For authenticated users, assume all tracked users in the period are "new" 
      // since we don't have historical data - this can be refined later
      const newAuthUsers = new Set<string>(uniqueAuthUsers);

      const totalUniqueUsers = uniqueAuthUsers.size + uniqueUnauthUsers.size;

      return {
        authenticatedUsers: authenticatedCount,
        unauthenticatedUsers: unauthenticatedCount,
        totalSessions: snapshot.size,
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
      console.error('Analytics: Error getting summary', error);
      throw error;
    }
  }

  /**
   * Get hourly visitor data for a specific day
   * Used for daily view - shows 24 hours
   */
  async getHourlyVisitorsForDay(date: Date): Promise<{ hour: number; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setHours(23, 59, 59, 999);

      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(startOfDay)),
        where('startTime', '<=', Timestamp.fromDate(endOfDay)),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      
      // Initialize 24 hours
      const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get unique visitors who visited before this day to determine new vs returning
      const startOfTime = new Date(2020, 0, 1); // Far back
      const visitorQuery = query(
        this.sessionsCollection,
        where('startTime', '<', Timestamp.fromDate(startOfDay))
      );
      const allVisitorsSnapshot = await getDocs(visitorQuery);
      const existingVisitors = new Set<string>();
      allVisitorsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.uniqueVisitorId) existingVisitors.add(data.uniqueVisitorId);
      });

      const visitorsToday = new Set<string>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const hour = data.startTime.toDate().getHours();
        hourlyData[hour].sessions++;
        
        const visitorId = data.uniqueVisitorId;
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
   * Used for weekly view - shows 7 days
   */
  async getDailyVisitorsForWeek(weekStartDate: Date): Promise<{ day: number; dayName: string; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const startOfWeek = new Date(weekStartDate);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(startOfWeek)),
        where('startTime', '<', Timestamp.fromDate(endOfWeek)),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      
      // Initialize 7 days
      const dailyData = Array.from({ length: 7 }, (_, day) => ({
        day,
        dayName: dayNames[day],
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get unique visitors who visited before this week to determine new vs returning
      const visitorQuery = query(
        this.sessionsCollection,
        where('startTime', '<', Timestamp.fromDate(startOfWeek))
      );
      const allVisitorsSnapshot = await getDocs(visitorQuery);
      const existingVisitors = new Set<string>();
      allVisitorsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.uniqueVisitorId) existingVisitors.add(data.uniqueVisitorId);
      });

      const visitorsThisWeek = new Set<string>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const day = data.startTime.toDate().getDay();
        dailyData[day].sessions++;
        
        const visitorId = data.uniqueVisitorId;
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
   * Used for monthly view - shows 4-5 weeks
   */
  async getWeeklyVisitorsForMonth(year: number, month: number): Promise<{ week: number; weekLabel: string; sessions: number; newUsers: number; returningUsers: number }[]> {
    try {
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);
      const weeksInMonth = Math.ceil((endOfMonth.getDate() + startOfMonth.getDay()) / 7);

      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(startOfMonth)),
        where('startTime', '<=', Timestamp.fromDate(endOfMonth)),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      
      // Initialize weeks
      const weeklyData = Array.from({ length: weeksInMonth }, (_, week) => ({
        week,
        weekLabel: `Week ${week + 1}`,
        sessions: 0,
        newUsers: 0,
        returningUsers: 0,
      }));

      // Get unique visitors who visited before this month to determine new vs returning
      const visitorQuery = query(
        this.sessionsCollection,
        where('startTime', '<', Timestamp.fromDate(startOfMonth))
      );
      const allVisitorsSnapshot = await getDocs(visitorQuery);
      const existingVisitors = new Set<string>();
      allVisitorsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.uniqueVisitorId) existingVisitors.add(data.uniqueVisitorId);
      });

      const visitorsThisMonth = new Set<string>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const sessionDate = data.startTime.toDate();
        const dayOfMonth = sessionDate.getDate();
        const week = Math.floor((dayOfMonth + startOfMonth.getDay() - 1) / 7);
        
        if (weeklyData[week]) {
          weeklyData[week].sessions++;
          
          const visitorId = data.uniqueVisitorId;
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

      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(startDate)),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
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

      snapshot.forEach((doc) => {
        const data = doc.data();
        const date = data.startTime.toDate();
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

        dataByDate[dateKey].sessions.push(data);

        if (data.isAuthenticated) {
          dataByDate[dateKey].authenticated++;
          if (data.userId) dataByDate[dateKey].uniqueAuthUsers.add(data.userId);
        } else {
          dataByDate[dateKey].unauthenticated++;
          if (data.uniqueVisitorId) dataByDate[dateKey].uniqueUnauthUsers.add(data.uniqueVisitorId);
        }

        if (data.duration) {
          dataByDate[dateKey].totalDuration += data.duration;
          dataByDate[dateKey].count++;
        }
      });

      // Check for new users in each period - OPTIMIZED: Use batched queries instead of N+1
      // First, collect all unique visitor IDs across all periods
      const allVisitorIds = new Set<string>();
      for (const [dateKey, stats] of Object.entries(dataByDate)) {
        for (const session of stats.sessions) {
          if (session.uniqueVisitorId) {
            allVisitorIds.add(session.uniqueVisitorId);
          }
        }
      }

      // Fetch all visitor first sessions in batched queries
      const visitorFirstSessions = new Map<string, Date>();
      const allVisitorIdsArray = Array.from(allVisitorIds);
      
      if (allVisitorIdsArray.length > 0) {
        const BATCH_SIZE = 30;
        for (let i = 0; i < allVisitorIdsArray.length; i += BATCH_SIZE) {
          const batch = allVisitorIdsArray.slice(i, i + BATCH_SIZE);
          const batchQuery = query(
            this.sessionsCollection,
            where('uniqueVisitorId', 'in', batch),
            orderBy('startTime', 'asc')
          );
          
          try {
            const batchSnapshot = await getDocs(batchQuery);
            batchSnapshot.forEach((doc) => {
              const data = doc.data();
              const vid = data.uniqueVisitorId;
              if (vid && !visitorFirstSessions.has(vid)) {
                visitorFirstSessions.set(vid, data.startTime.toDate());
              }
            });
          } catch (e) {
            // Handle potential query errors gracefully
            console.warn('Analytics: Batch query error:', e);
          }
        }
      }

      // Now determine new vs returning users using the batched data
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
          const visitorId = session.uniqueVisitorId;
          
          // Only check once per unique visitor
          if (visitorId && !processedVisitors.has(visitorId)) {
            processedVisitors.add(visitorId);
            
            // Use pre-fetched data instead of making N+1 queries
            const firstSession = visitorFirstSessions.get(visitorId);
            if (firstSession) {
              const isNew = firstSession >= periodStart && firstSession < periodEnd;
              
              if (isNew) {
                if (session.isAuthenticated && session.userId) {
                  stats.newAuthUsers.add(session.userId);
                } else if (session.uniqueVisitorId) {
                  stats.newUnauthUsers.add(session.uniqueVisitorId);
                }
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

      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(today)),
        where('startTime', '<', Timestamp.fromDate(tomorrow)),
        orderBy('startTime', 'asc')
      );

      const snapshot = await getDocs(q);
      
      const newAuthUsers = new Set<string>();
      const newUnauthUsers = new Set<string>();
      const returningAuthUsers = new Set<string>();
      const returningUnauthUsers = new Set<string>();
      
      let totalDuration = 0;
      let sessionsWithDuration = 0;

      // OPTIMIZATION: Pre-fetch all visitor first sessions in batched queries
      // instead of making N+1 queries
      const allVisitorIds = new Set<string>();
      snapshot.forEach((doc) => {
        const vid = doc.data().uniqueVisitorId;
        if (vid) allVisitorIds.add(vid);
      });

      const visitorFirstSessions = new Map<string, Date>();
      const allVisitorIdsArray = Array.from(allVisitorIds);
      
      if (allVisitorIdsArray.length > 0) {
        const BATCH_SIZE = 30;
        for (let i = 0; i < allVisitorIdsArray.length; i += BATCH_SIZE) {
          const batch = allVisitorIdsArray.slice(i, i + BATCH_SIZE);
          const batchQuery = query(
            this.sessionsCollection,
            where('uniqueVisitorId', 'in', batch),
            orderBy('startTime', 'asc')
          );
          
          try {
            const batchSnapshot = await getDocs(batchQuery);
            batchSnapshot.forEach((doc) => {
              const data = doc.data();
              const vid = data.uniqueVisitorId;
              if (vid && !visitorFirstSessions.has(vid)) {
                visitorFirstSessions.set(vid, data.startTime.toDate());
              }
            });
          } catch (e) {
            console.warn('Analytics: Batch query error:', e);
          }
        }
      }

      // Process each session using pre-fetched data
      const processedVisitors = new Set<string>();
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const visitorId = data.uniqueVisitorId;
        
        // Track duration
        if (data.duration) {
          totalDuration += data.duration;
          sessionsWithDuration++;
        }
        
        // Check if new or returning (only once per visitor)
        if (visitorId && !processedVisitors.has(visitorId)) {
          processedVisitors.add(visitorId);
          
          // Use pre-fetched data instead of N+1 query
          const firstSession = visitorFirstSessions.get(visitorId);
          const isNew = firstSession && firstSession >= today && firstSession < tomorrow;
          
          if (isNew) {
            // New user today
            if (data.isAuthenticated && data.userId) {
              newAuthUsers.add(data.userId);
            } else if (data.uniqueVisitorId) {
              newUnauthUsers.add(data.uniqueVisitorId);
            }
          } else {
            // Returning user
            if (data.isAuthenticated && data.userId) {
              returningAuthUsers.add(data.userId);
            } else if (data.uniqueVisitorId) {
              returningUnauthUsers.add(data.uniqueVisitorId);
            }
          }
        }
      }

      return {
        totalSessions: snapshot.size,
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

      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(today)),
        where('startTime', '<', Timestamp.fromDate(tomorrow)),
        orderBy('startTime', 'desc'),
        limit(500) // Limit to 500 most recent sessions for performance
      );

      const snapshot = await getDocs(q);
      const visitorMap = new Map<string, UserVisitData>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const visitorId = data.uniqueVisitorId;

        if (visitorMap.has(visitorId)) {
          const existing = visitorMap.get(visitorId)!;
          existing.visitCount++;
          existing.lastVisit = data.startTime.toDate();
        } else {
          visitorMap.set(visitorId, {
            uniqueVisitorId: visitorId,
            userId: data.userId || null,
            isAuthenticated: data.isAuthenticated,
            visitCount: 1,
            lastVisit: data.startTime.toDate(),
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
      const q = query(
        this.sessionsCollection,
        where('isAuthenticated', '==', false)
      );

      const snapshot = await getDocs(q);
      const visitorMap = new Map<string, UserVisitData>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const visitorId = data.uniqueVisitorId;

        if (!visitorMap.has(visitorId)) {
          visitorMap.set(visitorId, {
            uniqueVisitorId: visitorId,
            userId: data.userId || null,
            isAuthenticated: false,
            visitCount: 1,
            lastVisit: data.startTime.toDate(),
          });
        } else {
          const existing = visitorMap.get(visitorId)!;
          existing.visitCount++;
          existing.lastVisit = data.startTime.toDate();
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
