import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "@/screens/ProfileScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import RecoveryPhraseScreen from "@/screens/RecoveryPhraseScreen";
import CreatorEarningsScreen from "@/screens/CreatorEarningsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  ProfileMain: undefined;
  Settings: undefined;
  RecoveryPhrase: undefined;
  CreatorEarnings: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  const screenOptions = useScreenOptions();
  const opaqueOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{
          headerTitle: "Profile",
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          ...opaqueOptions,
          headerTitle: "Settings",
        }}
      />
      <Stack.Screen
        name="RecoveryPhrase"
        component={RecoveryPhraseScreen}
        options={{
          ...opaqueOptions,
          headerTitle: "Recovery Phrase",
        }}
      />
      <Stack.Screen
        name="CreatorEarnings"
        component={CreatorEarningsScreen}
        options={{
          ...opaqueOptions,
          headerTitle: "Creator Earnings",
        }}
      />
    </Stack.Navigator>
  );
}
