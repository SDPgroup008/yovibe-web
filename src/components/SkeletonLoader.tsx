import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from "react-native";

export type SkeletonVariant = "list" | "detail" | "checkout" | "dashboard" | "table" | "gallery";

type SkeletonBlockProps = { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> };
const Block = ({ width = "100%", height = 16, radius = 8, style }: SkeletonBlockProps) => (
  <View style={[styles.block, { width, height, borderRadius: radius }, style]} />
);
const Lines = ({ lines = 2 }: { lines?: number }) => <View style={styles.lines}>{Array.from({ length: lines }, (_, index) => <Block key={index} width={index === lines - 1 ? "56%" : "100%"} height={14} />)}</View>;
const ListCards = ({ columns }: { columns: number }) => <View style={[styles.grid, columns > 1 && styles.gridWide]}>{Array.from({ length: columns === 1 ? 4 : 6 }, (_, index) => <View key={index} style={[styles.card, columns > 1 && styles.cardWide]}><Block height={columns === 1 ? 172 : 150} radius={12} /><View style={styles.cardBody}><Block width="72%" height={18} /><Lines /></View></View>)}</View>;
const Detail = ({ desktop, tablet }: { desktop: boolean; tablet: boolean }) => <View style={[styles.detailLayout, desktop && styles.detailDesktop, tablet && styles.detailTablet]}><View style={styles.detailMain}><Block height={desktop ? 300 : 220} radius={16} /><View style={styles.detailContent}><Block width="62%" height={30} /><Lines lines={3} /><Block width="100%" height={48} radius={12} style={styles.sectionGap} /><Block width="100%" height={150} radius={12} /></View></View>{(desktop || tablet) && <View style={styles.detailAside}><Block width="55%" height={20} /><View style={styles.asideCard}><Lines lines={3} /></View><View style={styles.asideCard}><Lines lines={3} /></View></View>}</View>;
const Checkout = ({ desktop, tablet }: { desktop: boolean; tablet: boolean }) => <View style={[styles.checkoutLayout, (desktop || tablet) && styles.checkoutWide]}><View style={styles.checkoutMain}><Block width="44%" height={24} /><View style={styles.ticketRows}>{[0, 1, 2].map(item => <Block key={item} height={72} radius={12} />)}</View><Block width="40%" height={22} style={styles.sectionGap} /><Block height={126} radius={12} /><Block width="48%" height={22} style={styles.sectionGap} /><Block height={96} radius={12} /></View>{(desktop || tablet) && <View style={styles.checkoutAside}><Block height={230} radius={14} /><Block height={48} radius={12} style={styles.sectionGap} /></View>}</View>;
const Dashboard = ({ table, gallery, columns }: { table?: boolean; gallery?: boolean; columns: number }) => gallery ? <ListCards columns={columns} /> : <View><View style={[styles.metricRow, columns > 1 && styles.metricRowWide]}>{Array.from({ length: columns === 1 ? 2 : 4 }, (_, index) => <Block key={index} height={92} radius={14} style={styles.metric} />)}</View><Block width="40%" height={24} style={styles.sectionGap} />{table ? <View style={styles.table}>{Array.from({ length: 6 }, (_, index) => <Block key={index} height={48} radius={6} style={styles.tableRow} />)}</View> : <ListCards columns={columns} />}</View>;

/** Responsive initial-content placeholder with one shared pulse loop per screen. */
export const ResponsiveSkeleton: React.FC<{ variant?: SkeletonVariant; style?: StyleProp<ViewStyle> }> = ({ variant = "list", style }) => {
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const tablet = width >= 768 && !desktop;
  const columns = desktop ? 3 : tablet ? 2 : 1;
  const pulse = useRef(new Animated.Value(0.42)).current;
  useEffect(() => { const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 0.72, duration: 850, useNativeDriver: false }), Animated.timing(pulse, { toValue: 0.42, duration: 850, useNativeDriver: false })])); animation.start(); return () => animation.stop(); }, [pulse]);
  const content = useMemo(() => {
    if (variant === "detail") return <Detail desktop={desktop} tablet={tablet} />;
    if (variant === "checkout") return <Checkout desktop={desktop} tablet={tablet} />;
    if (variant === "dashboard") return <Dashboard columns={columns} />;
    if (variant === "table") return <Dashboard columns={columns} table />;
    if (variant === "gallery") return <Dashboard columns={columns} gallery />;
    return <ListCards columns={columns} />;
  }, [columns, desktop, tablet, variant]);
  return <View style={[styles.container, style]} accessibilityRole="progressbar" accessibilityLabel="Loading content"><Animated.View style={{ opacity: pulse }}>{content}</Animated.View></View>;
};

const SkeletonLoader: React.FC = () => <ResponsiveSkeleton variant="list" />;
export default SkeletonLoader;

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 360, backgroundColor: "#0B1020", padding: 16 }, block: { backgroundColor: "#26314A" }, lines: { gap: 9, marginTop: 14 }, grid: { gap: 16 }, gridWide: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" }, card: { width: "100%", overflow: "hidden", borderRadius: 14, backgroundColor: "#111A2E", borderWidth: 1, borderColor: "#1C2942" }, cardWide: { flexBasis: "31.8%", flexGrow: 1, minWidth: 230 }, cardBody: { padding: 14 }, detailLayout: { gap: 16 }, detailDesktop: { flexDirection: "row", maxWidth: 1320, alignSelf: "center", width: "100%" }, detailTablet: { flexDirection: "row" }, detailMain: { flex: 1, minWidth: 0 }, detailAside: { width: 310, gap: 14, padding: 14, borderRadius: 14, backgroundColor: "#111A2E" }, detailContent: { paddingTop: 18 }, asideCard: { padding: 12, borderRadius: 10, backgroundColor: "#17223A" }, checkoutLayout: { gap: 18 }, checkoutWide: { flexDirection: "row", maxWidth: 1220, alignSelf: "center", width: "100%" }, checkoutMain: { flex: 1, minWidth: 0 }, checkoutAside: { width: 320 }, ticketRows: { gap: 10, marginTop: 14 }, sectionGap: { marginTop: 22 }, metricRow: { gap: 12 }, metricRowWide: { flexDirection: "row", flexWrap: "wrap" }, metric: { flexGrow: 1, minWidth: 150 }, table: { marginTop: 14, gap: 8 }, tableRow: { width: "100%" },
});
