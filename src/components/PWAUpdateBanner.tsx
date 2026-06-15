"use client";

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";

declare global {
  interface Window {
    __swRegistration?: ServiceWorkerContainer;
  }
}

/**
 * PWAUpdateBanner
 *
 * Displays a banner when a new version of the app is available
 * (detected via the service worker update flow).
 * The user can tap "Update" to refresh and load the new version.
 */
const PWAUpdateBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Listen for the custom event dispatched from index.web.js
    const handleUpdateReady = () => setShowBanner(true);
    window.addEventListener("pwa-update-ready", handleUpdateReady);

    return () => window.removeEventListener("pwa-update-ready", handleUpdateReady);
  }, []);

  const handleUpdate = () => {
    setShowBanner(false);
    // Tell the service worker to skip waiting and claim clients
    if (window.__swRegistration && (window.__swRegistration as any).waiting) {
      (window.__swRegistration as any).waiting.postMessage({ type: "SKIP_WAITING" });
    }
    // Reload the page to ensure the new version is active
    window.location.reload();
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.text}>
          A new version of YoVibe is available!
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
            <Text style={styles.updateButtonText}>Update</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
            <Text style={styles.dismissButtonText}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 20 : 80,
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 255, 0.4)",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  content: {
    padding: 16,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  updateButton: {
    backgroundColor: "#00D4FF",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  updateButtonText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "700",
  },
  dismissButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dismissButtonText: {
    color: "#BBBBBB",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default PWAUpdateBanner;