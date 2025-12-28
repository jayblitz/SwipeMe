import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ChatsScreen from "@/screens/ChatsScreen";
import ChatScreen from "@/screens/ChatScreen";
import ContactDetailsScreen from "@/screens/ContactDetailsScreen";
import { ThemedText } from "@/components/ThemedText";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ChatsStackParamList = {
  ChatsList: undefined;
  Chat: { chatId: string; name: string; peerAddress?: string; avatarId?: string; contactId?: string };
  ContactDetails: { chatId: string; name: string; peerAddress?: string; avatarId?: string; contactId?: string };
};

const Stack = createNativeStackNavigator<ChatsStackParamList>();

function ChatsHeaderLeft() {
  return (
    <View style={styles.headerLeftContainer}>
      <Image
        source={require("../../assets/images/icon.png")}
        style={styles.headerIcon}
        resizeMode="contain"
      />
    </View>
  );
}

function ChatsHeaderTitle() {
  return (
    <ThemedText style={styles.headerTitle}>Chats</ThemedText>
  );
}

export default function ChatsStackNavigator() {
  const screenOptions = useScreenOptions();
  const opaqueOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="ChatsList"
        component={ChatsScreen}
        options={{
          headerLeft: () => <ChatsHeaderLeft />,
          headerTitle: () => <ChatsHeaderTitle />,
        }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={({ route }) => ({
          ...opaqueOptions,
          headerTitle: route.params.name,
        })}
      />
      <Stack.Screen
        name="ContactDetails"
        component={ContactDetailsScreen}
        options={({ route }) => ({
          ...opaqueOptions,
          headerTitle: route.params.name,
        })}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  headerLeftContainer: {
    marginRight: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  headerButton: {
    padding: 8,
  },
});
