import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import ChatsScreen from "@/screens/ChatsScreen";
import ChatScreen from "@/screens/ChatScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";

export type ChatsStackParamList = {
  ChatsList: undefined;
  Chat: { chatId: string; name: string };
};

const Stack = createNativeStackNavigator<ChatsStackParamList>();

export default function ChatsStackNavigator() {
  const screenOptions = useScreenOptions();
  const opaqueOptions = useScreenOptions({ transparent: false });
  const { theme } = useTheme();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="ChatsList"
        component={ChatsScreen}
        options={{
          headerTitle: () => <HeaderTitle title="TempoChat" />,
          headerRight: () => (
            <Pressable style={{ padding: 8 }}>
              <Feather name="search" size={22} color={theme.text} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({
          ...opaqueOptions,
          headerTitle: route.params.name,
          headerRight: () => (
            <Pressable style={{ padding: 8 }}>
              <Feather name="dollar-sign" size={20} color={theme.primary} />
            </Pressable>
          ),
        })}
      />
    </Stack.Navigator>
  );
}
