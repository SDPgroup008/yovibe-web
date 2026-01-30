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
  getDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface SessionData {
  id?: string;
  userId: string | null; // null for unauthenticated users
  isAuthenticated: boolean;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in seconds
  platform: 'web' | 'mobile';
  userAgent?: string;
}

export interface AnalyticsSummary {
  authenticatedUsers: number;
  unauthenticatedUsers: number;
  totalSessions: number;
  averageDuration: number; // in seconds
  totalDuration: number; // in seconds
}

export interface TrendData {
  date: string;
  authenticatedSessions: number;
  unauthenticatedSessions: number;
  totalSessions: number;
  averageDuration: number;
}

class AnalyticsService {
  private sessionsCollection = collection(db, 'analytics_sessions');

  /**
   * Start a new session
   */
  async startSession(userId: string | null, platform: 'web' | 'mobile'): Promise<string> {
    try {
      const sessionData: Omit<SessionData, 'id'> = {
        userId,
        isAuthenticated: !!userId,
        startTime: new Date(),
        platform,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      const docRef = await addDoc(this.sessionsCollection, {
        ...sessionData,
        startTime: Timestamp.fromDate(sessionData.startTime),
      });

      console.log('Analytics: Session started', docRef.id);
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
   * Get analytics summary for a date range
   */
  async getAnalyticsSummary(startDate: Date, endDate: Date): Promise<AnalyticsSummary> {
    try {
      const q = query(
        this.sessionsCollection,
        where('startTime', '>=', Timestamp.fromDate(startDate)),
        where('startTime', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);
      
      let authenticatedCount = 0;
      let unauthenticatedCount = 0;
      let totalDuration = 0;
      let sessionsWithDuration = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.isAuthenticated) {
          authenticatedCount++;
        } else {
          unauthenticatedCount++;
        }

        if (data.duration) {
          totalDuration += data.duration;
          sessionsWithDuration++;
        }
      });

      return {
        authenticatedUsers: authenticatedCount,
        unauthenticatedUsers: unauthenticatedCount,
        totalSessions: snapshot.size,
        totalDuration,
        averageDuration: sessionsWithDuration > 0 ? totalDuration / sessionsWithDuration : 0,
      };
    } catch (error) {
      console.error('Analytics: Error getting summary', error);
      throw error;
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
          };
        }

        if (data.isAuthenticated) {
          dataByDate[dateKey].authenticated++;
        } else {
          dataByDate[dateKey].unauthenticated++;
        }

        if (data.duration) {
          dataByDate[dateKey].totalDuration += data.duration;
          dataByDate[dateKey].count++;
        }
      });

      // Convert to array and sort by date
      return Object.entries(dataByDate)
        .map(([date, stats]) => ({
          date,
          authenticatedSessions: stats.authenticated,
          unauthenticatedSessions: stats.unauthenticated,
          totalSessions: stats.authenticated + stats.unauthenticated,
          averageDuration: stats.count > 0 ? stats.totalDuration / stats.count : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error('Analytics: Error getting trend data', error);
      throw error;
    }
  }
}

export default new AnalyticsService();
