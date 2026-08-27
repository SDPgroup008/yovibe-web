import type React from "react";
import { type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../utils/ResponsiveDesign";

interface ProfileLayoutProps {
  isLargeScreen: boolean;
  identityCard: ReactNode;
  primaryAction?: ReactNode;
  sections: ReactNode;
  signOutButton?: ReactNode;
}

const ProfileLayout: React.FC<ProfileLayoutProps> = ({
  isLargeScreen,
  identityCard,
  primaryAction,
  sections,
  signOutButton,
}) => {
  if (isLargeScreen) {
    return (
      <View style={styles.desktopContainer}>
        <ScrollView
          contentContainerStyle={styles.desktopContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Profile</Text>
          <View style={styles.desktopRow}>
            <View style={styles.leftColumn}>
              {identityCard}
              {primaryAction ? <View style={styles.primaryActionWrap}>{primaryAction}</View> : null}
            </View>
            <View style={styles.rightColumn}>{sections}</View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.mobileContainer}>
      <ScrollView contentContainerStyle={styles.mobileContent} showsVerticalScrollIndicator={false}>
        {identityCard}
        {sections}
      </ScrollView>
      {signOutButton}
    </View>
  );
};

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
  },
  desktopContent: {
    width: "100%",
    maxWidth: 1200,
    marginHorizontal: "auto",
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 48,
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  desktopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  leftColumn: {
    width: 320,
    marginRight: 24,
    flexShrink: 0,
  },
  primaryActionWrap: {
    marginTop: 16,
  },
  rightColumn: {
    flex: 1,
    gap: 16,
  },
  mobileContainer: {
    flex: 1,
  },
  mobileContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 24,
  },
});

export default ProfileLayout;
