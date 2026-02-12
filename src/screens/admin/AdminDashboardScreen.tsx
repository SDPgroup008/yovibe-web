import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import AnalyticsService, { AnalyticsSummary, TrendData, UserVisitData, TodaySummary } from '../../services/AnalyticsService';
import NotificationService from '../../services/NotificationService';
import type { NotificationAnalytics, DailyNotificationStats } from '../../models/Notification';

type AdminDashboardScreenProps = NativeStackScreenProps<ProfileStackParamList, 'AdminDashboard'>;

const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [frequentVisitors, setFrequentVisitors] = useState<UserVisitData[]>([]);
  const [notificationAnalytics, setNotificationAnalytics] = useState<NotificationAnalytics[]>([]);
  const [dailyNotificationStats, setDailyNotificationStats] = useState<DailyNotificationStats[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'yearly'>('daily');
  const [activeTab, setActiveTab] = useState<'overview' | 'visitors' | 'notifications'>('overview');
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  const loadAnalytics = async (force: boolean = false) => {
    // Check cache - if data was fetched recently, skip (unless forced)
    const now = Date.now();
    if (!force && now - lastFetchTime < CACHE_DURATION && summary !== null) {
      console.log('Using cached analytics data');
      return;
    }

    setLoading(true);
    setRefreshing(true);
    try {
      // Parallelize all data fetching for faster loading
      const limit = selectedPeriod === 'daily' ? 30 : selectedPeriod === 'weekly' ? 12 : 12;
      
      const [todayData, summaryData, trends, visitors, notifAnalytics, dailyStats] = await Promise.all([
        AnalyticsService.getTodaySummary(),
        AnalyticsService.getAnalyticsSummary(),
        AnalyticsService.getTrendData(selectedPeriod, limit),
        AnalyticsService.getFrequentVisitorsToday(),
        NotificationService.getAllNotificationAnalytics(),
        NotificationService.getDailyNotificationStats(30),
      ]);

      setTodaySummary(todayData);
      setSummary(summaryData);
      setTrendData(trends);
      setFrequentVisitors(visitors);
      setNotificationAnalytics(notifAnalytics);
      setDailyNotificationStats(dailyStats);
      setLastFetchTime(now);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    await loadAnalytics(true); // Force refresh
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

            {/* Session line - connecting lines between points */}
            {sessionPoints.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = sessionPoints[index - 1];
              const lineWidth = Math.sqrt(
                Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2)
              );
              const angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x) * (180 / Math.PI);
              
              return (
                <View
                  key={`session-line-${index}`}
                  style={[
                    styles.connectingLine,
                    styles.sessionLine,
                    {
                      width: lineWidth,
                      left: prevPoint.x,
                      top: prevPoint.y,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}

            {/* New User line */}
            {newUserPoints.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = newUserPoints[index - 1];
              const lineWidth = Math.sqrt(
                Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2)
              );
              const angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x) * (180 / Math.PI);
              
              return (
                <View
                  key={`new-line-${index}`}
                  style={[
                    styles.connectingLine,
                    styles.newUserLine,
                    {
                      width: lineWidth,
                      left: prevPoint.x,
                      top: prevPoint.y,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}

            {/* Unique User line */}
            {uniqueUserPoints.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = uniqueUserPoints[index - 1];
              const lineWidth = Math.sqrt(
                Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2)
              );
              const angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x) * (180 / Math.PI);
              
              return (
                <View
                  key={`unique-line-${index}`}
                  style={[
                    styles.connectingLine,
                    styles.uniqueUserLine,
                    {
                      width: lineWidth,
                      left: prevPoint.x,
                      top: prevPoint.y,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}

            {/* Data points */}
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
        <ActivityIndicator size="large" color="#00F5FF" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <TouchableOpacity onPress={() => loadAnalytics(true)} style={styles.refreshButton}>
          <Ionicons name={refreshing ? "hourglass" : "refresh"} size={24} color="#00F5FF" />
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons
            name="speedometer-outline"
            size={20}
            color={activeTab === 'overview' ? '#00F5FF' : '#888'}
          />
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'visitors' && styles.tabActive]}
          onPress={() => setActiveTab('visitors')}
        >
          <Ionicons
            name="people-outline"
            size={20}
            color={activeTab === 'visitors' ? '#00F5FF' : '#888'}
          />
          <Text style={[styles.tabText, activeTab === 'visitors' && styles.tabTextActive]}>
            Visitors
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'notifications' && styles.tabActive]}
          onPress={() => setActiveTab('notifications')}
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={activeTab === 'notifications' ? '#00F5FF' : '#888'}
          />
          <Text style={[styles.tabText, activeTab === 'notifications' && styles.tabTextActive]}>
            Notifications
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#00F5FF']}
            tintColor="#00F5FF"
          />
        }
      >
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {/* Today's Activity */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="today-outline" size={24} color="#00F5FF" />
                <Text style={styles.sectionTitle}>Today's Activity</Text>
              </View>
              <Text style={styles.sectionSubtext}>
                {todaySummary?.lastUpdated.toLocaleTimeString() || 'N/A'}
              </Text>

              <View style={styles.statsGrid}>
                <View style={[styles.statCard, styles.statCardPrimary]}>
                  <Ionicons name="pulse" size={24} color="#00F5FF" />
                  <Text style={styles.statValue}>{todaySummary?.totalSessions || 0}</Text>
                  <Text style={styles.statLabel}>Sessions</Text>
                </View>

                <View style={[styles.statCard, styles.statCardSuccess]}>
                  <Ionicons name="person-add" size={24} color="#00FF9F" />
                  <Text style={styles.statValue}>{todaySummary?.totalNewUsers || 0}</Text>
                  <Text style={styles.statLabel}>New Users</Text>
                  <View style={styles.statBreakdown}>
                    <Text style={styles.statBreakdownText}>
                      {todaySummary?.newAuthenticatedUsers || 0} Auth
                    </Text>
                    <Text style={styles.statBreakdownDivider}>•</Text>
                    <Text style={styles.statBreakdownText}>
                      {todaySummary?.newUnauthenticatedUsers || 0} Guest
                    </Text>
                  </View>
                </View>

                <View style={[styles.statCard, styles.statCardInfo]}>
                  <Ionicons name="repeat" size={24} color="#FF00FF" />
                  <Text style={styles.statValue}>{todaySummary?.totalReturningUsers || 0}</Text>
                  <Text style={styles.statLabel}>Returning</Text>
                  <View style={styles.statBreakdown}>
                    <Text style={styles.statBreakdownText}>
                      {todaySummary?.returningAuthenticatedUsers || 0} Auth
                    </Text>
                    <Text style={styles.statBreakdownDivider}>•</Text>
                    <Text style={styles.statBreakdownText}>
                      {todaySummary?.returningUnauthenticatedUsers || 0} Guest
                    </Text>
                  </View>
                </View>

                <View style={[styles.statCard, styles.statCardWarning]}>
                  <Ionicons name="time" size={24} color="#FFD700" />
                  <Text style={styles.statValue}>
                    {formatDuration(todaySummary?.averageDuration || 0)}
                  </Text>
                  <Text style={styles.statLabel}>Avg Duration</Text>
                </View>
              </View>
            </View>

            {/* All-Time Stats */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="stats-chart" size={24} color="#00F5FF" />
                <Text style={styles.sectionTitle}>All-Time Statistics</Text>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.metricCard}>
                  <Ionicons name="pulse-outline" size={28} color="#00F5FF" />
                  <Text style={styles.metricValue}>{summary?.totalSessions || 0}</Text>
                  <Text style={styles.metricLabel}>Total Sessions</Text>
                </View>

                <View style={styles.metricCard}>
                  <Ionicons name="people-outline" size={28} color="#FF00FF" />
                  <Text style={styles.metricValue}>{summary?.totalUniqueUsers || 0}</Text>
                  <Text style={styles.metricLabel}>Unique Users</Text>
                </View>

                <View style={styles.metricCard}>
                  <Ionicons name="person-circle-outline" size={28} color="#00FF9F" />
                  <Text style={styles.metricValue}>{summary?.uniqueAuthenticatedUsers || 0}</Text>
                  <Text style={styles.metricLabel}>Auth Users</Text>
                </View>

                <View style={styles.metricCard}>
                  <Ionicons name="person-outline" size={28} color="#FFD700" />
                  <Text style={styles.metricValue}>{summary?.uniqueUnauthenticatedUsers || 0}</Text>
                  <Text style={styles.metricLabel}>Guest Users</Text>
                </View>

                <View style={styles.metricCard}>
                  <Ionicons name="timer-outline" size={28} color="#FF00FF" />
                  <Text style={styles.metricValue}>
                    {formatDuration(summary?.averageDuration || 0)}
                  </Text>
                  <Text style={styles.metricLabel}>Avg Duration</Text>
                </View>

                <View style={styles.metricCard}>
                  <Ionicons name="repeat-outline" size={28} color="#00F5FF" />
                  <Text style={styles.metricValue}>
                    {summary?.averageVisitsPerUser.toFixed(1) || '0.0'}
                  </Text>
                  <Text style={styles.metricLabel}>Avg Visits</Text>
                </View>
              </View>
            </View>

            {/* Recent New Users */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="person-add-outline" size={24} color="#00FF9F" />
                <Text style={styles.sectionTitle}>Recent Growth (30 Days)</Text>
              </View>

              <View style={styles.growthRow}>
                <View style={styles.growthItem}>
                  <Text style={styles.growthValue}>{summary?.totalNewUsers || 0}</Text>
                  <Text style={styles.growthLabel}>Total New</Text>
                </View>
                <View style={styles.growthDivider} />
                <View style={styles.growthItem}>
                  <Text style={[styles.growthValue, { color: '#00F5FF' }]}>
                    {summary?.newAuthenticatedUsers || 0}
                  </Text>
                  <Text style={styles.growthLabel}>Authenticated</Text>
                </View>
                <View style={styles.growthDivider} />
                <View style={styles.growthItem}>
                  <Text style={[styles.growthValue, { color: '#FFD700' }]}>
                    {summary?.newUnauthenticatedUsers || 0}
                  </Text>
                  <Text style={styles.growthLabel}>Guests</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Visitors Tab */}
        {activeTab === 'visitors' && (
          <View style={styles.tabContent}>
            {/* Period Selector */}
            <View style={styles.periodSelector}>
              <TouchableOpacity
                style={[styles.periodButton, selectedPeriod === 'daily' && styles.periodButtonActive]}
                onPress={() => setSelectedPeriod('daily')}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === 'daily' && styles.periodButtonTextActive,
                  ]}
                >
                  Daily
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.periodButton, selectedPeriod === 'weekly' && styles.periodButtonActive]}
                onPress={() => setSelectedPeriod('weekly')}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === 'weekly' && styles.periodButtonTextActive,
                  ]}
                >
                  Weekly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.periodButton, selectedPeriod === 'yearly' && styles.periodButtonActive]}
                onPress={() => setSelectedPeriod('yearly')}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === 'yearly' && styles.periodButtonTextActive,
                  ]}
                >
                  Monthly
                </Text>
              </TouchableOpacity>
            </View>

            {/* Trend Chart */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="trending-up" size={24} color="#00F5FF" />
                <Text style={styles.sectionTitle}>Visitor Trends</Text>
              </View>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#00F5FF' }]} />
                  <Text style={styles.legendText}>Sessions</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#00FF9F' }]} />
                  <Text style={styles.legendText}>New Users</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
                  <Text style={styles.legendText}>Unique Users</Text>
                </View>
              </View>
              {renderLineChart(trendData)}
            </View>

            {/* Session Comparison */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="bar-chart" size={24} color="#FF00FF" />
                <Text style={styles.sectionTitle}>Session Distribution</Text>
              </View>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#00F5FF' }]} />
                  <Text style={styles.legendText}>Authenticated</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} />
                  <Text style={styles.legendText}>Unauthenticated</Text>
                </View>
              </View>
              {renderSimpleChart(trendData)}
            </View>

            {/* Frequent Visitors */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="flame" size={24} color="#FF6B6B" />
                <Text style={styles.sectionTitle}>Today's Top Visitors</Text>
              </View>

              {frequentVisitors.length === 0 ? (
                <Text style={styles.noDataText}>No visitors today yet</Text>
              ) : (
                frequentVisitors.slice(0, 10).map((visitor) => (
                  <View key={visitor.uniqueVisitorId} style={styles.visitorCard}>
                    <View style={styles.visitorRow}>
                      <Ionicons
                        name={visitor.isAuthenticated ? 'person-circle' : 'person-outline'}
                        size={32}
                        color={visitor.isAuthenticated ? '#00F5FF' : '#FFD700'}
                      />
                      <View style={styles.visitorInfo}>
                        <Text style={styles.visitorType}>
                          {visitor.isAuthenticated ? 'Authenticated' : 'Guest'}
                        </Text>
                        <Text style={styles.visitorId} numberOfLines={1}>
                          {visitor.userId || visitor.uniqueVisitorId}
                        </Text>
                        <Text style={styles.visitorTime}>
                          {visitor.lastVisit.toLocaleTimeString()}
                        </Text>
                      </View>
                      <View style={styles.visitorBadge}>
                        <Text style={styles.visitorBadgeCount}>{visitor.visitCount}</Text>
                        <Text style={styles.visitorBadgeLabel}>visits</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <View style={styles.tabContent}>
            {/* Daily Notification Stats */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="calendar-outline" size={24} color="#00F5FF" />
                <Text style={styles.sectionTitle}>Daily Analytics (30 Days)</Text>
              </View>

              {dailyNotificationStats.length === 0 ? (
                <Text style={styles.noDataText}>No daily data available</Text>
              ) : (
                <>
                  <View style={styles.statsGrid}>
                    <View style={styles.notifStatCard}>
                      <Ionicons name="paper-plane" size={24} color="#00F5FF" />
                      <Text style={styles.notifStatValue}>
                        {dailyNotificationStats.reduce((sum, d) => sum + d.notificationsSent, 0)}
                      </Text>
                      <Text style={styles.notifStatLabel}>Total Sent</Text>
                    </View>

                    <View style={styles.notifStatCard}>
                      <Ionicons name="people" size={24} color="#00FF9F" />
                      <Text style={styles.notifStatValue}>
                        {dailyNotificationStats.reduce((sum, d) => sum + d.usersReceived, 0)}
                      </Text>
                      <Text style={styles.notifStatLabel}>Users Reached</Text>
                    </View>

                    <View style={styles.notifStatCard}>
                      <Ionicons name="open" size={24} color="#FF00FF" />
                      <Text style={styles.notifStatValue}>
                        {dailyNotificationStats.reduce((sum, d) => sum + d.notificationsOpened, 0)}
                      </Text>
                      <Text style={styles.notifStatLabel}>Total Opened</Text>
                    </View>

                    <View style={styles.notifStatCard}>
                      <Ionicons name="person-add" size={24} color="#FFD700" />
                      <Text style={styles.notifStatValue}>
                        {dailyNotificationStats.reduce((sum, d) => sum + d.newSubscriptions, 0)}
                      </Text>
                      <Text style={styles.notifStatLabel}>New Subs</Text>
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dailyScroll}>
                    {dailyNotificationStats.slice().reverse().map((dayStat) => (
                      <View key={dayStat.date} style={styles.dailyCard}>
                        <Text style={styles.dailyCardDate}>
                          {new Date(dayStat.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                        <View style={styles.dailyCardStat}>
                          <Ionicons name="paper-plane-outline" size={14} color="#00F5FF" />
                          <Text style={styles.dailyCardText}>{dayStat.notificationsSent}</Text>
                        </View>
                        <View style={styles.dailyCardStat}>
                          <Ionicons name="people-outline" size={14} color="#00FF9F" />
                          <Text style={styles.dailyCardText}>{dayStat.usersReceived}</Text>
                        </View>
                        <View style={styles.dailyCardStat}>
                          <Ionicons name="open-outline" size={14} color="#FF00FF" />
                          <Text style={styles.dailyCardText}>{dayStat.notificationsOpened}</Text>
                        </View>
                        {dayStat.newSubscriptions > 0 && (
                          <View style={styles.dailyCardStat}>
                            <Ionicons name="person-add-outline" size={14} color="#FFD700" />
                            <Text style={[styles.dailyCardText, { color: '#FFD700' }]}>
                              +{dayStat.newSubscriptions}
                            </Text>
                          </View>
                        )}
                        <View style={styles.dailyCardRate}>
                          <Text style={styles.dailyCardRateValue}>{dayStat.openRate.toFixed(1)}%</Text>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>

            {/* Per-Notification Analytics */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="notifications" size={24} color="#FF00FF" />
                <Text style={styles.sectionTitle}>Notification Performance</Text>
              </View>

              {notificationAnalytics.length === 0 ? (
                <Text style={styles.noDataText}>No notification data available</Text>
              ) : (
                <>
                  <View style={styles.statsRow}>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatValue}>
                        {notificationAnalytics.reduce((sum, n) => sum + n.totalSent, 0)}
                      </Text>
                      <Text style={styles.miniStatLabel}>Sent</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatValue}>
                        {notificationAnalytics.reduce((sum, n) => sum + n.totalOpened, 0)}
                      </Text>
                      <Text style={styles.miniStatLabel}>Opened</Text>
                    </View>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatValue}>
                        {(
                          (notificationAnalytics.reduce((sum, n) => sum + n.totalOpened, 0) /
                            Math.max(notificationAnalytics.reduce((sum, n) => sum + n.totalSent, 0), 1)) *
                          100
                        ).toFixed(1)}
                        %
                      </Text>
                      <Text style={styles.miniStatLabel}>Open Rate</Text>
                    </View>
                  </View>

                  {notificationAnalytics.slice(0, 10).map((notification) => (
                    <View key={notification.notificationId} style={styles.notifCard}>
                      <View style={styles.notifCardHeader}>
                        <Text style={styles.notifCardId} numberOfLines={1}>
                          {notification.notificationId}
                        </Text>
                        <Text style={styles.notifCardDate}>
                          {notification.createdAt.toLocaleDateString()}
                        </Text>
                      </View>

                      <View style={styles.notifCardStats}>
                        <View style={styles.notifCardStat}>
                          <Text style={styles.notifCardStatValue}>{notification.totalSent}</Text>
                          <Text style={styles.notifCardStatLabel}>Sent</Text>
                        </View>
                        <View style={styles.notifCardStat}>
                          <Text style={styles.notifCardStatValue}>{notification.totalOpened}</Text>
                          <Text style={styles.notifCardStatLabel}>Opened</Text>
                        </View>
                        <View style={styles.notifCardStat}>
                          <Text style={styles.notifCardStatValue}>{notification.totalRead}</Text>
                          <Text style={styles.notifCardStatLabel}>Read</Text>
                        </View>
                      </View>

                      <View style={styles.notifCardProgress}>
                        <View style={styles.progressRow}>
                          <Text style={styles.progressLabel}>Open Rate</Text>
                          <Text style={styles.progressValue}>{notification.openRate.toFixed(1)}%</Text>
                        </View>
                        <View style={styles.progressBarContainer}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${notification.openRate}%`, backgroundColor: '#00FF9F' },
                            ]}
                          />
                        </View>
                      </View>

                      <View style={styles.notifCardProgress}>
                        <View style={styles.progressRow}>
                          <Text style={styles.progressLabel}>Read Rate</Text>
                          <Text style={styles.progressValue}>{notification.readRate.toFixed(1)}%</Text>
                        </View>
                        <View style={styles.progressBarContainer}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${notification.readRate}%`, backgroundColor: '#00F5FF' },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0F',
  },
  loadingText: {
    color: '#00F5FF',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#0F0F17',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 245, 255, 0.1)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  refreshButton: {
    padding: 8,
  },

  // Tab Navigation
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F0F17',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 245, 255, 0.1)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(0, 245, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.3)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#00F5FF',
  },

  // Tab Content
  tabContent: {
    padding: 16,
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#14141F',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.1)',
    shadowColor: '#00F5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  sectionSubtext: {
    fontSize: 12,
    color: '#888',
    marginTop: -8,
    marginBottom: 16,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  statCardPrimary: {
    backgroundColor: 'rgba(0, 245, 255, 0.05)',
    borderColor: 'rgba(0, 245, 255, 0.2)',
  },
  statCardSuccess: {
    backgroundColor: 'rgba(0, 255, 159, 0.05)',
    borderColor: 'rgba(0, 255, 159, 0.2)',
  },
  statCardInfo: {
    backgroundColor: 'rgba(255, 0, 255, 0.05)',
    borderColor: 'rgba(255, 0, 255, 0.2)',
  },
  statCardWarning: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#AAA',
    textAlign: 'center',
  },
  statBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  statBreakdownText: {
    fontSize: 11,
    color: '#666',
  },
  statBreakdownDivider: {
    fontSize: 11,
    color: '#444',
  },

  // Metric Cards
  metricCard: {
    flex: 1,
    minWidth: 100,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 31, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
  },

  // Growth Section
  growthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
  },
  growthItem: {
    alignItems: 'center',
  },
  growthValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00FF9F',
  },
  growthLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },
  growthDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // Period Selector
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    padding: 4,
    backgroundColor: 'rgba(20, 20, 31, 0.6)',
    borderRadius: 12,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: 'rgba(0, 245, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.3)',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#00F5FF',
  },

  // Chart Legend
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#AAA',
  },

  // Charts (keeping existing chart styles)
  chartScrollView: {
    marginVertical: 8,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    paddingHorizontal: 8,
  },
  barContainer: {
    alignItems: 'center',
    marginHorizontal: 4,
  },
  barWrapper: {
    flexDirection: 'column-reverse',
    alignItems: 'center',
    height: 150,
  },
  bar: {
    width: 20,
    borderRadius: 4,
  },
  authBar: {
    backgroundColor: '#00F5FF',
    marginBottom: 2,
  },
  unauthBar: {
    backgroundColor: '#FFD700',
  },
  barLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  barValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },

  lineChartContainer: {
    paddingHorizontal: 8,
  },
  lineChart: {
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  connectingLine: {
    position: 'absolute',
    height: 2,
    transformOrigin: 'left center',
  },
  sessionLine: {
    backgroundColor: '#00F5FF',
  },
  newUserLine: {
    backgroundColor: '#00FF9F',
  },
  uniqueUserLine: {
    backgroundColor: '#FFD700',
  },
  linePoint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#0A0A0F',
  },
  sessionPoint: {
    backgroundColor: '#00F5FF',
  },
  newUserPoint: {
    backgroundColor: '#00FF9F',
  },
  uniqueUserPoint: {
    backgroundColor: '#FFD700',
  },
  xAxisLabels: {
    position: 'relative',
    height: 30,
    marginTop: 8,
  },
  xAxisLabel: {
    position: 'absolute',
    fontSize: 10,
    color: '#888',
    width: 60,
    textAlign: 'center',
  },

  // Visitor Cards
  visitorCard: {
    backgroundColor: 'rgba(20, 20, 31, 0.6)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  visitorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  visitorInfo: {
    flex: 1,
  },
  visitorType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  visitorId: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  visitorTime: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  visitorBadge: {
    backgroundColor: 'rgba(0, 245, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 245, 255, 0.2)',
  },
  visitorBadgeCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00F5FF',
  },
  visitorBadgeLabel: {
    fontSize: 10,
    color: '#888',
  },

  // Notification Stats
  notifStatCard: {
    flex: 1,
    minWidth: 140,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 31, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  notifStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
  },
  notifStatLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
  },

  // Daily Notification Cards
  dailyScroll: {
    marginTop: 12,
  },
  dailyCard: {
    width: 130,
    backgroundColor: 'rgba(20, 20, 31, 0.6)',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  dailyCardDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  dailyCardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  dailyCardText: {
    fontSize: 12,
    color: '#AAA',
  },
  dailyCardRate: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  dailyCardRateValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00FF9F',
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  miniStat: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(20, 20, 31, 0.4)',
    borderRadius: 8,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00F5FF',
  },
  miniStatLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
  },

  // Notification Performance Cards
  notifCard: {
    backgroundColor: 'rgba(20, 20, 31, 0.6)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  notifCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  notifCardId: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
    flex: 1,
  },
  notifCardDate: {
    fontSize: 11,
    color: '#888',
  },
  notifCardStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  notifCardStat: {
    flex: 1,
    alignItems: 'center',
  },
  notifCardStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  notifCardStatLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
  },
  notifCardProgress: {
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    color: '#AAA',
  },
  progressValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // No Data
  noDataText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default AdminDashboardScreen;
