import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MomentsScreen from "@/screens/MomentsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type MomentsStackParamList = {
  MomentsList: undefined;
};

const Stack = createNativeStackNavigator<MomentsStackParamList>();

export default function MomentsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="MomentsList"
        component={MomentsScreen}
        options={{ headerTitle: "Moments" }}
      />
    </Stack.Navigator>
  );
}
