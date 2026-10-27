"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import SkeletonLoader from "./components/SkeletonLoader";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { RouterProvider, RouteRenderer } from "./utils/URLRouter";
import { routes } from "./utils/routes";
import { DesktopLayout, MobileLayout } from "./components/Navigation";
import { LayoutProvider, useLayout } from "./contexts/LayoutContext";
import { Ionicons } from "@expo/vector-icons";

// 🔍 Error tracking (Phase 5) — init once at module scope, before React
// renders. Runs for BOTH web and native entries (App is the shared root).
// Wrapped so a Sentry/DSN failure can never white-screen the app.
import { initSentry } from "./config/sentry";
try {
  initSentry();
} catch (e) {
  console.warn("[Sentry] Init failed (non-fatal):", (e as Error)?.message || e);
}

// 🔔 Import Firebase helpers for notifications
import {
  requestNotificationPermission,
  getWebFcmToken,
  ensureMessagingInitialized,
  notificationsEnabled,
  getNotificationPermissionBannerMode,
  getWebPushAvailability,
} from "./config/firebase";
import { onMessage } from "firebase/messaging";
import NotificationService from "./services/NotificationService";
import TokenService from "./services/TokenService";
import { showForegroundNotification } from "./utils/browserNotifications";
import { getOrCreateNotificationInstallation } from "./services/notificationInstallation";
import { getCurrentSession } from "./config/supabase";
import type { NotificationPermissionBannerMode } from "./utils/notificationPermissionBanner";

type DeferredInstallPrompt = {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

// Store messaging instance in a ref to handle async initialization
let messagingInstance = null;

// 🔔 Persistent Permission Banner that floats at the top
type PermissionBannerProps = {
  mode: Exclude<NotificationPermissionBannerMode, null>;
  onPrimary: () => void;
  onDismiss: () => void;
};

const permissionBannerContent: Record<Exclude<NotificationPermissionBannerMode, null>, {
  title: string;
  body: string;
  primaryLabel: string;
}> = {
  request: {
    title: "📢 Stay Updated!",
    body: "Enable notifications to get updates about events and vibes.",
    primaryLabel: "Allow",
  },
  "install-guidance": {
    title: "📲 Install YoVibe for notifications",
    body: "On iPhone and iPad, add YoVibe to your Home Screen first, then open the installed app to enable notifications.",
    primaryLabel: "How to install",
  },
  "settings-guidance": {
    title: "🔔 Notifications are blocked",
    body: "Enable notifications in your browser or device settings to receive YoVibe updates.",
    primaryLabel: "How to enable",
  },
  "unsupported-guidance": {
    title: "🔔 Notifications unavailable here",
    body: "Use a supported browser or install YoVibe to receive notification updates.",
    primaryLabel: "Learn more",
  },
};

function PermissionBanner({ mode, onPrimary, onDismiss }: PermissionBannerProps) {
  const [slideAnim, setSlideAnim] = useState(0);
  const content = permissionBannerContent[mode];

  useEffect(() => {
    setSlideAnim(0); // Slide in
  }, []);

  const handleAction = (callback) => {
    setSlideAnim(-100); // Slide out
    setTimeout(callback, 300);
  };

  return (
    <View style={[styles.permissionBanner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.permissionContent}>
        <Text style={styles.permissionTitle}>{content.title}</Text>
        <Text style={styles.permissionBody}>{content.body}</Text>
      </View>
      <View style={styles.permissionActions}>
        <TouchableOpacity onPress={() => handleAction(onDismiss)} style={styles.blockButton}>
          <Text style={styles.blockButtonText}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleAction(onPrimary)} style={styles.allowButton}>
          <Text style={styles.allowButtonText}>{content.primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 🔔 Temporary notification banner with auto-dismiss
function NotificationBanner({ title, body, onClose }) {
  const [slideAnim, setSlideAnim] = useState(0);

  useEffect(() => {
    setSlideAnim(0); // Slide in
    const timer = setTimeout(() => {
      handleClose();
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setSlideAnim(-100); // Slide out
    setTimeout(onClose, 300);
  };

  return (
    <View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      <TouchableOpacity onPress={handleClose} style={styles.bannerClose}>
        <Text style={styles.bannerCloseText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

// 🔔 Save the browser token server-side for direct broadcast delivery.
async function saveTokenToRepo(token: string, userId: string | null = null, userEmail?: string, userName?: string) {
  try {
    const installation = getOrCreateNotificationInstallation();
    const session = await getCurrentSession();
    const res = await fetch("/.netlify/functions/save-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        token,
        userId,
        userEmail,
        userName,
        installationId: installation?.id,
        installationSecret: installation?.secret,
      }),
    });

    if (!res.ok) {
      throw new Error(`Notification registration failed (HTTP ${res.status})`);
    } else {
      const result = await res.json();
      /* console.log("[App] Token saved for direct broadcast delivery:", result); */
      if (result?.broadcastsFrom) NotificationService.notifyFeedChanged();
    }
  } catch (err) {
    console.warn("[Notifications] Token registration failed", err);
    throw err;
  }
}

// Main app component with URL routing
function AppContent() {
  const { user, loading } = useAuth();
  const { setHeaderRight } = useLayout();
  const [initializing, setInitializing] = useState(true);
  const [banner, setBanner] = useState<{ title: string; body: string } | null>(null);
  const [permissionBannerMode, setPermissionBannerMode] = useState<NotificationPermissionBannerMode>(null);
  const dismissedPermissionBannerModeRef = useRef<NotificationPermissionBannerMode>(null);
  const permissionBannerReadyRef = useRef(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<DeferredInstallPrompt | null>(null);
  const installPromptRef = useRef<DeferredInstallPrompt | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingServiceWorker, setWaitingServiceWorker] = useState<any | null>(null);

  useEffect(() => {
    if (!loading) {
      setInitializing(false);
    }
  }, [loading]);

  const refreshNotificationPermissionBanner = useCallback(() => {
    const nextMode = getNotificationPermissionBannerMode();
    if (nextMode === null) {
      dismissedPermissionBannerModeRef.current = null;
      setPermissionBannerMode(null);
      return;
    }
    setPermissionBannerMode(
      dismissedPermissionBannerModeRef.current === nextMode ? null : nextMode,
    );
  }, []);

  // Let the router handle all routes - authentication is managed by individual screens

  // Register service worker once and track updates waiting to be applied.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      console.warn("[PWA] Service worker not supported in this browser");
      return;
    }
    let mounted = true;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        /* console.log("[PWA] Service worker registered:", registration.scope); */

        if (registration.waiting && mounted) {
          setWaitingServiceWorker(registration.waiting);
          setShowUpdatePrompt(true);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller && mounted) {
              setWaitingServiceWorker(registration.waiting || installing);
              setShowUpdatePrompt(true);
            }
          });
        });

        await navigator.serviceWorker.ready;
        /* console.log("[PWA] Service worker is active and ready"); */
      } catch (err) {
        console.warn("[PWA] Service worker registration failed:", err);
      }
    };

    const onControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    registerServiceWorker();

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  // Capture install prompt event so we can show an explicit in-app Install button.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const deferred = event as Event & DeferredInstallPrompt;
      installPromptRef.current = deferred;
      setInstallPromptEvent(deferred);
    };

    const onAppInstalled = () => {
      installPromptRef.current = null;
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Show guidance or the native permission action whenever notifications are
  // not enabled for this browser. Re-check when visitors return from settings.
  useEffect(() => {
    if (Platform.OS !== "web") {
      setPermissionBannerMode(null);
      return;
    }

    if (typeof window === "undefined") return;

    permissionBannerReadyRef.current = false;
    const bannerTimer = window.setTimeout(() => {
      permissionBannerReadyRef.current = true;
      refreshNotificationPermissionBanner();
    }, 5000);

    const onFocus = () => {
      if (permissionBannerReadyRef.current) refreshNotificationPermissionBanner();
    };
    const onVisibilityChange = () => {
      if (permissionBannerReadyRef.current && document.visibilityState === "visible") {
        refreshNotificationPermissionBanner();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(bannerTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshNotificationPermissionBanner]);

  // Notification token flow remains limited to browsers that support web push.
  useEffect(() => {
    if (!notificationsEnabled || !getWebPushAvailability().supported) return;
    const currentPermission = typeof Notification === "undefined" ? "default" : Notification.permission;
    if (currentPermission === "granted") {
      (async () => {
        try {
          const token = await getWebFcmToken();
          if (token) {
            /* console.log("Web FCM token retrieved:", token); */
            const userId = user?.uid || null;
            const userEmail = user?.email;
            const userName = user?.displayName || null;
            await saveTokenToRepo(token, userId, userEmail ?? undefined, userName ?? undefined);
          } else {
            setBanner({ title: "Notifications not connected", body: "Please reopen YoVibe to retry notification registration." });
          }
        } catch (tokenErr) {
          console.warn("Error getting FCM token:", tokenErr);
          setBanner({ title: "Notifications not connected", body: "Please reopen YoVibe to retry notification registration." });
        }
      })();
    }
  }, [user]);

  // 🔔 Listen for foreground notifications after Firebase Messaging finishes
  // asynchronous initialization. FCM does not display system notifications
  // automatically while the page is focused, so display one explicitly.
  useEffect(() => {
    if (!notificationsEnabled || !getWebPushAvailability().supported) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    ensureMessagingInitialized().then((instance) => {
      if (!instance || cancelled) return;
      unsubscribe = onMessage(instance, async (payload) => {
        try {
          await NotificationService.processIncomingNotification(payload, user?.uid);
          await showForegroundNotification(payload);
        } catch (error) {
          console.error("❌ ERROR processing foreground notification:", error);
        }

        setBanner({
          title: payload.notification?.title || "Notification",
          body: payload.notification?.body || "",
        });
      });
    }).catch((error) => {
      console.warn("[Notifications] Foreground listener initialization failed:", error);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user]);

  // 🔔 Handle permission banner actions
  const handleAllowNotifications = async () => {
    setPermissionBannerMode(null);
    /* console.log("[iOS-NOTIF] User tapped Allow - requesting permission..."); */
    try {
      const granted = await requestNotificationPermission();
      /* console.log("[iOS-NOTIF] Permission result:", granted ? 'granted' : 'denied'); */

      if (granted) {
        try {
          /* console.log("[iOS-NOTIF] Getting FCM token..."); */
          const token = await getWebFcmToken();
          /* console.log("[iOS-NOTIF] Token received:", token ? 'YES' : 'NO'); */

          if (token) {
            /* console.log("[iOS-NOTIF] FCM Token (first 20 chars):", token.substring(0, 20) + "..."); */
            const userId = user?.uid || null;
            const userEmail = user?.email;
            const userName = user?.displayName || undefined;
            /* console.log("[iOS-NOTIF] Saving token to Firestore..."); */
            await saveTokenToRepo(token, userId, userEmail, userName);
            /* console.log("[iOS-NOTIF] Token saved successfully!"); */

          } else {
            console.warn("[iOS-NOTIF] No FCM token received - browser permission was granted but FCM is not supported on this browser. In-app notifications will still work.");
            setBanner({ title: "Notifications not connected", body: "Please reopen YoVibe to retry notification registration." });
          }
        } catch (tokenErr) {
          console.error("[iOS-NOTIF] Error getting/saving token:", tokenErr);
          setBanner({ title: "Notifications not connected", body: "Please reopen YoVibe to retry notification registration." });
        }
      } else {
        console.error("[iOS-NOTIF] ERROR: Permission not granted");
      }
    } catch (err) {
      console.error("[iOS-NOTIF] Unexpected error in permission flow:", err);
    } finally {
      refreshNotificationPermissionBanner();
    }
  };

  const handleDismissNotificationBanner = useCallback(() => {
    dismissedPermissionBannerModeRef.current = permissionBannerMode;
    setPermissionBannerMode(null);
  }, [permissionBannerMode]);

  // Detect iOS (all browsers on iOS use WebKit, even Chrome)
  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);

  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
  }, []);

  const handleInstallApp = useCallback(async () => {
    const prompt = installPromptRef.current;
    if (!prompt) {
      if (typeof window !== "undefined") {
        // Determine why the install prompt isn't available
        let reason = "";
        if (isStandalone) {
          reason = "YoVibe is already installed on your device.";
        } else if (isIOS) {
          reason = "On iOS, you need to add YoVibe manually.";
        } else if (!("serviceWorker" in navigator)) {
          reason = "Your browser does not support installing web apps.";
        } else {
          reason = "The install prompt is not available right now.";
        }
        window.alert(
          `${reason}\n\nTo manually install YoVibe:\n` +
          "• Safari on iOS: tap Share (the square with arrow icon) → \"Add to Home Screen\"\n" +
          "• Chrome/Android: tap the ⋮ menu → \"Install app\" or \"Add to Home screen\"\n" +
          "• Samsung Internet: tap the ⋮ menu → \"Add page to\" → \"Home screen\""
        );
      }
      return;
    }

    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn("[PWA] Install prompt failed:", error);
    } finally {
      installPromptRef.current = null;
      setInstallPromptEvent(null);
    }
  }, [isIOS, isStandalone]);

  const handleNotificationSettingsGuidance = useCallback(() => {
    if (typeof window === "undefined") return;
    const guidance = isIOS
      ? "If YoVibe is installed, open iPhone Settings → Notifications → YoVibe and allow notifications. If it is not installed, add YoVibe to your Home Screen first."
      : "Open your browser's site settings for yovibe.net and change Notifications to Allow, then return to YoVibe.";
    window.alert(`Notifications are currently blocked.\n\n${guidance}`);
  }, [isIOS]);

  const handleUnsupportedNotificationGuidance = useCallback(() => {
    if (typeof window === "undefined") return;
    window.alert("Notifications are not available in this browser. Use a current supported browser or install YoVibe to receive updates.");
  }, []);

  const handlePermissionBannerPrimary = useCallback(() => {
    if (permissionBannerMode === "request") {
      void handleAllowNotifications();
      return;
    }
    handleDismissNotificationBanner();
    if (permissionBannerMode === "install-guidance") {
      void handleInstallApp();
      return;
    }
    if (permissionBannerMode === "settings-guidance") {
      handleNotificationSettingsGuidance();
      return;
    }
    if (permissionBannerMode === "unsupported-guidance") {
      handleUnsupportedNotificationGuidance();
    }
  }, [
    handleInstallApp,
    handleNotificationSettingsGuidance,
    handleUnsupportedNotificationGuidance,
    handleDismissNotificationBanner,
    permissionBannerMode,
  ]);

  const handleApplyUpdate = () => {
    if (!waitingServiceWorker) return;
    waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    setShowUpdatePrompt(false);
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      setHeaderRight(null);
      return;
    }

    // Set the button once — handleInstallApp is stable (useCallback with no deps)
    // and reads installPromptRef.current at call time, so it's always fresh.
    const promptAvailable = !!installPromptEvent;
    setHeaderRight(
      <TouchableOpacity 
        style={[styles.headerInstallButton, promptAvailable && styles.headerInstallButtonReady]} 
        onPress={handleInstallApp} 
        activeOpacity={0.8}
      >
        <Ionicons name="download-outline" size={18} color={promptAvailable ? "#00D4FF" : "#FFFFFF"} />
      </TouchableOpacity>
    );

    return () => setHeaderRight(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderRight, installPromptEvent]);


  if (initializing) {
    return <SkeletonLoader />;
  }

  // Always render the main router - screens handle their own authentication
  return (
    <View style={{ flex: 1 }}>
      {/* Permission banner at the very top */}
      {permissionBannerMode && (
        <PermissionBanner
          mode={permissionBannerMode}
          onPrimary={handlePermissionBannerPrimary}
          onDismiss={handleDismissNotificationBanner}
        />
      )}

      {showUpdatePrompt && (
        <View style={styles.updateBanner}>
          <Text style={styles.updateBannerText}>A new version is available.</Text>
          <TouchableOpacity style={styles.updateButton} onPress={handleApplyUpdate}>
            <Text style={styles.updateButtonText}>Update</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* URL-based routing with navigation */}
      <RouterProvider routes={routes}>
        <DesktopLayout>
          <MobileLayout>
            <RouteRenderer routes={routes} />
          </MobileLayout>
        </DesktopLayout>
      </RouterProvider>

      {/* Temporary notification banner */}
      {notificationsEnabled && banner && (
        <NotificationBanner
          title={banner.title}
          body={banner.body}
          onClose={() => setBanner(null)}
        />
      )}

    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LayoutProvider>
        <AppContent />
      </LayoutProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#121212",
  },
  loadingText: {
    color: "#FFFFFF",
    marginTop: 16,
    fontSize: 16,
  },
  permissionBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#2196F3",
    padding: 8,
    elevation: 10,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  permissionContent: {
    marginBottom: 6,
  },
  permissionTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    marginBottom: 2,
  },
  permissionBody: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 16,
  },
  permissionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  blockButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  blockButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  allowButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  allowButtonText: {
    color: "#2196F3",
    fontWeight: "bold",
    fontSize: 12,
  },
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#2196F3",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    elevation: 4,
    zIndex: 999,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  bannerBody: {
    color: "#fff",
    fontSize: 14,
  },
  bannerClose: {
    marginLeft: 8,
    padding: 4,
  },
  bannerCloseText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  headerInstallButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(102, 204, 255, 0.85)",
    backgroundColor: "rgba(33, 150, 243, 0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerInstallButtonReady: {
    borderColor: "#00D4FF",
    backgroundColor: "rgba(0, 212, 255, 0.25)",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  updateBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 146,
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.35)",
    zIndex: 1000,
  },
  updateBannerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    marginRight: 10,
    flex: 1,
  },
  updateButton: {
    backgroundColor: "#2196F3",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  updateButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
