import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, Alert } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getBalance, getTransactions, addFunds, Transaction } from "@/lib/storage";

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
  
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [loadedBalance, loadedTransactions] = await Promise.all([
      getBalance(),
      getTransactions(),
    ]);
    setBalance(loadedBalance);
    setTransactions(loadedTransactions);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddFunds = () => {
    Alert.alert(
      "Add Funds",
      "Choose an amount to add to your wallet",
      [
        { text: "Cancel", style: "cancel" },
        { text: "$25", onPress: () => addFundsAmount(25) },
        { text: "$50", onPress: () => addFundsAmount(50) },
        { text: "$100", onPress: () => addFundsAmount(100) },
      ]
    );
  };

  const addFundsAmount = async (amount: number) => {
    await addFunds(amount);
    await loadData();
    Alert.alert("Success", `$${amount.toFixed(2)} added to your wallet`);
  };

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

  const renderItem = ({ item, index }: { item: Transaction; index: number }) => {
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
          <Card style={styles.balanceCard} elevation={1}>
            <View style={styles.balanceHeader}>
              <ThemedText style={[styles.balanceLabel, { color: theme.textSecondary }]}>
                Available Balance
              </ThemedText>
              <View style={[styles.currencyBadge, { backgroundColor: theme.primary }]}>
                <ThemedText style={styles.currencyText}>USDC</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.balanceAmount}>
              ${balance.toFixed(2)}
            </ThemedText>
            <View style={styles.walletInfo}>
              <Feather name="credit-card" size={14} color={theme.textSecondary} />
              <ThemedText style={[styles.walletAddress, { color: theme.textSecondary }]}>
                {user?.walletAddress?.slice(0, 6)}...{user?.walletAddress?.slice(-4)}
              </ThemedText>
            </View>
          </Card>
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
  currencyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
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
});
