import React from "react";
import { StyleSheet } from "react-native";
import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { WalletProvider } from "@/contexts/WalletContext";
import { XMTPProvider } from "@/contexts/XMTPContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { ThemeProvider } from "@/hooks/useTheme";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { NotificationHandler } from "@/components/NotificationHandler";

const prefix = Linking.createURL("/");
const domain = process.env.EXPO_PUBLIC_DOMAIN || "";

type RootParamList = {
  Main: undefined;
  Auth: undefined;
};

const getLinkingPrefixes = () => {
  const prefixes = [prefix, "swipeme://"];
  if (domain) {
    prefixes.push(`https://${domain}`);
  }
  return prefixes;
};

const linking: LinkingOptions<RootParamList> = {
  prefixes: getLinkingPrefixes(),
  config: {
    screens: {
      Main: {
        screens: {
          MomentsTab: {
            screens: {
              Feed: "moments",
              MomentView: "moments/:postId",
            },
          },
          ChatsTab: "chats",
          WalletTab: "wallet",
          DiscoverTab: "discover",
          ProfileTab: "profile",
        },
      },
      Auth: "auth",
    },
  },
};

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationProvider>
            <WalletProvider>
              <XMTPProvider>
                <RealtimeProvider>
                  <ThemeProvider>
                    <SafeAreaProvider>
                      <GestureHandlerRootView style={styles.root}>
                        <KeyboardProvider>
                          <NavigationContainer linking={linking}>
                            <NotificationHandler />
                            <RootStackNavigator />
                          </NavigationContainer>
                          <StatusBar style="auto" />
                        </KeyboardProvider>
                      </GestureHandlerRootView>
                    </SafeAreaProvider>
                  </ThemeProvider>
                </RealtimeProvider>
              </XMTPProvider>
            </WalletProvider>
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
