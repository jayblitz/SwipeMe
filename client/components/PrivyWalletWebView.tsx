import React, { useRef, useCallback } from "react";
import { View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { getApiUrl } from "@/lib/query-client";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "./ThemedText";

interface PrivyAuthData {
  userId: string;
  email: string | null;
  walletAddress: string | null;
  accessToken: string;
  chainId: number;
}

interface PrivyWalletWebViewProps {
  onAuthenticated: (data: PrivyAuthData) => void;
  onComplete: (data: PrivyAuthData) => void;
  onLogout: () => void;
  onError?: (error: string) => void;
}

export default function PrivyWalletWebView({
  onAuthenticated,
  onComplete,
  onLogout,
  onError,
}: PrivyWalletWebViewProps) {
  const webViewRef = useRef<WebView>(null!);
  const { theme } = useTheme();

  const privyUrl = `${getApiUrl()}/privy-wallet`;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        const { type, data } = message;

        switch (type) {
          case "authenticated":
            onAuthenticated(data as PrivyAuthData);
            break;
          case "complete":
            onComplete(data as PrivyAuthData);
            break;
          case "logout":
            onLogout();
            break;
          case "error":
            onError?.(data.message || "Unknown error");
            break;
          default:
            console.log("Unknown message type:", type);
        }
      } catch (error) {
        console.error("Failed to parse WebView message:", error);
      }
    },
    [onAuthenticated, onComplete, onLogout, onError]
  );

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
        <ThemedText style={styles.webFallback}>
          Wallet setup requires Expo Go on your mobile device.
        </ThemedText>
        <ThemedText style={styles.webFallbackSub}>
          Scan the QR code to open this app in Expo Go.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: privyUrl }}
        onMessage={handleMessage}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={[styles.loading, { backgroundColor: theme.backgroundDefault }]}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText style={styles.loadingText}>
              Loading wallet service...
            </ThemedText>
          </View>
        )}
        onError={(syntheticEvent: { nativeEvent: { description: string } }) => {
          const { nativeEvent } = syntheticEvent;
          console.error("WebView error:", nativeEvent);
          onError?.("Failed to load wallet service");
        }}
        onHttpError={(syntheticEvent: { nativeEvent: { statusCode: number } }) => {
          const { nativeEvent } = syntheticEvent;
          console.error("WebView HTTP error:", nativeEvent.statusCode);
          onError?.(`HTTP error: ${nativeEvent.statusCode}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    opacity: 0.7,
  },
  webFallback: {
    fontSize: 16,
    textAlign: "center",
    marginHorizontal: 32,
    marginTop: 100,
  },
  webFallbackSub: {
    fontSize: 14,
    textAlign: "center",
    marginHorizontal: 32,
    marginTop: 12,
    opacity: 0.6,
  },
});
