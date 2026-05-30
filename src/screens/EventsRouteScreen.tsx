import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import EventsScreen from "./EventsScreen";
import EventDetailScreen from "./EventDetailScreen";
import SupabaseService from "../services/SupabaseService";

const EventDetailScreenCompat = EventDetailScreen as any;

const CURATED_EVENT_SEARCH_TERMS: Record<string, string> = {
  kampala: "kampala",
  entebbe: "entebbe",
  entebe: "entebbe",
  mukono: "mukono",
  jinja: "jinja",
  wakiso: "wakiso",
  mbarara: "mbarara",
  gulu: "gulu",

  "king-saha": "king saha",
  kingsaha: "king saha",

  "jose-chameleone": "jose chameleone",
  chameleon: "jose chameleone",
  chameleone: "jose chameleone",

  "karole-kasita": "karole kasita",
  "carol-kasita": "karole kasita",

  "bobi-wine": "bobi wine",
  "bebe-cool": "bebe cool",
  "eddy-kenzo": "eddy kenzo",
  "fik-fameica": "fik fameica",
  "sheebah-karungi": "sheebah karungi",
  sheebah: "sheebah karungi",
  "spice-diana": "spice diana",
  "lydia-jazmine": "lydia jazmine",
  "winnie-nwagi": "winnie nwagi",
  "vinka": "vinka",
  "rema-namakula": "rema namakula",
  rema: "rema namakula",
  "azawi": "azawi",
  "pallaso": "pallaso",
  "gravity-omutujju": "gravity omutujju",
  gravity: "gravity omutujju",
  "john-blaq": "john blaq",
  "navio": "navio",
  "ray-g": "ray g",
  "levixone": "levixone",
  "juliana-kanyomozi": "juliana kanyomozi",
  juliana: "juliana kanyomozi",
  "irene-ntale": "irene ntale",
  "apass": "a pass",
  "a-pass": "a pass",
  "ykee-benda": "ykee benda",
  "mun-g": "mun g",
  "chosen-becky": "chosen becky",
  "david-lutalo": "david lutalo",
  "grace-nakimera": "grace nakimera",
  "joseph-ngooma": "joseph ngooma",
  "karole-kasita-live": "karole kasita",
};

type Props = {
  eventId?: string;
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

const EventsRouteScreen: React.FC<Props> = ({ eventId, navigation, route }) => {
  const normalizedTerm = useMemo(() => normalizeSlugTerm(eventId || ""), [eventId]);

  const [loading, setLoading] = useState(true);
  const [shouldRenderDetail, setShouldRenderDetail] = useState(false);

  const forcedSearchQuery = useMemo(() => {
    if (!normalizedTerm) return "";
    const curated = CURATED_EVENT_SEARCH_TERMS[normalizedTerm];
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

      // Curated location/artist terms always open the filtered events list.
      if (CURATED_EVENT_SEARCH_TERMS[normalizedTerm]) {
        if (mounted) {
          setShouldRenderDetail(false);
          setLoading(false);
        }
        return;
      }

      try {
        const event = await SupabaseService.getEventById(normalizedTerm);
        if (mounted) {
          setShouldRenderDetail(!!event);
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
    return <EventDetailScreenCompat navigation={navigation} route={route} />;
  }

  return <EventsScreen initialSearchQuery={forcedSearchQuery} />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default EventsRouteScreen;
