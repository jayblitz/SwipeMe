import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, Alert, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

export default function RecoveryPhraseScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  
  const [isRevealed, setIsRevealed] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isImportedWallet, setIsImportedWallet] = useState(false);

  const fetchRecoveryPhrase = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    setError("");
    
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/wallet/${user.id}/recovery`, baseUrl), {
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error?.includes("imported")) {
          setIsImportedWallet(true);
          setError("Recovery phrase is not available for wallets imported with private key");
        } else if (data.error?.includes("not found")) {
          setError("No wallet found. Please set up your wallet first.");
        } else {
          setError(data.error || "Failed to fetch recovery phrase");
        }
        return;
      }
      
      if (data.encryptedSeedPhrase) {
        const decoded = atob(data.encryptedSeedPhrase);
        setRecoveryPhrase(decoded.split(" "));
      }
    } catch (err: any) {
      console.error("Fetch recovery phrase failed:", err);
      setError("Failed to load recovery phrase");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchRecoveryPhrase();
    }, [fetchRecoveryPhrase])
  );

  const authenticateAndReveal = async () => {
    if (Platform.OS === "web") {
      setIsRevealed(true);
      return;
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to view recovery phrase",
        fallbackLabel: "Use passcode",
      });

      if (result.success) {
        setIsRevealed(true);
      } else {
        Alert.alert("Authentication Failed", "Please try again to view your recovery phrase.");
      }
    } else {
      setIsRevealed(true);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(recoveryPhrase.join(" "));
    setHasCopied(true);
    Alert.alert("Copied", "Recovery phrase copied to clipboard. Store it safely and clear your clipboard.");
    setTimeout(() => setHasCopied(false), 3000);
  };

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
          Loading recovery phrase...
        </ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={[styles.container, styles.centerContainer, { paddingHorizontal: Spacing.xl }]}>
        <View style={[styles.errorIcon, { backgroundColor: isImportedWallet ? Colors.light.warningLight : Colors.light.errorLight }]}>
          <Feather 
            name={isImportedWallet ? "info" : "alert-circle"} 
            size={40} 
            color={isImportedWallet ? Colors.light.warning : Colors.light.error} 
          />
        </View>
        <ThemedText type="h4" style={styles.errorTitle}>
          {isImportedWallet ? "Recovery Phrase Unavailable" : "Error"}
        </ThemedText>
        <ThemedText style={[styles.errorMessage, { color: theme.textSecondary }]}>
          {error}
        </ThemedText>
        {isImportedWallet ? (
          <ThemedText style={[styles.errorNote, { color: theme.textSecondary }]}>
            If you imported using a seed phrase, you should have a backup of it already.
          </ThemedText>
        ) : null}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: Colors.light.warningLight }]}>
            <Feather name="alert-triangle" size={32} color={Colors.light.warning} />
          </View>
          <ThemedText type="h3" style={styles.title}>Recovery Phrase</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            This is your 12-word recovery phrase. Write it down and store it in a safe place. Never share it with anyone.
          </ThemedText>
        </View>

        <Card style={styles.warningCard} elevation={0}>
          <View style={[styles.warningContent, { backgroundColor: Colors.light.errorLight }]}>
            <Feather name="shield-off" size={20} color={Colors.light.error} />
            <View style={styles.warningText}>
              <ThemedText style={[styles.warningTitle, { color: Colors.light.error }]}>
                Keep this secret
              </ThemedText>
              <ThemedText style={[styles.warningDescription, { color: theme.textSecondary }]}>
                Anyone with your recovery phrase can access your wallet and funds.
              </ThemedText>
            </View>
          </View>
        </Card>

        {isRevealed ? (
          <Card style={styles.phraseCard} elevation={1}>
            <View style={styles.phraseGrid}>
              {recoveryPhrase.map((word, index) => (
                <View key={index} style={[styles.wordContainer, { backgroundColor: theme.backgroundDefault }]}>
                  <ThemedText style={[styles.wordNumber, { color: theme.textSecondary }]}>
                    {index + 1}
                  </ThemedText>
                  <ThemedText style={styles.wordText}>{word}</ThemedText>
                </View>
              ))}
            </View>
            
            <Pressable
              onPress={handleCopy}
              style={[styles.copyButton, { borderColor: theme.border }]}
            >
              <Feather name={hasCopied ? "check" : "copy"} size={18} color={theme.primary} />
              <ThemedText style={[styles.copyText, { color: theme.primary }]}>
                {hasCopied ? "Copied" : "Copy to Clipboard"}
              </ThemedText>
            </Pressable>
          </Card>
        ) : (
          <Card style={styles.hiddenCard} elevation={1}>
            <View style={[styles.hiddenContent, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="eye-off" size={40} color={theme.textSecondary} />
              <ThemedText style={[styles.hiddenText, { color: theme.textSecondary }]}>
                Recovery phrase is hidden
              </ThemedText>
              <ThemedText style={[styles.hiddenSubtext, { color: theme.textSecondary }]}>
                Authenticate to reveal
              </ThemedText>
            </View>
          </Card>
        )}

        <View style={styles.footer}>
          {isRevealed ? (
            <Pressable 
              onPress={() => setIsRevealed(false)}
              style={[styles.hideButton, { borderColor: theme.border }]}
            >
              <ThemedText style={[styles.hideButtonText, { color: theme.textSecondary }]}>
                Hide Recovery Phrase
              </ThemedText>
            </Pressable>
          ) : (
            <Button onPress={authenticateAndReveal}>
              Reveal Recovery Phrase
            </Button>
          )}
        </View>

        <View style={styles.tips}>
          <ThemedText style={[styles.tipsTitle, { color: theme.textSecondary }]}>
            Security Tips
          </ThemedText>
          <View style={styles.tipItem}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText style={[styles.tipText, { color: theme.textSecondary }]}>
              Write it down on paper and store offline
            </ThemedText>
          </View>
          <View style={styles.tipItem}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText style={[styles.tipText, { color: theme.textSecondary }]}>
              Never share it digitally or take screenshots
            </ThemedText>
          </View>
          <View style={styles.tipItem}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText style={[styles.tipText, { color: theme.textSecondary }]}>
              Keep multiple copies in secure locations
            </ThemedText>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  loadingText: {
    marginTop: Spacing.md,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  errorTitle: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  errorMessage: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  errorNote: {
    textAlign: "center",
    fontSize: 13,
    fontStyle: "italic",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 22,
  },
  warningCard: {
    marginBottom: Spacing.lg,
    padding: 0,
  },
  warningContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  warningText: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  warningDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  phraseCard: {
    marginBottom: Spacing.lg,
  },
  phraseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  wordContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    width: "48%",
    gap: Spacing.sm,
  },
  wordNumber: {
    fontSize: 12,
    fontWeight: "600",
    width: 20,
  },
  wordText: {
    fontSize: 14,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  copyText: {
    fontSize: 14,
    fontWeight: "500",
  },
  hiddenCard: {
    marginBottom: Spacing.lg,
  },
  hiddenContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
    borderRadius: BorderRadius.sm,
  },
  hiddenText: {
    marginTop: Spacing.md,
    fontWeight: "500",
  },
  hiddenSubtext: {
    marginTop: Spacing.xs,
    fontSize: 13,
  },
  footer: {
    marginBottom: Spacing.xl,
  },
  hideButton: {
    backgroundColor: "transparent",
    height: 48,
    borderRadius: BorderRadius.button,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hideButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  tips: {
    gap: Spacing.sm,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  tipItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  tipText: {
    fontSize: 14,
  },
});
