import type React from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { BORDER_RADIUS } from "../../utils/ResponsiveDesign";

interface ProfileBannerProps {
  status: "success" | "error" | null;
  message: string;
  opacity: Animated.Value;
  topOffset?: number;
}

const ProfileBanner: React.FC<ProfileBannerProps> = ({
  status,
  message,
  opacity,
  topOffset = 50,
}) => {
  if (status === null) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.banner,
        status === "success" ? styles.bannerSuccess : styles.bannerError,
        { opacity, top: topOffset },
      ]}
    >
      <Text style={styles.bannerText}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: "center",
    zIndex: 999,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.94)",
    borderColor: "rgba(52, 211, 153, 0.45)",
  },
  bannerError: {
    backgroundColor: "rgba(220, 38, 38, 0.94)",
    borderColor: "rgba(248, 113, 113, 0.45)",
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
});

export default ProfileBanner;
