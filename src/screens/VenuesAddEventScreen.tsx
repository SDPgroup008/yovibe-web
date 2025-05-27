"use client";

import type { AddEventScreenProps } from "../navigation/types";
import type { VenuesStackParamList } from "../navigation/types";
import AddEventScreen from "./AddEventScreen";

const VenuesAddEventScreen: React.FC<AddEventScreenProps<VenuesStackParamList>> = ({ navigation, route }) => {
  return <AddEventScreen navigation={navigation} route={route} />;
};

export default VenuesAddEventScreen;