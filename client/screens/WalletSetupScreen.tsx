import "react-native-get-random-values";
import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
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
import { generateMnemonic, english, mnemonicToAccount } from "viem/accounts";

type SetupStep = "choose" | "creating" | "showPhrase" | "import";

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
  const [generatedPhrase, setGeneratedPhrase] = useState("");
  const [generatedAddress, setGeneratedAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [importType, setImportType] = useState<"seed" | "private">("seed");
  const [phraseConfirmed, setPhraseConfirmed] = useState(false);

  const handleCreateNewWallet = async () => {
    if (!user) return;
    
    setStep("creating");
    setIsLoading(true);
    
    try {
      const mnemonic = generateMnemonic(english);
      const account = mnemonicToAccount(mnemonic);
      
      setGeneratedPhrase(mnemonic);
      setGeneratedAddress(account.address);
      setStep("showPhrase");
    } catch (err: any) {
      console.error("Create wallet failed:", err);
      Alert.alert("Error", "Failed to generate wallet. Please try again.");
      setStep("choose");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAndSaveWallet = async () => {
    if (!user || !generatedPhrase) return;
    
    setIsLoading(true);
    
    try {
      const response = await apiRequest("POST", "/api/wallet/import", {
        userId: user.id,
        seedPhrase: generatedPhrase,
      });
      
      const data = await response.json();
      
      if (data.success) {
        onWalletCreated(data.wallet);
      } else {
        throw new Error(data.error || "Failed to save wallet");
      }
    } catch (err: any) {
      console.error("Save wallet failed:", err);
      Alert.alert("Error", err.message || "Failed to save wallet to your account");
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
            onPress={handleCreateNewWallet}
          >
            <View style={[styles.optionIcon, { backgroundColor: Colors.light.primaryLight }]}>
              <Feather name="plus-circle" size={24} color={Colors.light.primary} />
            </View>
            <View style={styles.optionContent}>
              <ThemedText style={styles.optionTitle}>Create New Wallet</ThemedText>
              <ThemedText style={[styles.optionDescription, { color: theme.textSecondary }]}>
                Generate a new secure wallet with recovery phrase
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

  const renderCreatingStep = () => (
    <View style={styles.creatingContainer}>
      <ActivityIndicator size="large" color={Colors.light.primary} />
      <ThemedText style={styles.creatingText}>Generating your secure wallet...</ThemedText>
    </View>
  );

  const renderShowPhraseStep = () => {
    const words = generatedPhrase.split(" ");
    
    return (
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.phraseContainer,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        <View style={styles.phraseHeader}>
          <Pressable 
            onPress={() => {
              setStep("choose");
              setGeneratedPhrase("");
              setGeneratedAddress("");
              setPhraseConfirmed(false);
            }} 
            style={styles.backButton}
          >
            <Feather name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <ThemedText type="h3">Your Recovery Phrase</ThemedText>
        </View>

        <View style={[styles.successBadge, { backgroundColor: Colors.light.successLight }]}>
          <Feather name="check-circle" size={20} color={Colors.light.success} />
          <ThemedText style={[styles.successText, { color: Colors.light.success }]}>
            Wallet Created Successfully
          </ThemedText>
        </View>

        <View style={[styles.addressCard, { backgroundColor: theme.backgroundSecondary }]}>
          <ThemedText style={[styles.addressLabel, { color: theme.textSecondary }]}>
            Your wallet address
          </ThemedText>
          <ThemedText style={styles.addressText} numberOfLines={1}>
            {generatedAddress}
          </ThemedText>
        </View>

        <View style={styles.warningCard}>
          <Feather name="alert-triangle" size={20} color={Colors.light.warning} />
          <ThemedText style={[styles.warningText, { color: theme.textSecondary }]}>
            Write down these 12 words in order and store them securely. This is the only way to recover your wallet if you lose access.
          </ThemedText>
        </View>

        <View style={styles.wordsGrid}>
          {words.map((word, index) => (
            <View key={index} style={[styles.wordItem, { backgroundColor: theme.backgroundSecondary }]}>
              <ThemedText style={[styles.wordNumber, { color: theme.textSecondary }]}>{index + 1}</ThemedText>
              <ThemedText style={styles.wordText}>{word}</ThemedText>
            </View>
          ))}
        </View>

        <Pressable 
          style={styles.confirmCheckbox}
          onPress={() => setPhraseConfirmed(!phraseConfirmed)}
        >
          <View style={[
            styles.checkbox, 
            { 
              backgroundColor: phraseConfirmed ? Colors.light.primary : "transparent",
              borderColor: phraseConfirmed ? Colors.light.primary : theme.border,
            }
          ]}>
            {phraseConfirmed ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
          </View>
          <ThemedText style={[styles.confirmText, { color: theme.textSecondary }]}>
            I have saved my recovery phrase securely
          </ThemedText>
        </Pressable>

        <Button 
          onPress={handleConfirmAndSaveWallet} 
          disabled={!phraseConfirmed || isLoading}
          style={styles.continueButton}
        >
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Continue to Wallet"}
        </Button>
      </KeyboardAwareScrollViewCompat>
    );
  };

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
    <ThemedView style={[styles.container, { paddingTop: step === "choose" || step === "creating" ? insets.top + Spacing.xl : insets.top + Spacing.md }]}>
      {step === "choose" ? renderChooseStep() : null}
      {step === "creating" ? renderCreatingStep() : null}
      {step === "showPhrase" ? renderShowPhraseStep() : null}
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
  creatingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  creatingText: {
    marginTop: Spacing.lg,
    fontSize: 16,
  },
  phraseContainer: {
    paddingHorizontal: Spacing.lg,
  },
  phraseHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  successText: {
    fontWeight: "600",
  },
  addressCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  addressLabel: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  addressText: {
    fontFamily: "monospace",
    fontSize: 14,
  },
  wordsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  wordItem: {
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
    width: 20,
    textAlign: "center",
  },
  wordText: {
    fontSize: 14,
    fontWeight: "500",
  },
  confirmCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    flex: 1,
    fontSize: 14,
  },
  continueButton: {
    marginTop: Spacing.md,
  },
});
