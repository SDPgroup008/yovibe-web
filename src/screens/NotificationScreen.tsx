import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native"
import { useAuth } from "../contexts/AuthContext"
import NotificationService from "../services/NotificationService"
import type { AppNotification } from "../models/Notification"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { CompositeNavigationProp } from "@react-navigation/native"
import type { EventsStackParamList, ProfileStackParamList } from "../navigation/types"

type NotificationScreenNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<EventsStackParamList>,
  NativeStackNavigationProp<ProfileStackParamList>
>

export default function NotificationScreen() {
  const { user } = useAuth()
  const navigation = useNavigation<NotificationScreenNavigationProp>()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadNotifications()
  }, [user])

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const data = await NotificationService.getUserNotifications(user?.uid)
      setNotifications(data)
    } catch (error) {
      console.error("Error loading notifications:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadNotifications()
    setRefreshing(false)
  }

  const handleNotificationPress = async (notification: AppNotification) => {
    // Mark as opened
    await NotificationService.markAsOpened(notification.id)
    
    // Update local state
    setNotifications(prev =>
      prev.map(n =>
        n.id === notification.id ? { ...n, isRead: true, openedAt: new Date() } : n
      )
    )

    // Navigate based on notification type or deepLink
    if (notification.type === "upcoming_summary") {
      // Navigate to Events screen to show all events
      navigation.navigate("Events")
      return
    }
    
    if (notification.deepLink) {
      // Parse deepLink and navigate
      if (notification.deepLink.startsWith("/events/")) {
        const eventId = notification.deepLink.replace("/events/", "")
        navigation.navigate("EventDetail", { eventId })
      }
    }
  }

  const handleMarkAllRead = async () => {
    await NotificationService.markAllAsRead(user?.uid)
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date() })))
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "event_summary":
        return "📅"
      case "upcoming_summary":
        return "📊"
      case "ticket_purchase":
        return "🎫"
      case "ticket_validation":
        return "✅"
      case "payment_confirmation":
        return "💳"
      case "event_reminder":
        return "⏰"
      case "welcome":
        return "👋"
      default:
        return "🔔"
    }
  }

  const getIconBackgroundColor = (type: string) => {
    switch (type) {
      case "upcoming_summary":
        return "#E3F2FD"
      case "event_summary":
        return "#FFF3E0"
      case "ticket_purchase":
        return "#F3E5F5"
      case "payment_confirmation":
        return "#E8F5E9"
      default:
        return "#FFF3E0"
    }
  }

  const formatTimestamp = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  const renderNotification = ({ item }: { item: AppNotification }) => {
    const isWorkflowSummary = item.type === "upcoming_summary"
    const eventCount = isWorkflowSummary && item.data?.eventIds 
      ? JSON.parse(item.data.eventIds).length 
      : 0
    const summaryMode = item.data?.summaryMode || "week"
    
    return (
      <TouchableOpacity
        style={[styles.notificationCard, !item.isRead && styles.unreadCard]}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={[styles.iconContainer, { backgroundColor: getIconBackgroundColor(item.type) }]}>
          <Text style={styles.icon}>{getNotificationIcon(item.type)}</Text>
        </View>
        <View style={styles.contentContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{item.title}</Text>
            {isWorkflowSummary && (
              <View style={[styles.badge, summaryMode === "today" ? styles.todayBadge : styles.weekBadge]}>
                <Text style={styles.badgeText}>{summaryMode === "today" ? "TODAY" : "THIS WEEK"}</Text>
              </View>
            )}
          </View>
          <Text style={styles.body} numberOfLines={isWorkflowSummary ? 3 : 2}>
            {item.body}
          </Text>
          {isWorkflowSummary && eventCount > 0 && (
            <View style={styles.eventCountContainer}>
              <Text style={styles.eventCountText}>📅 {eventCount} event{eventCount !== 1 ? "s" : ""}</Text>
              <Text style={styles.tapToView}>Tap to view all events</Text>
            </View>
          )}
          <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🔔</Text>
      <Text style={styles.emptyText}>No notifications yet</Text>
      <Text style={styles.emptySubtext}>
        You'll receive notifications about events, tickets, and more
      </Text>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    )
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Text style={styles.unreadBannerText}>
            {unreadCount} unread notification{unreadCount > 1 ? "s" : ""}
          </Text>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#FF6B6B"]}
          />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FF6B6B",
    borderRadius: 16,
  },
  markAllText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  unreadBanner: {
    backgroundColor: "#FFF3E0",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#FFE0B2",
  },
  unreadBannerText: {
    color: "#E65100",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  listContent: {
    paddingVertical: 8,
  },
  notificationCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  unreadCard: {
    backgroundColor: "#F8F9FF",
    borderLeftWidth: 4,
    borderLeftColor: "#FF6B6B",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  todayBadge: {
    backgroundColor: "#FF6B6B",
  },
  weekBadge: {
    backgroundColor: "#2196F3",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  eventCountContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  eventCountText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2196F3",
    marginBottom: 2,
  },
  tapToView: {
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
  },
  icon: {
    fontSize: 24,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF6B6B",
    marginLeft: 8,
    alignSelf: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingHorizontal: 32,
  },
})
