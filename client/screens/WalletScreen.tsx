import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, Alert, ActionSheetIOS, Platform, ActivityIndicator } from "react-native";
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
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { Transaction } from "@/lib/storage";
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

function EmptyState() {
  const { theme } = useTheme();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="credit-card" size={36} color={theme.textSecondary} />
      </View>
      <ThemedText style={[styles.emptyTitle, { fontWeight: "600" }]}>No transactions yet</ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Add funds to start sending payments
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
    setTransactions([]);
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

  const handleAddFunds = () => {
    // In Phase 2, this will integrate with Ramp SDK for fiat on-ramp
    // For MVP, show a placeholder message
    Alert.alert(
      "Coming Soon",
      "Fiat on-ramp will be available in a future update. For now, you can receive USDC on Tempo Testnet from other users or faucets.",
      [{ text: "OK" }]
    );
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
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl + 70,
          },
          transactions.length === 0 && styles.emptyListContent,
        ]}
        ListHeaderComponent={
          <>
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
          </>
        }
        ListEmptyComponent={EmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      />
      
      <View style={[styles.addFundsContainer, { bottom: tabBarHeight + Spacing.lg }]}>
        <Pressable
          onPress={handleAddFunds}
          style={({ pressed }) => [
            styles.addFundsButton,
            { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
          <ThemedText style={styles.addFundsText}>Add Funds</ThemedText>
        </Pressable>
      </View>
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
  addFundsContainer: {
    position: "absolute",
    right: Spacing.lg,
    left: Spacing.lg,
  },
  addFundsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: BorderRadius.button,
    gap: Spacing.sm,
    ...Shadows.fab,
  },
  addFundsText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
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
});
