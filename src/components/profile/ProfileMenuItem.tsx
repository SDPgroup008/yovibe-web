import type React from "react";
import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, COLORS } from "../../utils/ResponsiveDesign";

export interface ProfileMenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  accent?: string;
  destructive?: boolean;
  onPress: () => void;
}

const ProfileMenuItem: React.FC<ProfileMenuItemProps> = ({
  icon,
  label,
  description,
  accent = COLORS.primary,
  destructive = false,
  onPress,
}) => {
  const [hovered, setHovered] = useState(false);

  // Desktop-only hover affordance (no-op on native platforms)
  const webHoverProps = Platform.OS === "web"
    ? ({
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      } as any)
    : {};

  const iconColor = destructive ? COLORS.danger : accent;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      {...webHoverProps}
      style={[styles.row, hovered && styles.rowHover]}
    >
      <View style={[styles.iconTile, { backgroundColor: `${iconColor}1A` }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, destructive && styles.labelDestructive]}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {destructive ? (
        <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.md,
  },
  rowHover: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  labelDestructive: {
    color: COLORS.danger,
  },
  description: {
    color: COLORS.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
});

export default ProfileMenuItem;
