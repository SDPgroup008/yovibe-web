type BrowserPushPayload = {
  notification?: {
    title?: string
    body?: string
    image?: string
  }
  data?: Record<string, string | undefined>
}

/** Display a foreground FCM message in the operating-system notification tray. */
export async function showForegroundNotification(payload: BrowserPushPayload): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false
  if (Notification.permission !== 'granted') return false

  const title = payload.notification?.title || 'YoVibe'
  const data = payload.data || {}
  const options: NotificationOptions & { image?: string } = {
    body: payload.notification?.body || 'You have a new update.',
    icon: '/assets/icon.png',
    badge: '/assets/favicon.png',
    ...(payload.notification?.image || data.imageUrl
      ? { image: payload.notification?.image || data.imageUrl }
      : {}),
    data: {
      ...data,
      url: data.url || data.deepLink || '/',
    },
    tag: data.notificationId ? `yovibe-${data.notificationId}` : 'yovibe-notification',
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      if (registration?.showNotification) {
        await registration.showNotification(title, options)
        return true
      }
    }
  } catch (error) {
    console.warn('[Notifications] Foreground service-worker display failed:', error)
  }

  try {
    const notification = new Notification(title, options)
    notification.onclick = () => {
      const target = String(options.data?.url || '/')
      window.location.href = target
    }
    return true
  } catch (error) {
    console.warn('[Notifications] Foreground browser display failed:', error)
    return false
  }
}
