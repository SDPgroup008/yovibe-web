import type React from "react";
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { publicSiteUrl } from "../config/runtime";

type LegalLinksProps = {
  tone?: "light" | "dark";
};

const LegalLinks: React.FC<LegalLinksProps> = ({ tone = "light" }) => {
  const openLegalPage = async (path: "/privacy" | "/terms") => {
    const url = `${publicSiteUrl()}${path}`;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.assign(url);
      return;
    }

    await Linking.openURL(url);
  };

  const textStyle = tone === "dark" ? styles.darkText : styles.lightText;

  return (
    <View style={styles.container} accessibilityRole="summary" accessibilityLabel="Legal information">
      <View style={styles.links}>
        <TouchableOpacity accessibilityRole="link" onPress={() => void openLegalPage("/privacy")}>
          <Text style={[styles.link, textStyle]}>Privacy Policy</Text>
        </TouchableOpacity>
        <Text style={[styles.separator, textStyle]}>•</Text>
        <TouchableOpacity accessibilityRole="link" onPress={() => void openLegalPage("/terms")}>
          <Text style={[styles.link, textStyle]}>Terms of Service</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 0,
  },
  links: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  separator: {
    fontSize: 12,
  },
  lightText: {
    color: "#C7CBD4",
  },
  darkText: {
    color: "#667085",
  },
});

export default LegalLinks;
