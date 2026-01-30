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
import AnalyticsService, { AnalyticsSummary, TrendData } from '../../services/AnalyticsService';

type AdminDashboardScreenProps = NativeStackScreenProps<ProfileStackParamList, 'AdminDashboard'>;

const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'yearly'>('daily');

  useEffect(() => {
    loadAnalytics();
  }, [selectedPeriod]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Get summary for last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30);

      const summaryData = await AnalyticsService.getAnalyticsSummary(startDate, endDate);
      setSummary(summaryData);

      // Get trend data
      const limit = selectedPeriod === 'daily' ? 30 : selectedPeriod === 'weekly' ? 12 : 12;
      const trends = await AnalyticsService.getTrendData(selectedPeriod, limit);
      setTrendData(trends);
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

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Ionicons name="people" size={32} color="#4CAF50" />
          <Text style={styles.summaryValue}>{summary?.totalSessions || 0}</Text>
          <Text style={styles.summaryLabel}>Total Sessions</Text>
          <Text style={styles.summarySubtext}>Last 30 days</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="person-circle" size={32} color="#2196F3" />
          <Text style={styles.summaryValue}>{summary?.authenticatedUsers || 0}</Text>
          <Text style={styles.summaryLabel}>Authenticated</Text>
          <Text style={styles.summarySubtext}>Users</Text>
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="person-outline" size={32} color="#FF9800" />
          <Text style={styles.summaryValue}>{summary?.unauthenticatedUsers || 0}</Text>
          <Text style={styles.summaryLabel}>Unauthenticated</Text>
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
});

export default AdminDashboardScreen;
