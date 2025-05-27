"use client";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { VenuesStackParamList } from "../navigation/types";
import AddEventScreen from "./AddEventScreen";

type VenuesAddEventScreenProps = NativeStackScreenProps<VenuesStackParamList, "AddEvent">;

const VenuesAddEventScreen: React.FC<VenuesAddEventScreenProps> = ({ navigation, route }) => {
  return <AddEventScreen navigation={navigation} route={route} />;
};

export default VenuesAddEventScreen;