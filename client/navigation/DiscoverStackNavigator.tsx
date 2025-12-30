import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import DiscoverScreen from "@/screens/DiscoverScreen";
import AIAssistantScreen from "@/screens/AIAssistantScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type DiscoverStackParamList = {
  DiscoverMain: undefined;
  AIAssistant: undefined;
};

const Stack = createNativeStackNavigator<DiscoverStackParamList>();

export default function DiscoverStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="DiscoverMain"
        component={DiscoverScreen}
        options={{
          headerTitle: "Discover",
        }}
      />
      <Stack.Screen
        name="AIAssistant"
        component={AIAssistantScreen}
        options={{
          headerTitle: "AI Assistant",
        }}
      />
    </Stack.Navigator>
  );
}
