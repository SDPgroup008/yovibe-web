import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import AnalyticsService, { AnalyticsSummary, TrendData, UserVisitData, TodaySummary } from '../../services/AnalyticsService';

type AdminDashboardScreenProps = NativeStackScreenProps<ProfileStackParamList, 'AdminDashboard'>;

const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [frequentVisitors, setFrequentVisitors] = useState<UserVisitData[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'yearly'>('daily');

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Get today's summary
      const todayData = await AnalyticsService.getTodaySummary();
      setTodaySummary(todayData);
      
      // Get summary for last 30 days
      const summaryData = await AnalyticsService.getAnalyticsSummary();
      setSummary(summaryData);

      // Get trend data
      const limit = selectedPeriod === 'daily' ? 30 : selectedPeriod === 'weekly' ? 12 : 12;
      const trends = await AnalyticsService.getTrendData(selectedPeriod, limit);
      setTrendData(trends);
      
      // Get frequent visitors today
      const visitors = await AnalyticsService.getFrequentVisitorsToday();
      setFrequentVisitors(visitors);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (selectedPeriod === 'daily') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (selectedPeriod === 'weekly') {
      return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    }
  };

  const renderSimpleChart = (data: TrendData[]) => {
    if (data.length === 0) return null;

    const maxSessions = Math.max(...data.map(d => d.totalSessions), 1);
    const chartWidth = Dimensions.get('window').width - 64;
    const barWidth = Math.max(chartWidth / data.length - 8, 20);

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScrollView}>
        <View style={styles.chartContainer}>
          {data.map((item, index) => {
            const authHeight = (item.authenticatedSessions / maxSessions) * 150;
            const unauthHeight = (item.unauthenticatedSessions / maxSessions) * 150;

            return (
              <View key={index} style={[styles.barContainer, { width: barWidth }]}>
                <View style={styles.barWrapper}>
                  <View style={[styles.bar, styles.authBar, { height: authHeight }]} />
                  <View style={[styles.bar, styles.unauthBar, { height: unauthHeight }]} />
                </View>
                <Text style={styles.barLabel} numberOfLines={1}>
                  {formatDate(item.date)}
                </Text>
                <Text style={styles.barValue}>{item.totalSessions}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderLineChart = (data: TrendData[]) => {
    if (data.length === 0) return null;

    const maxValue = Math.max(
      ...data.map(d => Math.max(d.totalSessions, d.totalNewUsers, d.totalUniqueUsers)),
      1
    );
    const chartWidth = Dimensions.get('window').width - 64;
    const chartHeight = 200;
    const pointSpacing = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth / 2;

    // Calculate points for each line
    const sessionPoints = data.map((item, index) => ({
      x: index * pointSpacing,
      y: chartHeight - (item.totalSessions / maxValue) * chartHeight,
      value: item.totalSessions,
    }));

    const newUserPoints = data.map((item, index) => ({
      x: index * pointSpacing,
      y: chartHeight - (item.totalNewUsers / maxValue) * chartHeight,
      value: item.totalNewUsers,
    }));

    const uniqueUserPoints = data.map((item, index) => ({
      x: index * pointSpacing,
      y: chartHeight - (item.totalUniqueUsers / maxValue) * chartHeight,
      value: item.totalUniqueUsers,
    }));

    // Create SVG path for lines
    const createPath = (points: typeof sessionPoints) => {
      if (points.length === 0) return '';
      let path = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`;
      }
      return path;
    };

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScrollView}>
        <View style={[styles.lineChartContainer, { width: Math.max(chartWidth, data.length * 60) }]}>
          <View style={[styles.lineChart, { height: chartHeight }]}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <View
                key={i}
                style={[
                  styles.gridLine,
                  { bottom: ratio * chartHeight, width: Math.max(chartWidth, data.length * 60) },
                ]}
              />
            ))}

            {/* Data points and lines */}
            {sessionPoints.map((point, index) => (
              <View key={`session-${index}`}>
                <View
                  style={[
                    styles.linePoint,
                    styles.sessionPoint,
                    { left: point.x - 4, top: point.y - 4 },
                  ]}
                />
              </View>
            ))}

            {newUserPoints.map((point, index) => (
              <View key={`new-${index}`}>
                <View
                  style={[
                    styles.linePoint,
                    styles.newUserPoint,
                    { left: point.x - 4, top: point.y - 4 },
                  ]}
                />
              </View>
            ))}

            {uniqueUserPoints.map((point, index) => (
              <View key={`unique-${index}`}>
                <View
                  style={[
                    styles.linePoint,
                    styles.uniqueUserPoint,
                    { left: point.x - 4, top: point.y - 4 },
                  ]}
                />
              </View>
            ))}
          </View>

          {/* X-axis labels */}
          <View style={styles.xAxisLabels}>
            {data.map((item, index) => (
              <Text
                key={index}
                style={[styles.xAxisLabel, { left: index * pointSpacing - 30 }]}
                numberOfLines={1}
              >
                {formatDate(item.date)}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics Dashboard</Text>
        <TouchableOpacity onPress={loadAnalytics} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* TODAY'S SUMMARY - Refreshes Daily */}
      <View style={styles.todaySection}>
        <View style={styles.todayHeader}>
          <Ionicons name="today" size={24} color="#4CAF50" />
          <Text style={styles.todayTitle}>Today's Activity</Text>
          <Text style={styles.todayTimestamp}>
            Updated: {todaySummary?.lastUpdated.toLocaleTimeString() || 'N/A'}
          </Text>
        </View>

        <View style={styles.todayGrid}>
          {/* Total Sessions Today */}
          <View style={[styles.todayCard, styles.todayCardPrimary]}>
            <Text style={styles.todayCardValue}>{todaySummary?.totalSessions || 0}</Text>
            <Text style={styles.todayCardLabel}>Total Sessions</Text>
          </View>

          {/* New Users Today */}
          <View style={[styles.todayCard, styles.todayCardSuccess]}>
            <Text style={styles.todayCardValue}>{todaySummary?.totalNewUsers || 0}</Text>
            <Text style={styles.todayCardLabel}>New Users</Text>
            <View style={styles.todayCardBreakdown}>
              <Text style={styles.todayCardBreakdownText}>
                🔐 {todaySummary?.newAuthenticatedUsers || 0} Auth
              </Text>
              <Text style={styles.todayCardBreakdownText}>
                👤 {todaySummary?.newUnauthenticatedUsers || 0} Guest
              </Text>
            </View>
          </View>

          {/* Returning Users Today */}
          <View style={[styles.todayCard, styles.todayCardInfo]}>
            <Text style={styles.todayCardValue}>{todaySummary?.totalReturningUsers || 0}</Text>
            <Text style={styles.todayCardLabel}>Returning Users</Text>
            <View style={styles.todayCardBreakdown}>
              <Text style={styles.todayCardBreakdownText}>
                🔐 {todaySummary?.returningAuthenticatedUsers || 0} Auth
              </Text>
              <Text style={styles.todayCardBreakdownText}>
                👤 {todaySummary?.returningUnauthenticatedUsers || 0} Guest
              </Text>
            </View>
          </View>

          {/* Average Duration Today */}
          <View style={[styles.todayCard, styles.todayCardWarning]}>
            <Text style={styles.todayCardValue}>
              {formatDuration(todaySummary?.averageDuration || 0)}
            </Text>
            <Text style={styles.todayCardLabel}>Avg. Duration</Text>
          </View>
        </View>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Ionicons name="people" size={32} color="#4CAF50" />
          <Text style={styles.summaryValue}>{summary?.totalSessions || 0}</Text>
          <Text style={styles.summaryLabel}>Total Sessions</Text>
          <Text style={styles.summarySubtext}>All time</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="people" size={32} color="#9C27B0" />
          <Text style={styles.summaryValue}>{summary?.totalUniqueUsers || 0}</Text>
          <Text style={styles.summaryLabel}>Unique Users</Text>
          <Text style={styles.summarySubtext}>All visitors</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="person-circle" size={32} color="#2196F3" />
          <Text style={styles.summaryValue}>{summary?.uniqueAuthenticatedUsers || 0}</Text>
          <Text style={styles.summaryLabel}>Unique Auth</Text>
          <Text style={styles.summarySubtext}>Users</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="person-outline" size={32} color="#FF9800" />
          <Text style={styles.summaryValue}>{summary?.uniqueUnauthenticatedUsers || 0}</Text>
          <Text style={styles.summaryLabel}>Unique Guests</Text>
          <Text style={styles.summarySubtext}>Visitors</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="time" size={32} color="#9C27B0" />
          <Text style={styles.summaryValue}>
            {formatDuration(summary?.averageDuration || 0)}
          </Text>
          <Text style={styles.summaryLabel}>Avg. Duration</Text>
          <Text style={styles.summarySubtext}>Per session</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="repeat" size={32} color="#E91E63" />
          <Text style={styles.summaryValue}>
            {summary?.averageVisitsPerUser.toFixed(1) || '0.0'}
          </Text>
          <Text style={styles.summaryLabel}>Avg. Visits</Text>
          <Text style={styles.summarySubtext}>Per user</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="person-add" size={32} color="#4CAF50" />
          <Text style={styles.summaryValue}>{summary?.totalNewUsers || 0}</Text>
          <Text style={styles.summaryLabel}>New Users</Text>
          <Text style={styles.summarySubtext}>Last 30 days</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="person-add" size={32} color="#2196F3" />
          <Text style={styles.summaryValue}>{summary?.newAuthenticatedUsers || 0}</Text>
          <Text style={styles.summaryLabel}>New Auth</Text>
          <Text style={styles.summarySubtext}>Users</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="person-add-outline" size={32} color="#FF9800" />
          <Text style={styles.summaryValue}>{summary?.newUnauthenticatedUsers || 0}</Text>
          <Text style={styles.summaryLabel}>New Guests</Text>
          <Text style={styles.summarySubtext}>Visitors</Text>
        </View>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'daily' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('daily')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'daily' && styles.periodButtonTextActive]}>
            Daily
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'weekly' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('weekly')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'weekly' && styles.periodButtonTextActive]}>
            Weekly
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'yearly' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('yearly')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'yearly' && styles.periodButtonTextActive]}>
            Monthly
          </Text>
        </TouchableOpacity>
      </View>

      {/* Line Chart for Trends */}
      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Trend Analysis - Line Chart</Text>
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
            <Text style={styles.legendText}>Total Sessions</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.legendText}>New Users</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} />
            <Text style={styles.legendText}>Unique Users</Text>
          </View>
        </View>
        {renderLineChart(trendData)}
      </View>

      {/* Bar Chart for Session Comparison */}
      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Session Comparison - Bar Chart</Text>
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
            <Text style={styles.legendText}>Authenticated</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} />
            <Text style={styles.legendText}>Unauthenticated</Text>
          </View>
        </View>
        {renderSimpleChart(trendData)}
      </View>

      {/* Frequent Visitors Today */}
      <View style={styles.frequentVisitorsSection}>
        <Text style={styles.sectionTitle}>Today's Frequent Visitors</Text>
        {frequentVisitors.length === 0 ? (
          <Text style={styles.noDataText}>No visitors today yet</Text>
        ) : (
          frequentVisitors.slice(0, 10).map((visitor, index) => (
            <View key={visitor.uniqueVisitorId} style={styles.visitorCard}>
              <View style={styles.visitorHeader}>
                <Ionicons
                  name={visitor.isAuthenticated ? 'person-circle' : 'person-outline'}
                  size={24}
                  color={visitor.isAuthenticated ? '#2196F3' : '#FF9800'}
                />
                <View style={styles.visitorInfo}>
                  <Text style={styles.visitorType}>
                    {visitor.isAuthenticated ? 'Authenticated User' : 'Guest Visitor'}
                  </Text>
                  <Text style={styles.visitorId} numberOfLines={1}>
                    {visitor.userId || visitor.uniqueVisitorId}
                  </Text>
                </View>
                <View style={styles.visitBadge}>
                  <Text style={styles.visitBadgeText}>{visitor.visitCount}</Text>
                  <Text style={styles.visitBadgeLabel}>
                    {visitor.visitCount === 1 ? 'visit' : 'visits'}
                  </Text>
                </View>
              </View>
              <Text style={styles.lastVisit}>
                Last visit: {visitor.lastVisit.toLocaleTimeString()}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Chart */}
      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Visitor Trends</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#2196F3' }]} />
            <Text style={styles.legendText}>Authenticated</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#FF9800' }]} />
            <Text style={styles.legendText}>Unauthenticated</Text>
          </View>
        </View>
        {renderSimpleChart(trendData)}
      </View>

      {/* Detailed Stats */}
      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Detailed Statistics</Text>
        {trendData.slice().reverse().slice(0, 10).map((item, index) => (
          <View key={index} style={styles.detailCard}>
            <Text style={styles.detailDate}>{formatDate(item.date)}</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total Sessions:</Text>
              <Text style={styles.detailValue}>{item.totalSessions}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Authenticated:</Text>
              <Text style={[styles.detailValue, { color: '#2196F3' }]}>
                {item.authenticatedSessions}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Unauthenticated:</Text>
              <Text style={[styles.detailValue, { color: '#FF9800' }]}>
                {item.unauthenticatedSessions}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Avg. Duration:</Text>
              <Text style={styles.detailValue}>{formatDuration(item.averageDuration)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>New Users:</Text>
              <Text style={[styles.detailValue, { color: '#4CAF50' }]}>
                {item.totalNewUsers || 0}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#1E1E1E',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  refreshButton: {
    padding: 8,
  },
  todaySection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  todayTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
    flex: 1,
  },
  todayTimestamp: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  todayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  todayCard: {
    flex: 1,
    minWidth: 150,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  todayCardPrimary: {
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
    borderColor: '#2196F3',
    borderWidth: 1,
  },
  todayCardSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: '#4CAF50',
    borderWidth: 1,
  },
  todayCardInfo: {
    backgroundColor: 'rgba(156, 39, 176, 0.15)',
    borderColor: '#9C27B0',
    borderWidth: 1,
  },
  todayCardWarning: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderColor: '#FF9800',
    borderWidth: 1,
  },
  todayCardValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  todayCardLabel: {
    fontSize: 14,
    color: '#AAAAAA',
    textAlign: 'center',
  },
  todayCardBreakdown: {
    marginTop: 8,
    gap: 4,
  },
  todayCardBreakdownText: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  summaryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    justifyContent: 'space-between',
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#AAAAAA',
    marginTop: 4,
  },
  summarySubtext: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#2196F3',
  },
  periodButtonText: {
    color: '#AAAAAA',
    fontSize: 14,
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  chartSection: {
    padding: 16,
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  chartScrollView: {
    marginTop: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 16,
    gap: 8,
  },
  barContainer: {
    alignItems: 'center',
    gap: 4,
  },
  barWrapper: {
    height: 150,
    justifyContent: 'flex-end',
    gap: 2,
  },
  bar: {
    borderRadius: 4,
    minHeight: 2,
  },
  authBar: {
    backgroundColor: '#2196F3',
  },
  unauthBar: {
    backgroundColor: '#FF9800',
  },
  barLabel: {
    color: '#AAAAAA',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  barValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  lineChartContainer: {
    padding: 16,
  },
  lineChart: {
    position: 'relative',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 16,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    height: 1,
    backgroundColor: '#333333',
  },
  linePoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  sessionPoint: {
    backgroundColor: '#2196F3',
  },
  newUserPoint: {
    backgroundColor: '#4CAF50',
  },
  uniqueUserPoint: {
    backgroundColor: '#FF9800',
  },
  xAxisLabels: {
    position: 'relative',
    height: 40,
    marginTop: 8,
  },
  xAxisLabel: {
    position: 'absolute',
    fontSize: 10,
    color: '#AAAAAA',
    width: 60,
    textAlign: 'center',
  },
  chartSection: {
    marginBottom: 24,
    padding: 16,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  detailsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  detailCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  detailDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    color: '#AAAAAA',
    fontSize: 14,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  frequentVisitorsSection: {
    padding: 16,
    marginBottom: 16,
  },
  noDataText: {
    color: '#AAAAAA',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  visitorCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  visitorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  visitorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  visitorType: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  visitorId: {
    color: '#AAAAAA',
    fontSize: 12,
    marginTop: 2,
  },
  visitBadge: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  visitBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  visitBadgeLabel: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  lastVisit: {
    color: '#666666',
    fontSize: 12,
    marginTop: 4,
  },
});

export default AdminDashboardScreen;
