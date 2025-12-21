import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import WalletScreen from "@/screens/WalletScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type WalletStackParamList = {
  WalletMain: undefined;
};

const Stack = createNativeStackNavigator<WalletStackParamList>();

export default function WalletStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="WalletMain"
        component={WalletScreen}
        options={{
          headerTitle: "Wallet",
        }}
      />
    </Stack.Navigator>
  );
}
