import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
  Dimensions, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import AnalyticsService, { AnalyticsSummary, TrendData, UserVisitData, TodaySummary } from '../../services/AnalyticsService';
import NotificationService from '../../services/NotificationService';
import TokenService, { TokenAnalyticsSummary, DailyTokenStats } from '../../services/TokenService';

type AdminDashboardScreenProps = NativeStackScreenProps<ProfileStackParamList, 'AdminDashboard'>;

/* ── Dev log wrapper ──────────────────────────────────────────────── */
const devLog = (..._args: any[]) => { if (__DEV__) { /* logging disabled for production safety */ } }

/* ── Helpers ───────────────────────────────────────────────────────── */
const escapeCsvValue = (v: string | number) => {
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

const fmt = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
};

const fmtDuration = (s: number): string => {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const dir = (val: number, ref: number): { arrow: string; pct: string; color: string } | null => {
  if (ref === 0) return null;
  const diff = val - ref;
  const pct = Math.abs(Math.round((diff / ref) * 100));
  if (diff > 0) return { arrow: '↑', pct: `${pct}%`, color: '#4CAF50' };
  if (diff < 0) return { arrow: '↓', pct: `${pct}%`, color: '#FF6B6B' };
  return { arrow: '→', pct: '0%', color: '#888' };
};

/* ── Bar Chart Component ──────────────────────────────────────────── */
interface BarItem { label: string; primary: number; secondary?: number }

const BarChart: React.FC<{ data: BarItem[]; height?: number; barWidth?: number; stacked?: boolean; color?: string; secondaryColor?: string }> = ({
  data, height = 100, barWidth: bw, stacked, color = '#00D4FF', secondaryColor = '#888',
}) => {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => stacked ? (d.primary + (d.secondary || 0)) : d.primary), 1);
  const winW = Dimensions.get('window').width - 64;
  const barW = bw ?? Math.max(Math.min(winW / data.length - 6, 40), 20);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 40, gap: 4 }}>
      {data.map((item, i) => {
        const h1 = (item.primary / max) * height;
        const h2 = stacked && item.secondary ? (item.secondary / max) * height : 0;
        return (
          <View key={i} style={{ width: barW, alignItems: 'center' }}>
            {item.secondary != null && !stacked && <Text style={{ color: '#666', fontSize: 9, marginBottom: 1 }}>{item.secondary}</Text>}
            <View style={{ width: barW, height, justifyContent: 'flex-end', alignItems: 'center' }}>
              <View style={{ width: barW - 4, height: Math.max(h1, 2), backgroundColor: color, borderRadius: 3 }} />
              {stacked && item.secondary ? <View style={{ width: barW - 4, height: Math.max(h2, 2), backgroundColor: secondaryColor, borderRadius: 3, marginTop: 1 }} /> : null}
            </View>
            <Text style={{ color: '#666', fontSize: 9, marginTop: 2, textAlign: 'center' }} numberOfLines={1}>{item.label}</Text>
            <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '700' }}>{item.primary}</Text>
          </View>
        );
      })}
    </View>
  );
};

/* ── Cache + deduplication layer ─────────────────────────────────── */
const cache = new Map<string, { data: any; ts: number }>();
const inflight = new Map<string, Promise<any>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return entry.data as T;
}

function cacheSet(key: string, data: any) { cache.set(key, { data, ts: Date.now() }); }

function cacheValid(key: string, ttlMs = 30000): boolean {
  const entry = cache.get(key);
  return !!entry && (Date.now() - entry.ts) < ttlMs;
}

async function dedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/* ── Main Screen ───────────────────────────────────────────────────── */
const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [yesterdaySummary, setYesterdaySummary] = useState<TodaySummary | null>(null);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [prevTrendData, setPrevTrendData] = useState<TrendData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'visitors' | 'notifications' | 'tokens'>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'decade'>('day');
  const [frequentVisitors, setFrequentVisitors] = useState<UserVisitData[]>([]);
  const [notificationData, setNotificationData] = useState<any[]>([]);
  const [dailyNotifStats, setDailyNotifStats] = useState<any[]>([]);
  const [tokenSummary, setTokenSummary] = useState<TokenAnalyticsSummary | null>(null);
  const [dailyTokenStats, setDailyTokenStats] = useState<DailyTokenStats[]>([]);
  const [granularLoading, setGranularLoading] = useState(false);

  // Granular visitor state (kept for period display)
  const [hourlyVisitors, setHourlyVisitors] = useState<any[]>([]);
  const [dailyVisitors, setDailyVisitors] = useState<any[]>([]);
  const [weeklyVisitors, setWeeklyVisitors] = useState<any[]>([]);
  const [monthlyVisitors, setMonthlyVisitors] = useState<any[]>([]);
  const [yearlyVisitors, setYearlyVisitors] = useState<any[]>([]);

  const [topReferrer] = useState('Direct / None');
  const [topDevice] = useState('Mobile');

  /* ── Consolidated data loader with cache + dedupe ────────────────── */
  const loadTab = useCallback(async (tab: string, period: string, force = false) => {
    const overviewKey = `overview_${period}`;
    const granularKey = `granular_${period}`;
    const freqKey = 'frequent_visitors';
    const notifKey = 'notifications';
    const tokenKey = 'tokens';

    // Overview data — stale-while-revalidate
    if (tab === 'overview' || tab === 'all') {
      if (!force && cacheValid(overviewKey, 30000)) {
        // Use cached data, skip refresh
      } else if (!inflight.has(overviewKey)) {
        dedupedFetch(overviewKey, async () => {
          setLoading(true);
          try {
            const trendPeriod = period === 'day' ? 'daily' : period === 'week' ? 'weekly' : 'yearly';
            const limit = period === 'day' ? 14 : period === 'week' ? 12 : period === 'month' ? 12 : period === 'year' ? 12 : 10;
            const [todayData, summaryData, trends] = await Promise.all([
              AnalyticsService.getTodaySummary(),
              AnalyticsService.getAnalyticsSummary(),
              AnalyticsService.getTrendData(trendPeriod as any, limit),
            ]);
            setTodaySummary(todayData);
            setSummary(summaryData);
            setTrendData(trends);
            const mid = Math.floor(trends.length / 2);
            setPrevTrendData(trends.slice(0, mid));
            setLastUpdated(new Date());
            cacheSet(overviewKey, { todayData, summaryData, trends });
          } finally { setLoading(false); setRefreshing(false); }
        });
      }
      // Show cached overview data immediately
      const cached = cacheGet<{ todayData: any; summaryData: any; trends: any[] }>(overviewKey);
      if (cached && !todaySummary) {
        setTodaySummary(cached.todayData);
        setSummary(cached.summaryData);
        setTrendData(cached.trends);
      }
    }

    // Visitors (granular) — stale-while-revalidate
    if (tab === 'visitors' || tab === 'all') {
      if (!force && cacheValid(granularKey, 30000)) {
        // Use cache
      } else if (!inflight.has(granularKey)) {
        dedupedFetch(granularKey, async () => {
          setGranularLoading(true);
          try {
            const now = new Date();
            let h: any[] | null = null, d: any[] | null = null, w: any[] | null = null, m: any[] | null = null, y: any[] | null = null;
            if (period === 'day') h = await AnalyticsService.getHourlyVisitorsForDay(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
            else if (period === 'week') { const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); d = await AnalyticsService.getDailyVisitorsForWeek(ws); }
            else if (period === 'month') w = await AnalyticsService.getWeeklyVisitorsForMonth(now.getFullYear(), now.getMonth());
            else if (period === 'year') m = await AnalyticsService.getMonthlyVisitorsForYear(now.getFullYear());
            else { const ds = Math.floor(now.getFullYear() / 10) * 10; y = await AnalyticsService.getYearlyVisitorsForDecade(ds); }
            if (h) setHourlyVisitors(h);
            if (d) setDailyVisitors(d);
            if (w) setWeeklyVisitors(w);
            if (m) setMonthlyVisitors(m);
            if (y) setYearlyVisitors(y);
            cacheSet(granularKey, { h, d, w, m, y });
          } finally { setGranularLoading(false); }
        });
      }
      const cachedG = cacheGet<{ h: any[] | null; d: any[] | null; w: any[] | null; m: any[] | null; y: any[] | null }>(granularKey);
      if (cachedG) {
        if (cachedG.h) setHourlyVisitors(cachedG.h);
        if (cachedG.d) setDailyVisitors(cachedG.d);
        if (cachedG.w) setWeeklyVisitors(cachedG.w);
        if (cachedG.m) setMonthlyVisitors(cachedG.m);
        if (cachedG.y) setYearlyVisitors(cachedG.y);
      }

      // Frequent visitors (lightweight, always fresh)
      if (!force && cacheValid(freqKey, 60000)) {
        const f = cacheGet<UserVisitData[]>(freqKey);
        if (f) setFrequentVisitors(f);
      } else if (!inflight.has(freqKey)) {
        dedupedFetch(freqKey, async () => {
          const f = await AnalyticsService.getFrequentVisitorsToday().catch(() => []);
          setFrequentVisitors(f);
          cacheSet(freqKey, f);
        });
      }
    }

    // Notifications
    if (tab === 'notifications' || tab === 'all') {
      if (!force && cacheValid(notifKey, 30000)) {
        const n = cacheGet<{ notif: any[]; stats: any[] }>(notifKey);
        if (n) { setNotificationData(n.notif); setDailyNotifStats(n.stats); }
      } else if (!inflight.has(notifKey)) {
        dedupedFetch(notifKey, async () => {
          const [notif, stats] = await Promise.all([
            NotificationService.getAllNotificationDetailedAnalytics(),
            NotificationService.getDailyNotificationStats(30),
          ]).catch(() => [[], []]);
          setNotificationData(notif);
          setDailyNotifStats(stats);
          cacheSet(notifKey, { notif, stats });
        });
      }
    }

    // Tokens
    if (tab === 'tokens' || tab === 'all') {
      if (!force && cacheValid(tokenKey, 30000)) {
        const t = cacheGet<{ summary: any; stats: any[] }>(tokenKey);
        if (t) { setTokenSummary(t.summary); setDailyTokenStats(t.stats); }
      } else if (!inflight.has(tokenKey)) {
        dedupedFetch(tokenKey, async () => {
          const [s, stats] = await Promise.all([
            TokenService.getTokenAnalyticsSummaryWithAuth(),
            TokenService.getDailyTokenStatsWithAuth(7),
          ]).catch(() => [null, []] as [TokenAnalyticsSummary | null, DailyTokenStats[]]);
          setTokenSummary(s);
          setDailyTokenStats(stats);
          cacheSet(tokenKey, { summary: s, stats });
        });
      }
    }
  }, []);

  /* ── Single consolidated effect ──────────────────────────────────── */
  useEffect(() => {
    loadTab(activeTab, selectedPeriod);
  }, [activeTab, selectedPeriod, loadTab]);

  // Pull-to-refresh forces reload of current tab
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadTab(activeTab, selectedPeriod, true).finally(() => setRefreshing(false));
  }, [activeTab, selectedPeriod, loadTab]);

  // Pre-warm visitor cache when on overview tab (idle)
  useEffect(() => {
    if (activeTab === 'overview') {
      const id = setTimeout(() => loadTab('visitors', selectedPeriod), 2000);
      return () => clearTimeout(id);
    }
  }, [activeTab, selectedPeriod, loadTab]);

  /* ── Visitors helpers ────────────────────────────────────────────── */
  const visitorRows = useMemo(() => {
    if (selectedPeriod === 'day') return hourlyVisitors.map((h: any) => ({ bucket: `${String(h.hour).padStart(2, '0')}:00`, sessions: h.sessions, newUsers: h.newUsers, returning: h.returningUsers }));
    if (selectedPeriod === 'week') return dailyVisitors.map((d: any) => ({ bucket: d.dayName, sessions: d.sessions, newUsers: d.newUsers, returning: d.returningUsers }));
    if (selectedPeriod === 'month') return weeklyVisitors.map((w: any) => ({ bucket: w.weekLabel, sessions: w.sessions, newUsers: w.newUsers, returning: w.returningUsers }));
    if (selectedPeriod === 'year') return monthlyVisitors.map((m: any) => ({ bucket: m.monthName, sessions: m.sessions, newUsers: m.newUsers, returning: m.returningUsers }));
    return yearlyVisitors.map((y: any) => ({ bucket: y.yearLabel, sessions: y.sessions, newUsers: y.newUsers, returning: y.returningUsers }));
  }, [selectedPeriod, hourlyVisitors, dailyVisitors, weeklyVisitors, monthlyVisitors, yearlyVisitors]);

  const visitorTotal = useMemo(() => visitorRows.reduce((s, r) => s + r.sessions, 0), [visitorRows]);

  const exportCsv = () => {
    const csv = [['period', 'bucket', 'sessions', 'new_visitors', 'returning_visitors'] as string[],
      ...visitorRows.map(r => [selectedPeriod, r.bucket, r.sessions, r.newUsers, r.returning].map(escapeCsvValue)),
    ].map(row => row.join(',')).join('\n');
    if (typeof document === 'undefined') return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `visitors-${selectedPeriod}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ── Chart data helpers ──────────────────────────────────────────── */
  const barChartData = useMemo((): BarItem[] => {
    if (selectedPeriod === 'day') return hourlyVisitors.map((h: any) => ({ label: `${h.hour}`, primary: h.sessions }));
    if (selectedPeriod === 'week') return dailyVisitors.map((d: any) => ({ label: d.dayName.substring(0, 3), primary: d.sessions }));
    if (selectedPeriod === 'month') return weeklyVisitors.map((w: any) => ({ label: w.weekLabel, primary: w.sessions }));
    if (selectedPeriod === 'year') return monthlyVisitors.map((m: any) => ({ label: m.monthName.substring(0, 3), primary: m.sessions }));
    return yearlyVisitors.map((y: any) => ({ label: y.yearLabel.substring(2), primary: y.sessions }));
  }, [selectedPeriod, hourlyVisitors, dailyVisitors, weeklyVisitors, monthlyVisitors, yearlyVisitors]);

  const trendBars = useMemo((): BarItem[] => trendData.map(d => ({
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    primary: d.totalSessions,
    secondary: d.authenticatedSessions,
  })), [trendData]);

  const prevTrendBars = useMemo((): BarItem[] => prevTrendData.map(d => ({
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    primary: d.totalSessions,
  })), [prevTrendData]);

  const notificationBarData = useMemo((): BarItem[] =>
    dailyNotifStats.slice(-7).map((d: any) => ({
      label: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
      primary: d.sent || 0,
    })), [dailyNotifStats]);

  const tokenBarData = useMemo((): BarItem[] =>
    dailyTokenStats.map(d => ({
      label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      primary: d.newTokens,
    })), [dailyTokenStats]);

  /* ── Metric card component ────────────────────────────────────────── */
  const MetricCard: React.FC<{ icon: string; iconColor: string; value: string | number; label: string; delta?: { arrow: string; pct: string; color: string } | null }> = ({
    icon, iconColor, value, label, delta,
  }) => (
    <View style={st.metricCard}>
      <Ionicons name={icon as any} size={22} color={iconColor} />
      <Text style={st.metricValue}>{fmt(Number(value))}</Text>
      <Text style={st.metricLabel}>{label}</Text>
      {delta && <Text style={[st.deltaArrow, { color: delta.color }]}>{delta.arrow} {delta.pct}</Text>}
    </View>
  );

  /* ── Loading ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <View style={st.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4FF" />
        <Text style={{ color: '#888', marginTop: 12 }}>Loading analytics…</Text>
      </View>
    );
  }

  return (
    <View style={st.container}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={st.header}>
        <View>
          <Text style={st.headerTitle}>Analytics</Text>
          {lastUpdated && <Text style={st.headerSub}>Updated {lastUpdated.toLocaleTimeString()}</Text>}
        </View>
        <TouchableOpacity onPress={handleRefresh} style={st.refreshBtn}>
          <Ionicons name="refresh" size={22} color="#00D4FF" />
        </TouchableOpacity>
      </View>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <View style={st.tabRow}>
        {(['overview', 'visitors', 'notifications', 'tokens'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[st.tab, activeTab === tab && st.tabActive]} onPress={() => setActiveTab(tab)}>
            <Ionicons name={tab === 'overview' ? 'speedometer-outline' : tab === 'visitors' ? 'people-outline' : tab === 'notifications' ? 'notifications-outline' : 'key-outline'} size={18} color={activeTab === tab ? '#00D4FF' : '#666'} />
            <Text style={[st.tabText, activeTab === tab && st.tabTextActive]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#00D4FF" />} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── TAB: Overview ─────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <View style={st.pad}>
            {/* Today's Activity */}
            <View style={st.card}>
              <View style={st.cardHeader}><Ionicons name="today-outline" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Today's Activity</Text></View>
              <View style={st.metricGrid}>
                <MetricCard icon="pulse" iconColor="#00D4FF" value={todaySummary?.totalSessions || 0} label="Sessions"
                  delta={yesterdaySummary ? dir(todaySummary?.totalSessions || 0, yesterdaySummary.totalSessions) : null} />
                <MetricCard icon="person-add" iconColor="#4CAF50" value={todaySummary?.totalNewUsers || 0} label="New Users"
                  delta={yesterdaySummary ? dir(todaySummary?.totalNewUsers || 0, yesterdaySummary.totalNewUsers) : null} />
                <MetricCard icon="repeat" iconColor="#FF00FF" value={todaySummary?.totalReturningUsers || 0} label="Returning"
                  delta={yesterdaySummary ? dir(todaySummary?.totalReturningUsers || 0, yesterdaySummary.totalReturningUsers) : null} />
                <MetricCard icon="time" iconColor="#FFD700" value={fmtDuration(todaySummary?.averageDuration || 0)} label="Avg Duration" />
              </View>
            </View>

            {/* All-Time Stats */}
            <View style={st.card}>
              <View style={st.cardHeader}><Ionicons name="stats-chart" size={20} color="#00D4FF" /><Text style={st.cardTitle}>All-Time Statistics</Text></View>
              <View style={st.metricGrid}>
                <MetricCard icon="pulse-outline" iconColor="#00D4FF" value={summary?.totalSessions || 0} label="Total Sessions" />
                <MetricCard icon="people-outline" iconColor="#FF00FF" value={summary?.totalUniqueUsers || 0} label="Unique Users" />
                <MetricCard icon="person-add-outline" iconColor="#4CAF50" value={summary?.totalNewUsers || 0} label="Total New Users" />
                <MetricCard icon="arrow-up" iconColor="#FFD700" value={summary?.totalUniqueUsers || 0} label="Unique Users" />
              </View>
            </View>

            {/* Sessions Trend */}
            {trendBars.length > 0 && (
              <View style={st.card}>
                <View style={st.cardHeader}><Ionicons name="trending-up" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Sessions Trend</Text></View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart data={trendBars} stacked height={120} color="#00D4FF" secondaryColor="#FF00FF" barWidth={36} />
                </ScrollView>
                {/* Previous period mini-chart */}
                {prevTrendBars.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>Prior Period</Text>
                    <BarChart data={prevTrendBars} height={60} barWidth={24} color="#444" />
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── TAB: Visitors ─────────────────────────────────────────── */}
        {activeTab === 'visitors' && (
          <View style={st.pad}>
            {/* Period Selector */}
            <View style={st.periodRow}>
              {(['day', 'week', 'month', 'year', 'decade'] as const).map(p => (
                <TouchableOpacity key={p} style={[st.periodChip, selectedPeriod === p && st.periodChipActive]} onPress={() => setSelectedPeriod(p)}>
                  <Text style={[st.periodChipText, selectedPeriod === p && st.periodChipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={exportCsv} style={st.exportBtn}><Ionicons name="download-outline" size={18} color="#666" /></TouchableOpacity>
            </View>

            {granularLoading ? <ActivityIndicator color="#00D4FF" style={{ marginVertical: 20 }} /> : (
              <>
                {/* Summary */}
                <View style={st.card}>
                  <View style={st.cardHeader}><Ionicons name="people-outline" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Visitor Summary</Text></View>
                  <View style={st.metricGrid}>
                    <MetricCard icon="pulse" iconColor="#00D4FF" value={visitorTotal} label="Total Sessions" />
                    <MetricCard icon="person-add" iconColor="#4CAF50" value={visitorRows.reduce((s, r) => s + r.newUsers, 0)} label="New Visitors" />
                    <MetricCard icon="repeat" iconColor="#FF00FF" value={visitorRows.reduce((s, r) => s + r.returning, 0)} label="Returning" />
                  </View>

                  {/* Breakdown: Referrer & Device */}
                  <View style={st.breakdownRow}>
                    <View style={st.breakdownCard}><Text style={st.breakdownLabel}>Top Referrer</Text><Text style={st.breakdownValue}>{topReferrer}</Text></View>
                    <View style={st.breakdownCard}><Text style={st.breakdownLabel}>Top Device</Text><Text style={st.breakdownValue}>{topDevice}</Text></View>
                  </View>
                </View>

                {/* Bar Chart */}
                {barChartData.length > 0 && (
                  <View style={st.card}>
                    <View style={st.cardHeader}><Ionicons name="bar-chart" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Visitor Trend</Text></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <BarChart data={barChartData} height={140} color="#00D4FF" />
                    </ScrollView>
                  </View>
                )}

                {/* Table */}
                {visitorRows.length > 0 && (
                  <View style={st.card}>
                    <View style={st.cardHeader}><Ionicons name="list" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Detail</Text></View>
                    <View style={st.tableHeader}>
                      <Text style={[st.thText, { flex: 1 }]}>Period</Text>
                      <Text style={[st.thText, { width: 70, textAlign: 'center' }]}>Sessions</Text>
                      <Text style={[st.thText, { width: 60, textAlign: 'center' }]}>New</Text>
                      <Text style={[st.thText, { width: 60, textAlign: 'center' }]}>Return</Text>
                    </View>
                    {visitorRows.map((r, i) => (
                      <View key={i} style={[st.tableRow, i % 2 === 1 && { backgroundColor: 'rgba(255,255,255,0.02)' }]}>
                        <Text style={[st.tdText, { flex: 1 }]}>{r.bucket}</Text>
                        <Text style={[st.tdText, { width: 70, textAlign: 'center', fontWeight: '700' }]}>{r.sessions}</Text>
                        <Text style={[st.tdText, { width: 60, textAlign: 'center', color: '#4CAF50' }]}>{r.newUsers}</Text>
                        <Text style={[st.tdText, { width: 60, textAlign: 'center', color: '#FF00FF' }]}>{r.returning}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Frequent Visitors */}
                {frequentVisitors.length > 0 && (
                  <View style={st.card}>
                    <View style={st.cardHeader}><Ionicons name="star" size={20} color="#FFD700" /><Text style={st.cardTitle}>Frequent Visitors Today</Text></View>
                    {frequentVisitors.slice(0, 10).map((v, i) => (
                      <View key={i} style={st.frequentRow}>
                        <Text style={{ color: '#FFF', fontSize: 13, flex: 1 }}>{v.uniqueVisitorId?.slice(0, 12) || v.userId?.slice(0, 12) || `Visitor ${i + 1}`}</Text>
                        <Text style={{ color: '#FFD700', fontSize: 12, fontWeight: '700' }}>{v.visitCount} visits</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ── TAB: Notifications ────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <View style={st.pad}>
            {notificationData.length === 0 && dailyNotifStats.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="notifications-off-outline" size={48} color="#333" />
                <Text style={{ color: '#666', marginTop: 12 }}>No notification data yet</Text>
              </View>
            ) : (
              <>
                <View style={st.card}>
                  <View style={st.cardHeader}><Ionicons name="notifications-outline" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Notification Summary</Text></View>
                  <View style={st.metricGrid}>
                    <MetricCard icon="send" iconColor="#00D4FF" value={notificationData.reduce((s: number, n: any) => s + (n.sent || 0), 0)} label="Total Sent" />
                    <MetricCard icon="eye" iconColor="#4CAF50" value={notificationData.reduce((s: number, n: any) => s + (n.opened || 0), 0)} label="Opened" />
                    <MetricCard icon="close-circle" iconColor="#FF6B6B" value={notificationData.reduce((s: number, n: any) => s + (n.failed || 0), 0)} label="Failed" />
                  </View>
                </View>

                {notificationBarData.length > 0 && (
                  <View style={st.card}>
                    <View style={st.cardHeader}><Ionicons name="bar-chart" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Last 7 Days</Text></View>
                    <BarChart data={notificationBarData} height={100} color="#00D4FF" />
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ── TAB: Access Tokens ────────────────────────────────────── */}
        {activeTab === 'tokens' && (
          <View style={st.pad}>
            <View style={st.card}>
              <View style={st.cardHeader}><Ionicons name="key-outline" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Token Summary</Text></View>
              <View style={st.metricGrid}>
                <MetricCard icon="key" iconColor="#00D4FF" value={tokenSummary?.totalTokens || 0} label="Total Tokens" />
                <MetricCard icon="checkmark-circle" iconColor="#4CAF50" value={tokenSummary?.activeTokens || 0} label="Active" />
                <MetricCard icon="time" iconColor="#FFD700" value={tokenSummary?.authenticatedCount || 0} label="Authenticated" />
                <MetricCard icon="remove-circle" iconColor="#FF6B6B" value={tokenSummary?.unauthenticatedCount || 0} label="Expired" />
              </View>
            </View>

            {tokenBarData.length > 0 && (
              <View style={st.card}>
                <View style={st.cardHeader}><Ionicons name="trending-up" size={20} color="#00D4FF" /><Text style={st.cardTitle}>Daily Token Creation</Text></View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <BarChart data={tokenBarData} height={120} barWidth={36} color="#FFD700" />
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 11, color: '#666', marginTop: 2 },
  refreshBtn: { padding: 8 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 4, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#00D4FF' },
  tabText: { color: '#666', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#00D4FF' },
  pad: { paddingHorizontal: 16, paddingTop: 4 },
  card: { backgroundColor: '#13131a', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { flex: 1, minWidth: 80, backgroundColor: '#1a1a2e', borderRadius: 10, padding: 10, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  metricValue: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  metricLabel: { color: '#888', fontSize: 11, textAlign: 'center' },
  deltaArrow: { fontSize: 11, fontWeight: '700' },
  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 12, alignItems: 'center' },
  periodChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#13131a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  periodChipActive: { backgroundColor: 'rgba(0,212,255,0.12)', borderColor: '#00D4FF' },
  periodChipText: { color: '#666', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  periodChipTextActive: { color: '#00D4FF' },
  exportBtn: { padding: 6, marginLeft: 'auto' },
  breakdownRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  breakdownCard: { flex: 1, backgroundColor: '#1a1a2e', borderRadius: 8, padding: 10, alignItems: 'center' },
  breakdownLabel: { color: '#666', fontSize: 11 },
  breakdownValue: { color: '#FFF', fontSize: 13, fontWeight: '700', marginTop: 2 },
  tableHeader: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  thText: { color: '#666', fontSize: 11, fontWeight: '700' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tdText: { color: '#CCC', fontSize: 12 },
  frequentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
});

export default AdminDashboardScreen;
