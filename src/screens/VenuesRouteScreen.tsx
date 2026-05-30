import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import VenuesScreen from "./VenuesScreen";
import VenueDetailScreen from "./VenueDetailScreen";
import SupabaseService from "../services/SupabaseService";

const CURATED_VENUE_LOCATION_TERMS: Record<string, string> = {
  kampala: "kampala",
  entebbe: "entebbe",
  entebe: "entebbe",
  mukono: "mukono",
  jinja: "jinja",
  wakiso: "wakiso",
  mbarara: "mbarara",
  gulu: "gulu",
};

type Props = {
  venueId?: string;
  navigation?: any;
  route?: any;
};

const normalizeSlugTerm = (value: string) =>
  decodeURIComponent(value || "")
    .trim()
    .toLowerCase();

const slugToSearchText = (value: string) =>
  value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const VenuesRouteScreen: React.FC<Props> = ({ venueId, navigation, route }) => {
  const normalizedTerm = useMemo(() => normalizeSlugTerm(venueId || ""), [venueId]);

  const [loading, setLoading] = useState(true);
  const [shouldRenderDetail, setShouldRenderDetail] = useState(false);

  const forcedSearchQuery = useMemo(() => {
    if (!normalizedTerm) return "";
    const curated = CURATED_VENUE_LOCATION_TERMS[normalizedTerm];
    return curated || slugToSearchText(normalizedTerm);
  }, [normalizedTerm]);

  useEffect(() => {
    let mounted = true;

    const resolve = async () => {
      if (!normalizedTerm) {
        if (mounted) {
          setShouldRenderDetail(false);
          setLoading(false);
        }
        return;
      }

      // Curated location terms always open the filtered venues list.
      if (CURATED_VENUE_LOCATION_TERMS[normalizedTerm]) {
        if (mounted) {
          setShouldRenderDetail(false);
          setLoading(false);
        }
        return;
      }

      try {
        const venue = await SupabaseService.getVenueBySlug(normalizedTerm);
        if (mounted) {
          setShouldRenderDetail(!!venue);
        }
      } catch {
        if (mounted) {
          setShouldRenderDetail(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    resolve();

    return () => {
      mounted = false;
    };
  }, [normalizedTerm]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  if (shouldRenderDetail) {
    return <VenueDetailScreen navigation={navigation} route={route} />;
  }

  return <VenuesScreen initialSearchQuery={forcedSearchQuery} />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default VenuesRouteScreen;
