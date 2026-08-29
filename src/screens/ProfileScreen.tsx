import "react-native-get-random-values";
import type React from "react";
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import SupabaseService from "../services/SupabaseService";
import { supabase } from "../config/supabase";
import ImagePickerService from "../services/ImagePickerService";
import { useCompatNavigation } from "../utils/compatNavigation";
import { COLORS, BORDER_RADIUS, useDeviceType } from "../utils/ResponsiveDesign";
import ProfileBanner from "../components/profile/ProfileBanner";
import ProfileIdentityCard from "../components/profile/ProfileIdentityCard";
import ProfileMenuSection from "../components/profile/ProfileMenuSection";
import ProfileMenuItem from "../components/profile/ProfileMenuItem";
import ProfileLayout from "../components/profile/ProfileLayout";
import EditProfileModal from "../components/profile/EditProfileModal";
import UpgradeConfirmModal from "../components/profile/UpgradeConfirmModal";

type MenuItemConfig = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  accent?: string;
  destructive?: boolean;
  onPress: () => void;
};

type MenuSectionConfig = {
  title: string;
  subtitle?: string;
  items: MenuItemConfig[];
};

const ProfileScreen: React.FC = () => {
  const navigation = useCompatNavigation()
  const { user, signOut, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);

  // Edit profile states
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [editProfileLoading, setEditProfileLoading] = useState(false)
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});

  // Banner state
  const [bannerStatus, setBannerStatus] = useState<"success" | "error" | null>(null);
  const [bannerMessage, setBannerMessage] = useState("");
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  const { isLargeScreen } = useDeviceType();

  // Auto-hide banner after 3 seconds
  useEffect(() => {
    if (bannerStatus !== null) {
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      const timeout = setTimeout(() => {
        Animated.timing(bannerOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setBannerStatus(null);
          setBannerMessage("");
        });
      }, 3000);

      return () => clearTimeout(timeout);
    }
  }, [bannerStatus]);

  // Load user data on mount
  useEffect(() => {
    if (user && (user.displayName || user.photoURL)) {
      setDisplayName(user.displayName || "");
      setPhotoURL(user.photoURL || "");
    } else {
      // Clear local fields when user becomes unauthenticated
      setDisplayName("");
      setPhotoURL("");
    }
  }, [user]);

  /**
   * determinePublicRoute
   *
   * Return a sensible public route name that exists in your MainTabNavigator.
   * Based on your navigator, valid top-level tab names are:
   *   "Venues", "Events", "Map", "Calendar", "Profile"
   *
   * We'll prefer "Venues" as the app's public main entry.
   */
  const determinePublicRoute = (): string => {
    // Prefer Venues as the public main tab
    return "Venues";
  };

  const handleSignOut = async () => {
    console.log("ProfileScreen: Sign Out button clicked");
    const isWeb = Platform.OS === "web";
    const confirmed = isWeb
      ? window.confirm("Are you sure you want to sign out?")
      : await new Promise<boolean>((resolve) => {
          Alert.alert("Sign Out", "Are you sure you want to sign out?", [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: "Sign Out",
              style: "destructive",
              onPress: () => resolve(true),
            },
          ]);
        });

    if (!confirmed) {
      console.log("ProfileScreen: Sign out cancelled");
      return;
    }

    console.log("ProfileScreen: Starting sign out process");
    setLoading(true);
    try {
      await signOut();
      console.log("ProfileScreen: Sign out completed");

      // Redirect to login page after sign out
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }

      console.log("ProfileScreen: Redirected to login page");
    } catch (error: any) {
      console.error("ProfileScreen: Sign out error:", error?.message ?? error);
      Alert.alert("Error", `Failed to sign out: ${error?.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
      console.log("ProfileScreen: Loading reset to false");
    }
  };

  const navigateToMyVenues = () => {
    if (user?.userType === "club_owner") {
      navigation.navigate("MyVenues");
    }
  };

  const navigateToAdminUsers = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminUsers");
    }
  };

  const navigateToAdminVenues = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminVenues");
    }
  };

  const navigateToAdminEvents = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminEvents");
    }
  };

  const navigateToAdminRefunds = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminRefunds");
    }
  };

  const navigateToAdminWithdrawals = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminWithdrawals");
    }
  };

  const navigateToAdminPayouts = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminPayouts");
    }
  };

  const navigateToSettings = () => {
    navigation.navigate("Settings");
  };

  const navigateToHelpSupport = () => {
    navigation.navigate("HelpSupport");
  };

  // Phase 4 (4.2): DPPA right of access — download the user's personal data.
  const handleDownloadMyData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { Alert.alert("Session Expired", "Please sign in again."); return }

      const response = await fetch("/.netlify/functions/data-export", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        Alert.alert("Export Failed", data.error || "Failed to export your data")
        return
      }

      if (typeof document !== "undefined") {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "yovibe-my-data.json"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
      Alert.alert(
        "Data Exported",
        `Your data has been exported.\nTickets: ${(data.tickets || []).length}\nRefunds: ${(data.refunds || []).length}\nInstallment plans: ${(data.installment_plans || []).length}`
      )
    } catch (error) {
      console.error("Data export error:", error)
      Alert.alert("Error", "Failed to export your data")
    }
  };

  const navigateToAdminOwnershipRequests = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminOwnershipRequests");
    }
  };

  const navigateToAdminStrandedPurchases = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminStrandedPurchases");
    }
  };

  const navigateToAdminGeocode = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminGeocode");
    }
  };

  const handleUpgradeToClubOwner = async () => {
    if (!user) return;

    setUpgradeLoading(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ user_type: "club_owner" })
        .eq("id", user.id);

      if (error) throw error;

      const refreshedUser = await SupabaseService.getUserProfile(user.id);
      if (refreshedUser) {
        const { data: session } = await supabase.auth.getSession();
        if (session.session?.user) {
          const fullUser = await SupabaseService.ensureUserProfile(session.session.user);
          updateProfile({ displayName: fullUser.displayName, photoURL: fullUser.photoURL });
        }
      }

      setBannerStatus("success");
      setBannerMessage("Successfully upgraded to Club Owner!");
      setShowUpgradeConfirm(false);
    } catch (error) {
      setBannerStatus("error");
      setBannerMessage("Upgrade failed. Please try again.");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleToggleUpgradeConfirm = () => {
    setShowUpgradeConfirm(!showUpgradeConfirm);
  };

  const navigateToAdminDashboard = () => {
    if (user?.userType === "admin") {
      navigation.navigate("AdminDashboard");
    }
  };

  const navigateToMyTickets = () => {
    navigation.navigate("MyTickets");
  };

  const handleToggleEditProfile = () => {
    setShowEditProfile(!showEditProfile);
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setProfileFieldErrors({})
    if (!displayName.trim()) {
      setProfileFieldErrors({ displayName: "Please enter your display name" })
      Alert.alert("Error", "Please enter your display name")
      return
    }

    setEditProfileLoading(true);
    try {
      await updateProfile({
        displayName,
        photoURL,
      });

      setShowEditProfile(false);
      setBannerStatus("success");
      setBannerMessage("Profile updated successfully");
    } catch (error) {
      setBannerStatus("error");
      setBannerMessage("Failed to update profile");
    } finally {
      setEditProfileLoading(false);
    }
  };

  const handlePickProfileImage = async () => {
    try {
      // Request permissions first (no-op on web)
      await ImagePickerService.requestMediaLibraryPermissionsAsync();

      // Launch image picker (kept for profile editing; not used for vibe capture)
      const result = await ImagePickerService.launchImageLibraryAsync({
        mediaTypes: "Images",
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        setPhotoURL(imageUri);

        // If we're not in edit mode, auto-save the profile image
        if (!showEditProfile) {
          setEditProfileLoading(true);
          try {
            // Upload image and get URL
            const uploadedUrl = await SupabaseService.uploadVenueImage(imageUri);
            await updateProfile({ photoURL: uploadedUrl });
            setBannerStatus("success");
            setBannerMessage("Profile image updated successfully");
          } catch (error) {
            setBannerStatus("error");
            setBannerMessage("Failed to update profile image");
          } finally {
            setEditProfileLoading(false);
          }
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      setBannerStatus("error");
      setBannerMessage("Failed to pick image");
    }
  };

  const openNotifications = () => {
    navigation.navigate("Notification");
  };

  // ---------------------------------------------------------------------------
  // UI composition (presentation only — all handlers/state above are untouched)
  // ---------------------------------------------------------------------------

  const accountItems: MenuItemConfig[] = [
    {
      icon: "person-outline",
      label: "Edit Profile",
      description: "Update your name and profile photo",
      onPress: handleToggleEditProfile,
    },
  ];

  if (user?.userType === "regular_user") {
    accountItems.push({
      icon: "business-outline",
      label: "Become a Club Owner",
      description: "Unlock organizer tools",
      onPress: handleToggleUpgradeConfirm,
    });
  }

  accountItems.push({
    icon: "ticket-outline",
    label: "My Tickets",
    description: "View your tickets and passes",
    onPress: navigateToMyTickets,
  });

  // Settings is account-scoped — only shown to authenticated users.
  if (user) {
    accountItems.push({
      icon: "settings-outline",
      label: "Settings",
      description: "Account and app preferences",
      onPress: navigateToSettings,
    });
  }

  // On desktop, Sign Out lives at the end of the Account section; on mobile it
  // remains the pinned button rendered below the scroll content.
  if (isLargeScreen) {
    accountItems.push({
      icon: "log-out-outline",
      label: "Sign Out",
      destructive: true,
      onPress: handleSignOut,
    });
  }

  const supportItems: MenuItemConfig[] = [
    {
      icon: "notifications-outline",
      label: "Notifications",
      description: "Manage notification preferences",
      onPress: openNotifications,
    },
    {
      icon: "help-circle-outline",
      label: "Help & Support",
      description: "Get help with your account",
      onPress: navigateToHelpSupport,
    },
  ];

  // DPPA right of access is account-scoped — only shown to authenticated users.
  if (user) {
    supportItems.push({
      icon: "download-outline",
      label: "Download My Data",
      description: "Export your personal data (DPPA 2019)",
      onPress: handleDownloadMyData,
    });
  }

  const menuSections: MenuSectionConfig[] = [
    { title: "Account", items: accountItems },
    { title: "Support & System", items: supportItems },
  ];

  if (user?.userType === "club_owner") {
    menuSections.splice(1, 0, {
      title: "Organiser Tools",
      items: [
        {
          icon: "business-outline",
          label: "My Venues",
          description: "Manage your venues and events",
          accent: COLORS.primary,
          onPress: navigateToMyVenues,
        },
      ],
    });
  }

  if (user?.userType === "admin") {
    menuSections.splice(
      1,
      0,
      {
        title: "Admin Console",
        subtitle: "Overview",
        items: [
          { icon: "analytics-outline", label: "Analytics Dashboard", accent: COLORS.primary, onPress: navigateToAdminDashboard },
          { icon: "people-outline", label: "Manage Users", accent: COLORS.primary, onPress: navigateToAdminUsers },
        ],
      },
      {
        title: "Admin Console",
        subtitle: "Management",
        items: [
          { icon: "business-outline", label: "Manage Venues", accent: COLORS.primary, onPress: navigateToAdminVenues },
          { icon: "calendar-outline", label: "Manage Events", accent: COLORS.primary, onPress: navigateToAdminEvents },
          { icon: "swap-horizontal-outline", label: "Ownership Requests", accent: COLORS.primary, onPress: navigateToAdminOwnershipRequests },
        ],
      },
      {
        title: "Admin Console",
        subtitle: "Finance",
        items: [
          { icon: "return-down-back-outline", label: "Refund Requests", accent: "#F59E0B", onPress: navigateToAdminRefunds },
          { icon: "cash-outline", label: "Revenue Withdrawals", accent: COLORS.primary, onPress: navigateToAdminWithdrawals },
          { icon: "send-outline", label: "Payout Requests", accent: "#F59E0B", onPress: navigateToAdminPayouts },
        ],
      },
      {
        title: "Admin Console",
        subtitle: "Operations",
        items: [
          { icon: "alert-circle-outline", label: "Stranded Purchases", accent: "#FF6B6B", onPress: navigateToAdminStrandedPurchases },
          { icon: "map-outline", label: "Venue Geocoding", accent: "#22d3ee", onPress: navigateToAdminGeocode },
        ],
      }
    );
  }

  const primaryActionConfig: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  } | null = (() => {
    const userType = user?.userType;
    if (userType === "club_owner") {
      return { label: "Open My Venues", icon: "business-outline", onPress: navigateToMyVenues };
    }
    if (userType === "admin") {
      return { label: "Open Analytics", icon: "analytics-outline", onPress: navigateToAdminDashboard };
    }
    if (userType === "regular_user") {
      return { label: "Edit Profile", icon: "person-outline", onPress: handleToggleEditProfile };
    }
    return null;
  })();

  const identityCard = (
    <ProfileIdentityCard
      isLargeScreen={isLargeScreen}
      photoURL={photoURL || undefined}
      displayName={displayName || undefined}
      email={user?.email}
      userType={user?.userType}
      createdAt={user?.createdAt}
      onPickImage={handlePickProfileImage}
    />
  );

  const sectionCards = (
    <>
      {menuSections.map((section, index) => (
        <ProfileMenuSection
          key={`${section.title}-${section.subtitle ?? ""}-${index}`}
          title={section.title}
          subtitle={section.subtitle}
        >
          {section.items.map((item) => (
            <ProfileMenuItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              description={item.description}
              accent={item.accent}
              destructive={item.destructive}
              onPress={item.onPress}
            />
          ))}
        </ProfileMenuSection>
      ))}
    </>
  );

  const primaryAction = primaryActionConfig ? (
    <TouchableOpacity style={styles.primaryAction} onPress={primaryActionConfig.onPress}>
      <Ionicons name={primaryActionConfig.icon} size={18} color={COLORS.background} />
      <Text style={styles.primaryActionText}>{primaryActionConfig.label}</Text>
    </TouchableOpacity>
  ) : null;

  const mobileSignOut = user ? (
    <TouchableOpacity
      style={[styles.signOutButton, loading && styles.signOutButtonDisabled]}
      onPress={handleSignOut}
      disabled={loading}
    >
      {loading ? <ActivityIndicator color={COLORS.danger} /> : <Text style={styles.signOutText}>Sign Out</Text>}
    </TouchableOpacity>
  ) : null;

  return (
    <View style={styles.container}>
      <ProfileBanner
        status={bannerStatus}
        message={bannerMessage}
        opacity={bannerOpacity}
        topOffset={isLargeScreen ? 20 : 50}
      />
      <ProfileLayout
        isLargeScreen={isLargeScreen}
        identityCard={identityCard}
        primaryAction={isLargeScreen ? primaryAction : undefined}
        sections={sectionCards}
        signOutButton={isLargeScreen ? undefined : mobileSignOut}
      />

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={showEditProfile}
        photoURL={photoURL}
        displayName={displayName}
        fieldErrors={profileFieldErrors}
        loading={editProfileLoading}
        onPhotoPress={handlePickProfileImage}
        onDisplayNameChange={(t) => {
          setDisplayName(t);
          setProfileFieldErrors((prev) => {
            const next = { ...prev };
            delete next.displayName;
            return next;
          });
        }}
        onCancel={handleToggleEditProfile}
        onSave={handleUpdateProfile}
      />

      {/* Upgrade Confirmation Modal */}
      <UpgradeConfirmModal
        visible={showUpgradeConfirm}
        loading={upgradeLoading}
        onCancel={handleToggleUpgradeConfirm}
        onConfirm={handleUpgradeToClubOwner}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  primaryActionText: {
    color: COLORS.background,
    fontSize: 15,
    fontWeight: "700",
  },
  signOutButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 15,
    backgroundColor: "rgba(220, 38, 38, 0.12)",
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.4)",
    zIndex: 100, // Added to prevent overlap
  },
  signOutText: {
    fontSize: 15,
    color: COLORS.danger,
    fontWeight: "700",
  },
  signOutButtonDisabled: {
    opacity: 0.6,
  },
})

export default ProfileScreen
