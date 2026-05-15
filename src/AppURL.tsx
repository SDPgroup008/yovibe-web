import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RouterProvider } from './utils/routes';
import { DesktopLayout, MobileLayout } from './components/Navigation';

// Import notification components (keep existing logic)
import PermissionBanner from './components/PermissionBanner';
import NotificationBanner from './components/NotificationBanner';

// Import Firebase services (keep existing logic)
import { requestNotificationPermission, getWebFcmToken, messaging } from './config/firebase';
import { onMessage } from 'firebase/messaging';
import NotificationService from './services/NotificationService';

// Auth flow component (simplified from original)
const AuthFlow: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading YoVibe...</Text>
      </View>
    );
  }

  // If not authenticated, show login/signup
  // Note: This would need integration with the new routing system
  if (!user) {
    return <LoginScreen />;
  }

  // If authenticated, show main app
  return <MainApp />;
};

// Main app component with URL routing
const MainApp: React.FC = () => {
  const { user } = useAuth();
  const [banner, setBanner] = useState<{ title: string; body: string } | null>(null);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  // Keep existing notification logic
  useEffect(() => {
    // Service worker registration (existing logic)
    (async () => {
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
          console.log("[iOS-NOTIF] Service worker registered:", registration.scope);
          await navigator.serviceWorker.ready;
          console.log("[iOS-NOTIF] Service worker is active and ready");
        } catch (err) {
          console.warn("[iOS-NOTIF] Service worker registration failed:", err);
        }
      } else {
        console.warn("[iOS-NOTIF] Service worker not supported in this browser");
      }
    })();

    // Permission banner logic (existing)
    let currentPermission = "default";
    if (typeof Notification !== 'undefined' && Notification.permission) {
      currentPermission = Notification.permission;
    }

    if (currentPermission === "default") {
      const bannerTimer = setTimeout(() => {
        setShowPermissionBanner(true);
      }, 5000);
      return () => clearTimeout(bannerTimer);
    }

    // FCM token logic (existing)
    if (currentPermission === "granted") {
      (async () => {
        try {
          const token = await getWebFcmToken();
          if (token) {
            console.log("Web FCM token retrieved:", token);
            const userId = user?.uid || null;
            const userEmail = user?.email;
            const userName = user?.displayName || null;
            await saveTokenToRepo(token, userId, userEmail, userName);
          }
        } catch (tokenErr) {
          console.warn("Error getting FCM token:", tokenErr);
        }
      })();
    }
  }, [user]);

  // Foreground notification listener (existing logic)
  useEffect(() => {
    if (!messaging) {
      return;
    }

    const unsubscribe = onMessage(messaging, async (payload) => {
      console.log("[iOS-NOTIF] Foreground notification received");
      console.log("[iOS-NOTIF] Title:", payload.notification?.title);

      try {
        await NotificationService.processIncomingNotification(payload, user?.uid);
      } catch (error) {
        console.error("❌ ERROR saving notification to Firestore:", error);
      }

      setBanner({
        title: payload.notification?.title || "Notification",
        body: payload.notification?.body || "",
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Permission handlers (existing logic)
  const handleAllowNotifications = async () => {
    setShowPermissionBanner(false);
    console.log("[iOS-NOTIF] User tapped Allow - requesting permission...");
    try {
      const granted = await requestNotificationPermission();
      console.log("[iOS-NOTIF] Permission result:", granted ? 'granted' : 'denied');

      if (granted) {
        try {
          const token = await getWebFcmToken();
          if (token) {
            console.log("[iOS-NOTIF] FCM Token received:", token.substring(0, 20) + "...");
            const userId = user?.uid || null;
            const userEmail = user?.email;
            const userName = user?.displayName || null;
            await saveTokenToRepo(token, userId, userEmail, userName);
            await NotificationService.trackNewSubscription();
          }
        } catch (tokenErr) {
          console.error("[iOS-NOTIF] Error getting/saving token:", tokenErr);
        }
      }
    } catch (err) {
      console.error("[iOS-NOTIF] Unexpected error in permission flow:", err);
    }
  };

  const handleBlockNotifications = () => {
    setShowPermissionBanner(false);
    console.log("[iOS-NOTIF] User tapped Block");
  };

  return (
    <DesktopLayout>
      {/* Permission banner */}
      {showPermissionBanner && (
        <PermissionBanner
          onAllow={handleAllowNotifications}
          onBlock={handleBlockNotifications}
        />
      )}

      {/* URL-based routing */}
      <RouterProvider routes={routes} />

      {/* Notification banner */}
      {banner && (
        <NotificationBanner
          title={banner.title}
          body={banner.body}
          onClose={() => setBanner(null)}
        />
      )}
    </DesktopLayout>
  );
};

// Root app component
export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor="#121212" />
      <AuthFlow />
    </AuthProvider>
  );
}

// Styles (minimal needed)
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
});

// Import missing components
import { View, Text, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native';
import LoginScreen from './screens/auth/LoginScreen';
import { useState, useEffect } from 'react';
import { saveTokenToRepo } from './services/TokenService';
import { routes } from './utils/routes';
import PermissionBanner from './components/PermissionBanner';
import NotificationBanner from './components/NotificationBanner';