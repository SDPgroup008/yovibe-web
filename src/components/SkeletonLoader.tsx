import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Single shimmering block
const SkeletonBlock: React.FC<{
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}> = ({ width = "100%", height = 16, borderRadius = 6, style }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.55],
  });

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: "#3A3A3A", opacity },
        style,
      ]}
    />
  );
};

// A skeleton card mimicking an event card
const SkeletonEventCard: React.FC = () => (
  <View style={styles.card}>
    {/* Poster image placeholder */}
    <SkeletonBlock height={160} borderRadius={12} />
    <View style={styles.cardBody}>
      {/* Title */}
      <SkeletonBlock width="70%" height={18} style={{ marginBottom: 10 }} />
      {/* Subtitle row */}
      <View style={styles.row}>
        <SkeletonBlock width={20} height={14} borderRadius={4} />
        <SkeletonBlock width="50%" height={14} borderRadius={4} style={{ marginLeft: 8 }} />
      </View>
      {/* Date row */}
      <View style={[styles.row, { marginTop: 8 }]}>
        <SkeletonBlock width={20} height={14} borderRadius={4} />
        <SkeletonBlock width="40%" height={14} borderRadius={4} style={{ marginLeft: 8 }} />
      </View>
    </View>
  </View>
);

// Full-page skeleton that mimics the events list layout
const SkeletonLoader: React.FC = () => (
  <View style={styles.container}>
    {/* Header bar */}
    <View style={styles.header}>
      <SkeletonBlock width={120} height={28} borderRadius={8} />
      <SkeletonBlock width={36} height={36} borderRadius={18} />
    </View>

    {/* Search bar */}
    <SkeletonBlock height={44} borderRadius={10} style={{ marginHorizontal: 16, marginBottom: 20 }} />

    {/* Category chips */}
    <View style={styles.chips}>
      {[80, 90, 70, 100, 75].map((w, i) => (
        <SkeletonBlock key={i} width={w} height={32} borderRadius={16} style={{ marginRight: 10 }} />
      ))}
    </View>

    {/* Event cards */}
    <SkeletonEventCard />
    <SkeletonEventCard />
    <SkeletonEventCard />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    paddingTop: 52,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  chips: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    overflow: "hidden",
  },
  cardBody: {
    padding: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export default SkeletonLoader;
