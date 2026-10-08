import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native"
import { useAuth } from "../contexts/AuthContext"
import NotificationService from "../services/NotificationService"
import type { AppNotification, EventSummaryPreview } from "../models/Notification"
import { useCompatNavigation } from "../utils/compatNavigation"
import { useCachedNotifications } from "../hooks/useDataCache"
import { useNotificationsScroll } from "../hooks/useScrollPersistence"
import { ResponsiveSkeleton } from "../components/SkeletonLoader"


export default function NotificationScreen() {
  const { user } = useAuth()
  const navigation = useCompatNavigation()
  const userId = user?.uid
  const { data: notifications, loading, error, refetch } = useCachedNotifications(userId)
  const { scrollRef, onScroll } = useNotificationsScroll()
  const [refreshing, setRefreshing] = useState(false)
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>([])
  const [localLoading, setLocalLoading] = useState(false)

  useEffect(() => {
    const unsubscribe = NotificationService.addNotificationListener(() => {
      refetch()
    })
    return unsubscribe
  }, [refetch])

  const loadNotifications = async () => {
    try {
      setLocalLoading(true)
      const data = await NotificationService.getUserNotifications(user?.uid)
      setLocalNotifications(data)
    } catch (error) {
      console.error("Error loading notifications:", error)
    } finally {
      setLocalLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const handleNotificationPress = async (notification: AppNotification) => {
    await NotificationService.markAsOpened(notification.id, user?.uid)
    setLocalNotifications(prev =>
      prev.map(n =>
        n.id === notification.id ? { ...n, isRead: true, openedAt: new Date() } : n
      )
    )

    const isEventSummary = notification.data?.summaryMode === "today"
      || notification.data?.summaryMode === "week"
      || notification.type === "upcoming_summary"

    // Navigate based on notification type or deepLink
    if (isEventSummary) {
      // Navigate to Events screen to show all events
      if (typeof window !== 'undefined') {
        window.location.href = notification.deepLink || '/events';
      }
      return
    }

    if (notification.deepLink) {
      // Navigate directly using absolute or relative URL.
      if (typeof window !== 'undefined') {
        window.location.href = notification.deepLink;
      }
    }
  }

  const handleMarkAllRead = async () => {
    await NotificationService.markAllAsRead(user?.uid)
    setLocalNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date() })))
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "event_summary":
        return "📅"
      case "upcoming_summary":
        return "📊"
      case "ticket_purchase":
      case "ticket_update":
        return "🎫"
      case "payout_update":
        return "💸"
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
      case "ticket_update":
        return "#F3E5F5"
      case "payout_update":
        return "#E8F5E9"
      case "payment_confirmation":
        return "#E8F5E9"
      default:
        return "#FFF3E0"
    }
  }

  const getEventPreviews = (notification: AppNotification): EventSummaryPreview[] => {
    const raw = notification.data?.eventPreviews
    if (Array.isArray(raw)) return raw.slice(0, 3)
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.slice(0, 3) : []
      } catch {
        return []
      }
    }
    return []
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
    const isWorkflowSummary = item.data?.summaryMode === "today"
      || item.data?.summaryMode === "week"
      || item.type === "upcoming_summary"
    const eventPreviews = isWorkflowSummary ? getEventPreviews(item) : []
    const parsedEventIds = typeof item.data?.eventIds === "string"
      ? (() => { try { return JSON.parse(item.data.eventIds) } catch { return [] } })()
      : item.data?.eventIds
    const eventCount = isWorkflowSummary
      ? Number(item.data?.totalEventCount || parsedEventIds?.length || eventPreviews.length || 0)
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
              {eventPreviews.length > 0 && (
                <View style={styles.previewList}>
                  {eventPreviews.map((event) => (
                    <TouchableOpacity
                      key={event.slug}
                      style={styles.previewCard}
                      onPress={(pressEvent) => {
                        pressEvent.stopPropagation()
                        if (typeof window !== "undefined") window.location.href = `/events/${event.slug}`
                      }}
                    >
                      {event.posterUrl ? (
                        <Image source={{ uri: event.posterUrl }} style={styles.previewImage} />
                      ) : (
                        <View style={[styles.previewImage, styles.previewImageFallback]}>
                          <Text style={styles.previewImageFallbackText}>🎟️</Text>
                        </View>
                      )}
                      <Text style={styles.previewName} numberOfLines={2}>{event.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={styles.tapToView}>See more events</Text>
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
    return <ResponsiveSkeleton variant="list" />
  }

  const unreadCount = (notifications || []).filter(n => !n.isRead).length

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
        ref={scrollRef}
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        onScroll={onScroll}
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
    marginTop: 8,
  },
  previewList: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  previewCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#F7F9FC",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E4EAF2",
  },
  previewImage: {
    width: "100%",
    height: 76,
    backgroundColor: "#E9EEF5",
  },
  previewImageFallback: {
    justifyContent: "center",
    alignItems: "center",
  },
  previewImageFallbackText: {
    fontSize: 22,
  },
  previewName: {
    color: "#263238",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    paddingHorizontal: 7,
    paddingVertical: 7,
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
