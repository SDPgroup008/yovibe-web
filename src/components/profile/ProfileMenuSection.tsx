import type React from "react";
import { Children, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BORDER_RADIUS, COLORS } from "../../utils/ResponsiveDesign";

interface ProfileMenuSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const ProfileMenuSection: React.FC<ProfileMenuSectionProps> = ({
  title,
  subtitle,
  children,
}) => {
  const items = Children.toArray(children);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.divider} />
      <View style={styles.items}>
        {items.map((child, index) => (
          <View key={index} style={[styles.itemWrap, index > 0 && styles.itemDivider]}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
  },
  header: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 10,
  },
  title: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  subtitle: {
    color: COLORS.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 8,
    marginBottom: 4,
  },
  items: {
    paddingBottom: 2,
  },
  itemWrap: {
    borderRadius: BORDER_RADIUS.md,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
});

export default ProfileMenuSection;
