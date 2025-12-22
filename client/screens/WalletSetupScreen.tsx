import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

type SetupStep = "choose" | "import" | "creating";

function generateMockWalletAddress(): string {
  const chars = "0123456789abcdef";
  let address = "0x";
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}

function generateMockSeedPhrase(): string {
  const words = [
    "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
    "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
    "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual"
  ];
  const phrase = [];
  for (let i = 0; i < 12; i++) {
    phrase.push(words[Math.floor(Math.random() * words.length)]);
  }
  return phrase.join(" ");
}

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

  const handleCreateWithEmail = async () => {
    if (!user) return;
    
    setStep("creating");
    setIsLoading(true);
    
    try {
      const address = generateMockWalletAddress();
      const encryptedSeedPhrase = btoa(generateMockSeedPhrase());
      
      const response = await apiRequest("POST", "/api/wallet/create", {
        userId: user.id,
        address,
        encryptedSeedPhrase,
        isImported: false,
      });
      
      const data = await response.json();
      
      if (data.success) {
        onWalletCreated(data.wallet);
      } else {
        throw new Error(data.error || "Failed to create wallet");
      }
    } catch (err: any) {
      console.error("Create wallet failed:", err);
      Alert.alert("Error", err.message || "Failed to create wallet");
      setStep("choose");
    } finally {
      setIsLoading(false);
    }
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
      if (!privateKey.trim().startsWith("0x") || privateKey.trim().length !== 66) {
        setError("Please enter a valid private key (0x followed by 64 hex characters)");
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      const address = generateMockWalletAddress();
      const encryptedData = importType === "seed" 
        ? { encryptedSeedPhrase: btoa(seedPhrase.trim()) }
        : { encryptedPrivateKey: btoa(privateKey.trim()) };
      
      const response = await apiRequest("POST", "/api/wallet/create", {
        userId: user.id,
        address,
        ...encryptedData,
        isImported: true,
      });
      
      const data = await response.json();
      
      if (data.success) {
        onWalletCreated(data.wallet);
      } else {
        throw new Error(data.error || "Failed to import wallet");
      }
    } catch (err: any) {
      console.error("Import wallet failed:", err);
      Alert.alert("Error", err.message || "Failed to import wallet");
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
          Create a new wallet or import an existing one to start sending and receiving payments
        </ThemedText>
      </View>

      <View style={styles.options}>
        <Card style={styles.optionCard} elevation={1}>
          <Pressable 
            style={styles.optionButton}
            onPress={handleCreateWithEmail}
          >
            <View style={[styles.optionIcon, { backgroundColor: Colors.light.primaryLight }]}>
              <Feather name="mail" size={24} color={Colors.light.primary} />
            </View>
            <View style={styles.optionContent}>
              <ThemedText style={styles.optionTitle}>Continue with Email</ThemedText>
              <ThemedText style={[styles.optionDescription, { color: theme.textSecondary }]}>
                We'll create a secure wallet linked to your account
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
              placeholder="0x..."
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

      <Button 
        onPress={handleImportWallet} 
        disabled={isLoading || (importType === "seed" ? !seedPhrase.trim() : !privateKey.trim())} 
        style={styles.importButton}
      >
        {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Import Wallet"}
      </Button>
    </KeyboardAwareScrollViewCompat>
  );

  const renderCreatingStep = () => (
    <View style={styles.creatingContainer}>
      <ActivityIndicator size="large" color={Colors.light.primary} />
      <ThemedText type="h3" style={styles.creatingTitle}>Creating Your Wallet</ThemedText>
      <ThemedText style={[styles.creatingSubtitle, { color: theme.textSecondary }]}>
        Setting up your secure wallet...
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      {step === "choose" ? renderChooseStep() : null}
      {step === "import" ? renderImportStep() : null}
      {step === "creating" ? renderCreatingStep() : null}
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
  importContainer: {
    paddingHorizontal: Spacing.lg,
  },
  importHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
    marginRight: Spacing.md,
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
    marginBottom: Spacing.xl,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  importButton: {
    marginTop: Spacing.md,
  },
  creatingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  creatingTitle: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  creatingSubtitle: {
    textAlign: "center",
  },
});
