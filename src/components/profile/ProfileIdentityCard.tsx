import type React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { UserType } from "../../models/User";
import { BORDER_RADIUS, COLORS, SHADOWS } from "../../utils/ResponsiveDesign";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ROLE_META: Record<UserType, { label: string; accent: string }> = {
  regular_user: { label: "Regular User", accent: COLORS.textSecondary },
  club_owner: { label: "Club Owner", accent: COLORS.primary },
  admin: { label: "Admin", accent: COLORS.accent },
  viber: { label: "Vibe Master", accent: "#F472B6" },
};

interface ProfileIdentityCardProps {
  isLargeScreen: boolean;
  photoURL?: string;
  displayName?: string;
  email?: string;
  userType?: UserType;
  createdAt?: Date | string;
  onPickImage: () => void;
}

function formatJoinDate(value?: Date | string): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  return `Member since ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const ProfileIdentityCard: React.FC<ProfileIdentityCardProps> = ({
  isLargeScreen,
  photoURL,
  displayName,
  email,
  userType,
  createdAt,
  onPickImage,
}) => {
  // Unknown/missing user types are labelled as vibers, mirroring the previous
  // header fallback ("Vibe Master").
  const meta = userType ? ROLE_META[userType] : ROLE_META.viber;
  const avatarSize = isLargeScreen ? 116 : 100;
  const ringSize = avatarSize + 8;
  const initial = (email || "U").charAt(0).toUpperCase();
  const joinedLabel = formatJoinDate(createdAt);

  return (
    <View style={[styles.card, isLargeScreen ? styles.cardDesktop : styles.cardMobile]}>
      <View
        style={[
          styles.ring,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPickImage}
          style={[
            styles.avatarWrap,
            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
          ]}
        >
          {photoURL ? (
            <Image
              source={{ uri: photoURL }}
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
              }}
            />
          ) : (
            <Text style={[styles.avatarText, { fontSize: avatarSize * 0.42 }]}>{initial}</Text>
          )}
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={isLargeScreen ? 18 : 16} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {displayName || "Your Profile"}
      </Text>
      {email ? (
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>
      ) : null}
      <View
        style={[
          styles.badge,
          { backgroundColor: `${meta.accent}1F`, borderColor: `${meta.accent}4D` },
        ]}
      >
        <View style={[styles.badgeDot, { backgroundColor: meta.accent }]} />
        <Text style={[styles.badgeText, { color: meta.accent }]}>{meta.label}</Text>
      </View>
      {joinedLabel ? <Text style={styles.joined}>{joinedLabel}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardDesktop: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: BORDER_RADIUS.xl,
    ...SHADOWS.heavy,
  },
  cardMobile: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.lg,
  },
  ring: {
    borderWidth: 2,
    borderColor: COLORS.gradientStart,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.glow,
  },
  avatarWrap: {
    backgroundColor: COLORS.gradientStart,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  name: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    maxWidth: "100%",
  },
  email: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 4,
    maxWidth: "100%",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    marginTop: 14,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  joined: {
    color: COLORS.textTertiary,
    fontSize: 12,
    marginTop: 12,
  },
});

export default ProfileIdentityCard;
