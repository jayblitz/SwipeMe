import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, RefreshControl, Alert, ActionSheetIOS, Platform, ActivityIndicator, Modal, ScrollView } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Transaction, getTransactions } from "@/lib/storage";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { fetchTokenBalances, getTotalBalance, TokenBalance, TEMPO_TOKENS } from "@/lib/tempo-tokens";
import WalletSetupScreen from "./WalletSetupScreen";

interface Wallet {
  id: string;
  address: string;
  isImported: boolean;
  createdAt: string;
}

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
            <View style={[styles.qrPlaceholder, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <View style={styles.qrGrid}>
                {Array(9).fill(0).map((_, i) => (
                  <View key={i} style={[styles.qrCell, { backgroundColor: i % 2 === 0 ? theme.text : "transparent" }]} />
                ))}
              </View>
              <ThemedText style={[styles.qrText, { color: theme.textSecondary }]}>QR Code</ThemedText>
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
  
  const [wallet, setWallet] = useState<Wallet | null | undefined>(undefined);
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
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!user) return;
    
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/wallet/${user.id}`, baseUrl), {
        credentials: "include",
      });
      const data = await response.json();
      setWallet(data.wallet);
      return data.wallet;
    } catch (error) {
      console.error("Failed to load wallet:", error);
      setWallet(null);
      return null;
    } finally {
      setIsLoadingWallet(false);
    }
  }, [user]);

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
        const loadedWallet = await loadWallet();
        if (loadedWallet?.address) {
          loadBalances(loadedWallet.address);
        }
        loadData();
      };
      init();
    }, [loadWallet, loadData, loadBalances])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    const loadedWallet = await loadWallet();
    if (loadedWallet?.address) {
      await loadBalances(loadedWallet.address);
    }
    await loadData();
    setRefreshing(false);
  };

  const handleSendViaChat = () => {
    Alert.alert("Send via Chat", "Select a contact from your chats to send funds");
  };

  const handleScanQR = () => {
    Alert.alert("Scan QR Code", "QR scanner coming soon. For now, use the enter address option.");
  };

  const handleEnterAddress = () => {
    Alert.alert("Enter Address", "Manual address entry will be available soon.");
  };

  const handleWalletCreated = (newWallet: { address: string }) => {
    setWallet(newWallet as Wallet);
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
        setWallet(null);
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
          <View style={[styles.networkIndicator, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.networkDot} />
            <ThemedText style={[styles.networkText, { color: theme.textSecondary }]}>
              Tempo Testnet
            </ThemedText>
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
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.xs,
    alignSelf: "flex-start",
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
    width: 180,
    height: 180,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  qrGrid: {
    width: 60,
    height: 60,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  qrCell: {
    width: 20,
    height: 20,
  },
  qrText: {
    marginTop: Spacing.sm,
    fontSize: 12,
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
});
