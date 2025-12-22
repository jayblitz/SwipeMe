import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import PrivyWalletWebView from "@/components/PrivyWalletWebView";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type SetupStep = "choose" | "privy" | "import" | "creating";

interface WalletSetupScreenProps {
  onWalletCreated: (wallet: { address: string }) => void;
}

export default function WalletSetupScreen({ onWalletCreated }: WalletSetupScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  
  const [step, setStep] = useState<SetupStep>("choose");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [importType, setImportType] = useState<"seed" | "private">("seed");

  const handlePrivyAuthenticated = async (data: {
    userId: string;
    email: string | null;
    walletAddress: string | null;
    accessToken: string;
    chainId: number;
  }) => {
    console.log("Privy authenticated:", data);
    
    if (Platform.OS !== "web") {
      try {
        await SecureStore.setItemAsync("privy_access_token", data.accessToken);
        await SecureStore.setItemAsync("privy_user_id", data.userId);
      } catch (err) {
        console.error("Failed to store Privy credentials:", err);
      }
    }
  };

  const handlePrivyComplete = async (data: {
    userId: string;
    email: string | null;
    walletAddress: string | null;
    accessToken: string;
    chainId: number;
  }) => {
    if (!user || !data.walletAddress) {
      Alert.alert("Error", "Failed to get wallet address");
      setStep("choose");
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/wallet/privy", {
        userId: user.id,
        privyUserId: data.userId,
        walletAddress: data.walletAddress,
        accessToken: data.accessToken,
      });

      const result = await response.json();

      if (result.success) {
        onWalletCreated(result.wallet);
      } else {
        throw new Error(result.error || "Failed to link wallet");
      }
    } catch (err: any) {
      console.error("Link wallet failed:", err);
      Alert.alert("Error", err.message || "Failed to link wallet to your account");
      setStep("choose");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrivyLogout = () => {
    setStep("choose");
  };

  const handlePrivyError = (errorMessage: string) => {
    Alert.alert("Wallet Error", errorMessage);
    setStep("choose");
  };

  const handleImportWallet = async () => {
    if (!user) return;
    
    setError("");
    
    if (importType === "seed") {
      const words = seedPhrase.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        setError("Please enter a valid 12 or 24 word seed phrase");
        return;
      }
    } else {
      const key = privateKey.trim();
      const normalizedKey = key.startsWith("0x") ? key : `0x${key}`;
      if (normalizedKey.length !== 66) {
        setError("Please enter a valid private key (64 hex characters, optionally with 0x prefix)");
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      const importData = importType === "seed" 
        ? { seedPhrase: seedPhrase.trim() }
        : { privateKey: privateKey.trim() };
      
      const response = await apiRequest("POST", "/api/wallet/import", {
        userId: user.id,
        ...importData,
      });
      
      const data = await response.json();
      
      if (data.success) {
        onWalletCreated(data.wallet);
      } else {
        throw new Error(data.error || "Failed to import wallet");
      }
    } catch (err: any) {
      console.error("Import wallet failed:", err);
      const errorMsg = err.message || "Failed to import wallet";
      if (errorMsg.includes("Invalid")) {
        setError(errorMsg);
      } else {
        Alert.alert("Error", errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderChooseStep = () => (
    <View style={styles.chooseContainer}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: Colors.light.primaryLight }]}>
          <Feather name="credit-card" size={40} color={Colors.light.primary} />
        </View>
        <ThemedText type="h2" style={styles.title}>Set Up Your Wallet</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
          Create a new wallet or import an existing one to start sending and receiving payments on Tempo
        </ThemedText>
      </View>

      <View style={styles.options}>
        <Card style={styles.optionCard} elevation={1}>
          <Pressable 
            style={styles.optionButton}
            onPress={() => setStep("privy")}
          >
            <View style={[styles.optionIcon, { backgroundColor: Colors.light.primaryLight }]}>
              <Feather name="mail" size={24} color={Colors.light.primary} />
            </View>
            <View style={styles.optionContent}>
              <ThemedText style={styles.optionTitle}>Continue with Email</ThemedText>
              <ThemedText style={[styles.optionDescription, { color: theme.textSecondary }]}>
                Create a secure wallet linked to your email via Privy
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={24} color={theme.textSecondary} />
          </Pressable>
        </Card>

        <Card style={styles.optionCard} elevation={1}>
          <Pressable 
            style={styles.optionButton}
            onPress={() => setStep("import")}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="download" size={24} color={theme.text} />
            </View>
            <View style={styles.optionContent}>
              <ThemedText style={styles.optionTitle}>Import Wallet</ThemedText>
              <ThemedText style={[styles.optionDescription, { color: theme.textSecondary }]}>
                Use your existing seed phrase or private key
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={24} color={theme.textSecondary} />
          </Pressable>
        </Card>
      </View>

      <View style={styles.features}>
        <View style={styles.featureItem}>
          <Feather name="shield" size={16} color={theme.success} />
          <ThemedText style={[styles.featureText, { color: theme.textSecondary }]}>Self-custodial</ThemedText>
        </View>
        <View style={styles.featureItem}>
          <Feather name="lock" size={16} color={theme.success} />
          <ThemedText style={[styles.featureText, { color: theme.textSecondary }]}>Encrypted storage</ThemedText>
        </View>
        <View style={styles.featureItem}>
          <Feather name="key" size={16} color={theme.success} />
          <ThemedText style={[styles.featureText, { color: theme.textSecondary }]}>You own your keys</ThemedText>
        </View>
      </View>

      <View style={styles.networkBadge}>
        <View style={styles.networkDot} />
        <ThemedText style={[styles.networkText, { color: theme.textSecondary }]}>
          Tempo Testnet
        </ThemedText>
      </View>
    </View>
  );

  const renderPrivyStep = () => (
    <View style={styles.privyContainer}>
      <View style={styles.privyHeader}>
        <Pressable onPress={() => setStep("choose")} style={styles.backButton}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Create Wallet</ThemedText>
        <View style={{ width: 40 }} />
      </View>
      
      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <ThemedText style={styles.loadingText}>Linking wallet to your account...</ThemedText>
        </View>
      ) : (
        <PrivyWalletWebView
          onAuthenticated={handlePrivyAuthenticated}
          onComplete={handlePrivyComplete}
          onLogout={handlePrivyLogout}
          onError={handlePrivyError}
        />
      )}
    </View>
  );

  const renderImportStep = () => (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={[
        styles.importContainer,
        { paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      <View style={styles.importHeader}>
        <Pressable onPress={() => setStep("choose")} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <ThemedText type="h3">Import Wallet</ThemedText>
      </View>

      <View style={styles.importTypeSelector}>
        <Pressable
          style={[
            styles.importTypeButton,
            { backgroundColor: importType === "seed" ? Colors.light.primary : theme.backgroundDefault },
          ]}
          onPress={() => { setImportType("seed"); setError(""); }}
        >
          <ThemedText style={{ color: importType === "seed" ? "#FFFFFF" : theme.text }}>
            Seed Phrase
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.importTypeButton,
            { backgroundColor: importType === "private" ? Colors.light.primary : theme.backgroundDefault },
          ]}
          onPress={() => { setImportType("private"); setError(""); }}
        >
          <ThemedText style={{ color: importType === "private" ? "#FFFFFF" : theme.text }}>
            Private Key
          </ThemedText>
        </Pressable>
      </View>

      {importType === "seed" ? (
        <View style={styles.inputSection}>
          <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>
            Enter your 12 or 24 word recovery phrase
          </ThemedText>
          <View style={[styles.textAreaContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
            <TextInput
              style={[styles.textArea, { color: theme.text }]}
              placeholder="word1 word2 word3..."
              placeholderTextColor={theme.textSecondary}
              value={seedPhrase}
              onChangeText={(text) => { setSeedPhrase(text); setError(""); }}
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      ) : (
        <View style={styles.inputSection}>
          <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>
            Enter your private key
          </ThemedText>
          <View style={[styles.textAreaContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
            <TextInput
              style={[styles.textArea, { color: theme.text }]}
              placeholder="0x... or paste without 0x prefix"
              placeholderTextColor={theme.textSecondary}
              value={privateKey}
              onChangeText={(text) => { setPrivateKey(text); setError(""); }}
              multiline
              numberOfLines={2}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      )}

      {error ? (
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={16} color={Colors.light.error} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : null}

      <View style={styles.warningCard}>
        <Feather name="alert-triangle" size={20} color={Colors.light.warning} />
        <ThemedText style={[styles.warningText, { color: theme.textSecondary }]}>
          Never share your seed phrase or private key with anyone. TempoChat staff will never ask for this information.
        </ThemedText>
      </View>

      <View style={styles.networkInfo}>
        <ThemedText style={[styles.networkInfoText, { color: theme.textSecondary }]}>
          Your wallet will be connected to Tempo Testnet (Chain ID: 42429)
        </ThemedText>
      </View>

      <Button 
        onPress={handleImportWallet} 
        disabled={isLoading || (importType === "seed" ? !seedPhrase.trim() : !privateKey.trim())} 
        style={styles.importButton}
      >
        {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Import Wallet"}
      </Button>
    </KeyboardAwareScrollViewCompat>
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: step === "privy" ? 0 : insets.top + Spacing.xl }]}>
      {step === "choose" ? renderChooseStep() : null}
      {step === "privy" ? renderPrivyStep() : null}
      {step === "import" ? renderImportStep() : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chooseContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 22,
  },
  options: {
    gap: Spacing.md,
  },
  optionCard: {
    padding: 0,
    overflow: "hidden",
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  optionTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
  },
  features: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginTop: Spacing["2xl"],
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  featureText: {
    fontSize: 13,
  },
  networkBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xl,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.success,
  },
  networkText: {
    fontSize: 13,
  },
  privyContainer: {
    flex: 1,
  },
  privyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.lg,
    fontSize: 14,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  importContainer: {
    paddingHorizontal: Spacing.lg,
  },
  importHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  importTypeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  importTypeButton: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  inputSection: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    marginBottom: Spacing.sm,
  },
  textAreaContainer: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.md,
    minHeight: 100,
  },
  textArea: {
    fontSize: 16,
    lineHeight: 24,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.light.error,
    fontSize: 14,
  },
  warningCard: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.light.warningLight,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  networkInfo: {
    marginBottom: Spacing.xl,
  },
  networkInfoText: {
    fontSize: 13,
    textAlign: "center",
  },
  importButton: {
    marginTop: Spacing.md,
  },
});
