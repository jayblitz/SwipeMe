import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Pressable, RefreshControl, Alert, ActionSheetIOS, Platform, ActivityIndicator, Modal, ScrollView, Image, Linking, TextInput } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";

const TEMPO_FAUCET_URL = "https://docs.tempo.xyz/quickstart/faucet?tab=Fund+an+address#faucet";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet, Wallet } from "@/contexts/WalletContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Transaction, getTransactions } from "@/lib/storage";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { fetchTokenBalances, getTotalBalance, TokenBalance, TEMPO_TOKENS } from "@/lib/tempo-tokens";
import { parseApiError, ErrorCodes } from "@/lib/errors";
import { parseUnits, formatUnits } from "viem";
import WalletSetupScreen from "./WalletSetupScreen";

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface TransactionItemProps {
  transaction: Transaction;
}

function TransactionItem({ transaction }: TransactionItemProps) {
  const { theme } = useTheme();
  const isIncoming = transaction.type === "received" || transaction.type === "deposit";
  
  const getIcon = () => {
    switch (transaction.type) {
      case "received":
        return "arrow-down-left";
      case "sent":
        return "arrow-up-right";
      case "deposit":
        return "plus-circle";
      default:
        return "credit-card";
    }
  };

  return (
    <View style={styles.transactionItem}>
      {transaction.contactAvatarId ? (
        <Avatar avatarId={transaction.contactAvatarId} size={44} />
      ) : (
        <View style={[styles.transactionIcon, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name={getIcon()} size={20} color={theme.primary} />
        </View>
      )}
      <View style={styles.transactionContent}>
        <ThemedText style={styles.transactionName} numberOfLines={1}>
          {transaction.contactName || (transaction.type === "deposit" ? "Added Funds" : "Payment")}
        </ThemedText>
        <ThemedText style={[styles.transactionMemo, { color: theme.textSecondary }]} numberOfLines={1}>
          {transaction.memo}
        </ThemedText>
      </View>
      <View style={styles.transactionAmountContainer}>
        <ThemedText
          style={[
            styles.transactionAmount,
            { color: isIncoming ? theme.success : theme.text },
          ]}
        >
          {isIncoming ? "+" : "-"}${transaction.amount.toFixed(2)}
        </ThemedText>
        <ThemedText style={[styles.transactionTime, { color: theme.textSecondary }]}>
          {formatTime(transaction.timestamp)}
        </ThemedText>
      </View>
    </View>
  );
}

interface SendModalProps {
  visible: boolean;
  onClose: () => void;
  onSendViaChat: () => void;
  onScanQR: () => void;
  onEnterAddress: () => void;
}

function SendModal({ visible, onClose, onSendViaChat, onScanQR, onEnterAddress }: SendModalProps) {
  const { theme } = useTheme();

  const options = [
    { icon: "message-circle", title: "Send via Chat", subtitle: "Send to a contact in your chats", onPress: onSendViaChat },
    { icon: "maximize", title: "Scan QR Code", subtitle: "Scan recipient's wallet address", onPress: onScanQR },
    { icon: "at-sign", title: "Enter Address or Email", subtitle: "Type wallet address or email", onPress: onEnterAddress },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.sendModalContainer, { backgroundColor: theme.backgroundRoot }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sendModalHeader}>
            <ThemedText type="h4">Send Funds</ThemedText>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.sendModalOptions}>
            {options.map((option, index) => (
              <Pressable 
                key={option.title}
                onPress={() => { option.onPress(); onClose(); }}
                style={({ pressed }) => [
                  styles.sendOption,
                  { backgroundColor: pressed ? theme.backgroundSecondary : "transparent" },
                  index < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.sendOptionIcon, { backgroundColor: theme.backgroundSecondary }]}>
                  <Feather name={option.icon as any} size={22} color={theme.primary} />
                </View>
                <View style={styles.sendOptionContent}>
                  <ThemedText style={styles.sendOptionTitle}>{option.title}</ThemedText>
                  <ThemedText style={[styles.sendOptionSubtitle, { color: theme.textSecondary }]}>{option.subtitle}</ThemedText>
                </View>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface ReceiveModalProps {
  visible: boolean;
  onClose: () => void;
  address: string;
}

function ReceiveModal({ visible, onClose, address }: ReceiveModalProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (visible && address) {
      setIsLoading(true);
      const baseUrl = getApiUrl();
      fetch(new URL(`/api/qrcode/${address}`, baseUrl))
        .then(res => res.json())
        .then(data => {
          if (data.qrCode) {
            setQrDataUrl(data.qrCode);
          }
        })
        .catch((err: Error) => console.error("QR fetch error:", err))
        .finally(() => setIsLoading(false));
    }
  }, [visible, address]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.receiveModalContainer, { backgroundColor: theme.backgroundRoot }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.receiveModalHeader}>
            <ThemedText type="h4">Receive Funds</ThemedText>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          
          <View style={styles.qrContainer}>
            <View style={[styles.qrPlaceholder, { backgroundColor: "#FFFFFF", borderColor: theme.border }]}>
              {isLoading ? (
                <ActivityIndicator size="large" color={theme.primary} />
              ) : qrDataUrl ? (
                <Image source={{ uri: qrDataUrl }} style={styles.qrImage} resizeMode="contain" />
              ) : (
                <ActivityIndicator size="large" color={theme.primary} />
              )}
            </View>
          </View>

          <View style={[styles.addressContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <ThemedText style={[styles.addressLabel, { color: theme.textSecondary }]}>Your Wallet Address</ThemedText>
            <ThemedText style={styles.addressText} numberOfLines={2}>{address}</ThemedText>
          </View>

          <View style={styles.receiveActions}>
            <Pressable 
              onPress={handleCopy}
              style={[styles.copyAddressButton, { backgroundColor: theme.primary }]}
            >
              <Feather name={copied ? "check" : "copy"} size={18} color="#FFFFFF" />
              <ThemedText style={styles.copyAddressText}>{copied ? "Copied" : "Copy Address"}</ThemedText>
            </Pressable>
          </View>

          <View style={[styles.networkBadge, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.networkDotSmall} />
            <ThemedText style={[styles.networkLabel, { color: theme.textSecondary }]}>Tempo Testnet</ThemedText>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface SendToAddressModalProps {
  visible: boolean;
  onClose: () => void;
  tokenBalances: TokenBalance[];
  userId: string;
  onSuccess: () => void;
  initialAddress?: string | null;
}

function SendToAddressModal({ visible, onClose, tokenBalances, userId, onSuccess, initialAddress }: SendToAddressModalProps) {
  const { theme } = useTheme();
  const [recipientAddress, setRecipientAddress] = useState(initialAddress || "");

  useEffect(() => {
    if (initialAddress) {
      setRecipientAddress(initialAddress);
    }
  }, [initialAddress]);
  const [amount, setAmount] = useState("");
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<{ txHash: string; explorer: string } | null>(null);

  const selectedToken = TEMPO_TOKENS[selectedTokenIndex];
  const selectedBalance = tokenBalances[selectedTokenIndex];

  const resetForm = () => {
    setRecipientAddress("");
    setAmount("");
    setSelectedTokenIndex(0);
    setError(null);
    setTxResult(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const handleSend = async () => {
    setError(null);

    if (!recipientAddress.trim()) {
      setError("Please enter a recipient address");
      return;
    }

    if (!validateAddress(recipientAddress)) {
      setError("Invalid wallet address format");
      return;
    }

    const amountStr = amount.trim();
    if (!/^\d+(\.\d+)?$/.test(amountStr)) {
      setError("Please enter a valid amount (numbers only)");
      return;
    }

    let amountInBaseUnits: bigint;
    try {
      amountInBaseUnits = parseUnits(amountStr, selectedToken.decimals);
    } catch {
      setError("Please enter a valid amount");
      return;
    }

    if (amountInBaseUnits <= 0n) {
      setError("Amount must be greater than zero");
      return;
    }

    const balanceInBaseUnits = BigInt(selectedBalance.balance);
    if (amountInBaseUnits > balanceInBaseUnits) {
      setError(`Insufficient ${selectedToken.symbol} balance (${selectedBalance.balanceFormatted} available)`);
      return;
    }

    setIsSending(true);

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/wallet/${userId}/transfer`, baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tokenAddress: selectedToken.address,
          toAddress: recipientAddress,
          amount: amountStr,
          decimals: selectedToken.decimals,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Transfer failed");
      }

      setTxResult({ txHash: data.txHash, explorer: data.explorer });
      onSuccess();
    } catch (err) {
      const appError = parseApiError(err);
      setError(appError.message);
      
      if (appError.code === ErrorCodes.UNAUTHORIZED) {
        Alert.alert("Session Expired", "Please sign in again to continue.");
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenExplorer = () => {
    if (txResult?.explorer) {
      Linking.openURL(txResult.explorer);
    }
  };

  if (txResult) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.modalOverlay} onPress={handleClose}>
          <Pressable style={[styles.sendAddressModalContainer, { backgroundColor: theme.backgroundRoot }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.successContainer}>
              <View style={[styles.successIcon, { backgroundColor: theme.success + "20" }]}>
                <Feather name="check-circle" size={48} color={theme.success} />
              </View>
              <ThemedText type="h4" style={styles.successTitle}>Transfer Sent</ThemedText>
              <ThemedText style={[styles.successAmount, { color: theme.textSecondary }]}>
                {amount} {selectedToken.symbol}
              </ThemedText>
              <Pressable
                onPress={handleOpenExplorer}
                style={[styles.explorerButton, { backgroundColor: theme.backgroundSecondary }]}
              >
                <Feather name="external-link" size={16} color={theme.primary} />
                <ThemedText style={[styles.explorerButtonText, { color: theme.primary }]}>
                  View on Explorer
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleClose}
                style={[styles.doneButton, { backgroundColor: theme.primary }]}
              >
                <ThemedText style={styles.doneButtonText}>Done</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <Pressable style={[styles.sendAddressModalContainer, { backgroundColor: theme.backgroundRoot }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sendModalHeader}>
            <ThemedText type="h4">Send to Address</ThemedText>
            <Pressable onPress={handleClose} style={styles.modalCloseButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.sendAddressForm}>
            <View style={styles.inputGroup}>
              <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Recipient Address</ThemedText>
              <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="0x..."
                  placeholderTextColor={theme.textSecondary}
                  value={recipientAddress}
                  onChangeText={setRecipientAddress}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Token</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tokenSelector}>
                {TEMPO_TOKENS.map((token, index) => (
                  <Pressable
                    key={token.symbol}
                    onPress={() => setSelectedTokenIndex(index)}
                    style={[
                      styles.tokenOption,
                      { 
                        backgroundColor: selectedTokenIndex === index ? token.color + "20" : theme.backgroundDefault,
                        borderColor: selectedTokenIndex === index ? token.color : theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.tokenDot, { backgroundColor: token.color }]} />
                    <ThemedText style={styles.tokenOptionSymbol}>{token.symbol}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
              <ThemedText style={[styles.balanceHint, { color: theme.textSecondary }]}>
                Balance: {parseFloat(selectedBalance?.balanceFormatted || "0").toLocaleString()} {selectedToken.symbol}
              </ThemedText>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Amount</ThemedText>
              <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.textInput, { color: theme.text }]}
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  onPress={() => setAmount(selectedBalance?.balanceFormatted || "0")}
                  style={[styles.maxButton, { backgroundColor: theme.primary + "20" }]}
                >
                  <ThemedText style={[styles.maxButtonText, { color: theme.primary }]}>MAX</ThemedText>
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={[styles.errorContainer, { backgroundColor: theme.error + "20" }]}>
                <Feather name="alert-circle" size={16} color={theme.error} />
                <ThemedText style={[styles.errorText, { color: theme.error }]}>{error}</ThemedText>
              </View>
            ) : null}

            <Pressable
              onPress={handleSend}
              disabled={isSending}
              style={({ pressed }) => [
                styles.sendButton,
                { 
                  backgroundColor: isSending ? theme.textSecondary : theme.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="send" size={18} color="#FFFFFF" />
                  <ThemedText style={styles.sendButtonText}>Send {selectedToken.symbol}</ThemedText>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (address: string) => void;
}

function QRScannerModal({ visible, onClose, onScan }: QRScannerModalProps) {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    if (scanned) return;
    
    const { data } = result;
    let address = data;
    
    if (data.startsWith("ethereum:")) {
      address = data.replace("ethereum:", "").split("@")[0].split("?")[0];
    }
    
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setScanned(true);
      onScan(address);
      onClose();
    } else {
      Alert.alert("Invalid QR Code", "This QR code does not contain a valid wallet address.");
    }
  };

  const handleClose = () => {
    setScanned(false);
    onClose();
  };

  const renderContent = () => {
    if (Platform.OS === "web") {
      return (
        <View style={styles.qrScannerPlaceholder}>
          <View style={[styles.qrScannerIcon, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="camera-off" size={48} color={theme.textSecondary} />
          </View>
          <ThemedText type="h4" style={{ marginBottom: Spacing.sm, textAlign: "center" }}>
            Camera Not Available
          </ThemedText>
          <ThemedText style={[styles.qrScannerText, { color: theme.textSecondary }]}>
            Run this app in Expo Go on your mobile device to scan QR codes.
          </ThemedText>
          <Pressable
            onPress={handleClose}
            style={[styles.qrScannerButton, { backgroundColor: theme.backgroundSecondary }]}
          >
            <ThemedText style={{ color: theme.text }}>Close</ThemedText>
          </Pressable>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.qrScannerPlaceholder}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.qrScannerPlaceholder}>
          <View style={[styles.qrScannerIcon, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="camera" size={48} color={theme.textSecondary} />
          </View>
          <ThemedText type="h4" style={{ marginBottom: Spacing.sm, textAlign: "center" }}>
            Camera Access Required
          </ThemedText>
          <ThemedText style={[styles.qrScannerText, { color: theme.textSecondary }]}>
            We need camera access to scan wallet QR codes for payments.
          </ThemedText>
          {permission.status === "denied" && !permission.canAskAgain ? (
            <Pressable
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch {
                  Alert.alert("Unable to Open Settings", "Please enable camera permission in your device settings.");
                }
              }}
              style={[styles.qrScannerButton, { backgroundColor: theme.primary }]}
            >
              <ThemedText style={{ color: "#FFFFFF" }}>Open Settings</ThemedText>
            </Pressable>
          ) : (
            <Pressable
              onPress={requestPermission}
              style={[styles.qrScannerButton, { backgroundColor: theme.primary }]}
            >
              <ThemedText style={{ color: "#FFFFFF" }}>Enable Camera</ThemedText>
            </Pressable>
          )}
          <Pressable
            onPress={handleClose}
            style={[styles.qrScannerButton, { backgroundColor: theme.backgroundSecondary, marginTop: Spacing.sm }]}
          >
            <ThemedText style={{ color: theme.text }}>Cancel</ThemedText>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.qrScannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
        <View style={styles.qrScannerOverlay}>
          <View style={[styles.qrScannerCorner, styles.qrScannerCornerTopLeft, { borderColor: theme.primary }]} />
          <View style={[styles.qrScannerCorner, styles.qrScannerCornerTopRight, { borderColor: theme.primary }]} />
          <View style={[styles.qrScannerCorner, styles.qrScannerCornerBottomLeft, { borderColor: theme.primary }]} />
          <View style={[styles.qrScannerCorner, styles.qrScannerCornerBottomRight, { borderColor: theme.primary }]} />
        </View>
        <View style={styles.qrScannerHint}>
          <ThemedText style={styles.qrScannerHintText}>
            Point camera at a wallet QR code
          </ThemedText>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.qrScannerModal, { backgroundColor: theme.backgroundDefault }]}>
        <View style={[styles.qrScannerHeader, { borderBottomColor: theme.border }]}>
          <Pressable onPress={handleClose} style={styles.qrScannerCloseButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
          <ThemedText type="h4">Scan QR Code</ThemedText>
          <View style={{ width: 44 }} />
        </View>
        {renderContent()}
      </View>
    </Modal>
  );
}

function TransactionHistoryEmpty() {
  const { theme } = useTheme();

  return (
    <View style={styles.historyEmptyContainer}>
      <View style={[styles.historyEmptyIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="clock" size={24} color={theme.textSecondary} />
      </View>
      <ThemedText style={[styles.historyEmptyText, { color: theme.textSecondary }]}>
        No transactions yet
      </ThemedText>
    </View>
  );
}

export default function WalletScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { wallet, isLoading: isLoadingWallet, refreshWallet, setWallet, clearWallet } = useWallet();
  
  const initialBalances: TokenBalance[] = TEMPO_TOKENS.map(token => ({
    token,
    balance: "0",
    balanceFormatted: "0",
    balanceUsd: 0,
  }));
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>(initialBalances);
  const [totalBalance, setTotalBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showSendAddressModal, setShowSendAddressModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedAddress, setScannedAddress] = useState<string | null>(null);

  const loadBalances = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;
    
    setIsLoadingBalances(true);
    try {
      const balances = await fetchTokenBalances(walletAddress);
      setTokenBalances(balances);
      setTotalBalance(getTotalBalance(balances));
    } catch (error) {
      console.error("Failed to load balances:", error);
    } finally {
      setIsLoadingBalances(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const txs = await getTransactions();
      setTransactions(txs);
    } catch (error) {
      console.error("Failed to load transactions:", error);
      setTransactions([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        if (wallet?.address) {
          loadBalances(wallet.address);
        }
        loadData();
      };
      init();
    }, [wallet?.address, loadData, loadBalances])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    const refreshedWallet = await refreshWallet();
    if (refreshedWallet?.address) {
      await loadBalances(refreshedWallet.address);
    }
    await loadData();
    setRefreshing(false);
  };

  const handleSendViaChat = () => {
    Alert.alert("Send via Chat", "Select a contact from your chats to send funds");
  };

  const handleScanQR = () => {
    setShowSendModal(false);
    setShowQRScanner(true);
  };

  const handleQRScan = (address: string) => {
    setScannedAddress(address);
    setShowQRScanner(false);
    setShowSendAddressModal(true);
  };

  const handleEnterAddress = () => {
    setShowSendAddressModal(true);
  };

  const handleTransferSuccess = () => {
    if (wallet?.address) {
      loadBalances(wallet.address);
    }
    loadData();
  };

  const handleWalletCreated = async (newWallet: { address: string }) => {
    await refreshWallet();
    if (newWallet.address) {
      loadBalances(newWallet.address);
    }
  };

  const handleCopyAddress = async () => {
    if (wallet?.address) {
      await Clipboard.setStringAsync(wallet.address);
      Alert.alert("Copied", "Wallet address copied to clipboard");
    }
  };

  const handleDeleteWallet = () => {
    Alert.alert(
      "Delete Wallet",
      "Are you sure you want to remove this wallet from your account? You can recover it later by importing your seed phrase or private key.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete Wallet", 
          style: "destructive",
          onPress: confirmDeleteWallet,
        },
      ]
    );
  };

  const confirmDeleteWallet = async () => {
    if (!user) return;
    
    try {
      const response = await apiRequest("DELETE", `/api/wallet/${user.id}`, {});
      const data = await response.json();
      
      if (data.success) {
        await clearWallet();
        Alert.alert(
          "Wallet Removed",
          "Your wallet has been removed. You can add a new wallet or import your existing one using your recovery phrase."
        );
      } else {
        throw new Error(data.error || "Failed to delete wallet");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to delete wallet");
    }
  };

  const handleManageWallet = () => {
    const options = ["Copy Address", "Delete Wallet", "Cancel"];
    const destructiveButtonIndex = 1;
    const cancelButtonIndex = 2;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleCopyAddress();
          } else if (buttonIndex === 1) {
            handleDeleteWallet();
          }
        }
      );
    } else {
      Alert.alert(
        "Manage Wallet",
        "Choose an action",
        [
          { text: "Copy Address", onPress: handleCopyAddress },
          { text: "Delete Wallet", style: "destructive", onPress: handleDeleteWallet },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  };

  if (isLoadingWallet) {
    return <ThemedView style={styles.container} />;
  }

  if (!wallet) {
    return <WalletSetupScreen onWalletCreated={handleWalletCreated} />;
  }

  const groupedTransactions = transactions.reduce((groups, transaction) => {
    const date = formatDate(transaction.timestamp);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(transaction);
    return groups;
  }, {} as Record<string, Transaction[]>);

  const sections = Object.entries(groupedTransactions).map(([date, items]) => ({
    date,
    data: items,
  }));

  const renderItem = ({ item }: { item: Transaction }) => {
    const section = sections.find(s => s.data.includes(item));
    const isFirst = section?.data[0] === item;
    
    return (
      <View>
        {isFirst ? (
          <ThemedText style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            {section?.date}
          </ThemedText>
        ) : null}
        <TransactionItem transaction={item} />
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      >
        <Card style={styles.balanceCard} elevation={1}>
          <View style={styles.balanceHeader}>
            <ThemedText style={[styles.balanceLabel, { color: theme.textSecondary }]}>
              Total Balance
            </ThemedText>
            <View style={styles.headerActions}>
              <Pressable onPress={handleManageWallet} style={styles.manageButton}>
                <Feather name="more-horizontal" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>
          {isLoadingBalances ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
                Loading balances...
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.balanceAmount}>
              ${totalBalance.toFixed(2)}
            </ThemedText>
          )}
          <Pressable onPress={handleCopyAddress} style={styles.walletInfo}>
            <Feather name="credit-card" size={14} color={theme.textSecondary} />
            <ThemedText style={[styles.walletAddress, { color: theme.textSecondary }]}>
              {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
            </ThemedText>
            <Feather name="copy" size={12} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.networkRow}>
            <View style={[styles.networkIndicator, { backgroundColor: theme.backgroundSecondary }]}>
              <View style={styles.networkDot} />
              <ThemedText style={[styles.networkText, { color: theme.textSecondary }]}>
                Tempo Testnet
              </ThemedText>
            </View>
            <Pressable
              onPress={() => Linking.openURL(TEMPO_FAUCET_URL)}
              style={({ pressed }) => [
                styles.faucetButton,
                { backgroundColor: theme.backgroundSecondary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="droplet" size={14} color={theme.primary} />
              <ThemedText style={[styles.faucetButtonText, { color: theme.primary }]}>
                Get Free TEMPO
              </ThemedText>
            </Pressable>
          </View>
        </Card>

        <View style={styles.actionButtons}>
          <Pressable
            onPress={() => setShowSendModal(true)}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={styles.actionButtonContent}>
              <Feather name="arrow-up-right" size={22} color="#FFFFFF" />
              <ThemedText style={styles.actionButtonText}>Send</ThemedText>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setShowReceiveModal(true)}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: theme.backgroundSecondary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={styles.actionButtonContent}>
              <Feather name="arrow-down-left" size={22} color={theme.primary} />
              <ThemedText style={[styles.actionButtonText, { color: theme.primary }]}>Receive</ThemedText>
            </View>
          </Pressable>
        </View>
        
        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          Assets
        </ThemedText>
        <Card style={styles.assetsCard} elevation={1}>
          {isLoadingBalances ? (
            <View style={styles.assetsLoadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : (
            tokenBalances.map((item, index) => (
              <View 
                key={item.token.symbol}
                style={[
                  styles.assetItem,
                  index < tokenBalances.length - 1 && { 
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.border,
                  },
                ]}
              >
                <View style={[styles.assetIcon, { backgroundColor: item.token.color }]}>
                  <ThemedText style={styles.assetIconText}>
                    {item.token.symbol.charAt(0)}
                  </ThemedText>
                </View>
                <View style={styles.assetInfo}>
                  <ThemedText style={styles.assetSymbol}>{item.token.symbol}</ThemedText>
                  <ThemedText style={[styles.assetName, { color: theme.textSecondary }]}>
                    {item.token.name}
                  </ThemedText>
                </View>
                <View style={styles.assetBalance}>
                  <ThemedText style={styles.assetAmount}>
                    ${item.balanceUsd.toFixed(2)}
                  </ThemedText>
                  <ThemedText style={[styles.assetTokens, { color: theme.textSecondary }]}>
                    {parseFloat(item.balanceFormatted).toLocaleString()} {item.token.symbol}
                  </ThemedText>
                </View>
              </View>
            ))
          )}
        </Card>

        <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
          History
        </ThemedText>
        <Card style={styles.historyCard} elevation={1}>
          {transactions.length === 0 ? (
            <TransactionHistoryEmpty />
          ) : (
            transactions.map((transaction, index) => (
              <View key={transaction.id}>
                {index > 0 && (
                  <View style={[styles.transactionSeparator, { backgroundColor: theme.border }]} />
                )}
                <TransactionItem transaction={transaction} />
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      <SendModal
        visible={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSendViaChat={handleSendViaChat}
        onScanQR={handleScanQR}
        onEnterAddress={handleEnterAddress}
      />

      <ReceiveModal
        visible={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        address={wallet.address || ""}
      />

      <SendToAddressModal
        visible={showSendAddressModal}
        onClose={() => {
          setShowSendAddressModal(false);
          setScannedAddress(null);
        }}
        tokenBalances={tokenBalances}
        userId={user?.id || ""}
        onSuccess={handleTransferSuccess}
        initialAddress={scannedAddress}
      />

      <QRScannerModal
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  balanceCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  balanceLabel: {
    fontSize: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  currencyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  manageButton: {
    padding: Spacing.xs,
  },
  currencyText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  walletInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  walletAddress: {
    fontSize: 13,
    fontFamily: "monospace",
    flex: 1,
  },
  networkIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.success,
  },
  networkText: {
    fontSize: 12,
  },
  networkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  faucetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  faucetButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  transactionName: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 2,
  },
  transactionMemo: {
    fontSize: 13,
  },
  transactionAmountContainer: {
    alignItems: "flex-end",
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  transactionTime: {
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: Spacing.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    textAlign: "center",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  assetsCard: {
    marginBottom: Spacing.lg,
    padding: 0,
    overflow: "hidden",
  },
  assetsLoadingContainer: {
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  assetItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  assetIconText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  assetInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  assetSymbol: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  assetName: {
    fontSize: 13,
  },
  assetBalance: {
    alignItems: "flex-end",
  },
  assetAmount: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  assetTokens: {
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    height: 56,
    borderRadius: BorderRadius.button,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  historyCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.md,
  },
  historyEmptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  historyEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  historyEmptyText: {
    fontSize: 14,
  },
  transactionSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  sendModalContainer: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  sendModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  sendModalOptions: {
    padding: Spacing.sm,
  },
  sendOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  sendOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOptionContent: {
    flex: 1,
  },
  sendOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  sendOptionSubtitle: {
    fontSize: 13,
  },
  receiveModalContainer: {
    width: "100%",
    maxWidth: 360,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: "center",
  },
  receiveModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: Spacing.lg,
  },
  qrContainer: {
    marginBottom: Spacing.lg,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  addressContainer: {
    width: "100%",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  addressLabel: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  addressText: {
    fontSize: 13,
    fontFamily: "monospace",
    lineHeight: 20,
  },
  receiveActions: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  copyAddressButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: BorderRadius.button,
    gap: Spacing.sm,
  },
  copyAddressText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  networkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  networkDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.success,
  },
  networkLabel: {
    fontSize: 12,
  },
  sendAddressModalContainer: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  sendAddressForm: {
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    height: 48,
    paddingHorizontal: Spacing.md,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  tokenSelector: {
    flexGrow: 0,
    marginTop: Spacing.xs,
  },
  tokenOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginRight: Spacing.sm,
    gap: Spacing.xs,
  },
  tokenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tokenOptionSymbol: {
    fontSize: 14,
    fontWeight: "500",
  },
  balanceHint: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  maxButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
  },
  maxButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  errorText: {
    fontSize: 14,
    flex: 1,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: BorderRadius.button,
    gap: Spacing.sm,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  successTitle: {
    marginBottom: Spacing.xs,
  },
  successAmount: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: Spacing.xl,
  },
  explorerButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  explorerButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  doneButton: {
    width: "100%",
    height: 48,
    borderRadius: BorderRadius.button,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  qrScannerModal: {
    flex: 1,
  },
  qrScannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  qrScannerCloseButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  qrScannerContainer: {
    flex: 1,
    position: "relative",
  },
  qrScannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  qrScannerCorner: {
    position: "absolute",
    width: 60,
    height: 60,
    borderWidth: 3,
  },
  qrScannerCornerTopLeft: {
    top: "25%",
    left: "15%",
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  qrScannerCornerTopRight: {
    top: "25%",
    right: "15%",
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  qrScannerCornerBottomLeft: {
    bottom: "25%",
    left: "15%",
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  qrScannerCornerBottomRight: {
    bottom: "25%",
    right: "15%",
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  qrScannerHint: {
    position: "absolute",
    bottom: "15%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  qrScannerHintText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  qrScannerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  qrScannerIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  qrScannerText: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  qrScannerButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.button,
  },
});
