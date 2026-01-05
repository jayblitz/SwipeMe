import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface WithdrawalWindow {
  canWithdrawNow: boolean;
  nextWithdrawalDate: string;
  daysUntilWithdrawal: number;
  withdrawalDay: string;
}

interface CreatorEarnings {
  totalEarned: string;
  totalWithdrawn: string;
  pendingBalance: string;
  totalTipsReceived: string;
  totalFeesPaid: string;
  lastWithdrawalAt: string | null;
  withdrawalWindow?: WithdrawalWindow;
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: string;
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  const { theme } = useTheme();

  return (
    <Card style={styles.statCard} elevation={1}>
      <View style={[styles.statIcon, { backgroundColor: `${color}15` }]}>
        <Feather name={icon as any} size={24} color={color} />
      </View>
      <ThemedText style={[styles.statValue, { color }]}>${value}</ThemedText>
      <ThemedText style={[styles.statTitle, { color: theme.textSecondary }]}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText style={[styles.statSubtitle, { color: theme.textSecondary, opacity: 0.7 }]}>
          {subtitle}
        </ThemedText>
      ) : null}
    </Card>
  );
}

export default function CreatorEarningsScreen() {
  useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const {
    data: earnings,
    isLoading,
    refetch,
  } = useQuery<CreatorEarnings>({
    queryKey: ["/api/creators/me/earnings"],
    enabled: !!user,
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount: string) => {
      return apiRequest("POST", "/api/creators/me/withdraw", { amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me/earnings"] });
      Alert.alert("Success", "Withdrawal initiated successfully");
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Failed to process withdrawal");
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleOpenWithdrawModal = () => {
    if (!earnings || parseFloat(earnings.pendingBalance) <= 0) {
      Alert.alert("No Balance", "You don't have any pending balance to withdraw");
      return;
    }
    setWithdrawAmount("");
    setWithdrawModalVisible(true);
  };

  const handleConfirmWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    const maxBalance = parseFloat(earnings?.pendingBalance || "0");
    
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }
    if (amount > maxBalance) {
      Alert.alert("Insufficient Balance", `Maximum available: $${maxBalance.toFixed(2)}`);
      return;
    }
    
    setWithdrawModalVisible(false);
    withdrawMutation.mutate(withdrawAmount);
  };

  const handlePresetAmount = (preset: number) => {
    const maxBalance = parseFloat(earnings?.pendingBalance || "0");
    const amount = Math.min(preset, maxBalance);
    setWithdrawAmount(amount.toFixed(2));
  };

  const handleWithdrawAll = () => {
    const maxBalance = parseFloat(earnings?.pendingBalance || "0");
    setWithdrawAmount(maxBalance.toFixed(2));
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  const totalEarned = parseFloat(earnings?.totalEarned || "0").toFixed(2);
  const pendingBalance = parseFloat(earnings?.pendingBalance || "0").toFixed(2);
  const totalWithdrawn = parseFloat(earnings?.totalWithdrawn || "0").toFixed(2);
  const tipsCount = earnings?.totalTipsReceived || "0";
  const withdrawalWindow = earnings?.withdrawalWindow;
  const canWithdraw = withdrawalWindow?.canWithdrawNow && parseFloat(pendingBalance) > 0;
  
  const formatNextWithdrawalDate = () => {
    if (!withdrawalWindow?.nextWithdrawalDate) return "";
    const date = new Date(withdrawalWindow.nextWithdrawalDate);
    return date.toLocaleDateString("en-US", { 
      weekday: "long", 
      month: "short", 
      day: "numeric" 
    });
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.md,
            paddingBottom: insets.bottom + Spacing.xl,
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
        <View style={styles.header}>
          <ThemedText type="h2" style={styles.headerTitle}>
            Creator Earnings
          </ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Track your tips and earnings from posts
          </ThemedText>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            title="Total Earned"
            value={totalEarned}
            subtitle={`${tipsCount} tips received`}
            icon="trending-up"
            color={theme.money}
          />
          <StatCard
            title="Available"
            value={pendingBalance}
            subtitle="Held in treasury"
            icon="dollar-sign"
            color={theme.primary}
          />
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            title="Withdrawn"
            value={totalWithdrawn}
            icon="download"
            color={theme.textSecondary}
          />
          <StatCard
            title="Tips Count"
            value={tipsCount}
            subtitle="Total tips"
            icon="heart"
            color={theme.error}
          />
        </View>

        <Card style={styles.infoCard} elevation={1}>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={20} color={theme.primary} />
            <View style={styles.infoContent}>
              <ThemedText style={styles.infoTitle}>Weekly Withdrawals</ThemedText>
              <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
                Tips are held securely in the platform treasury. You can withdraw your full balance once per week on Mondays (UTC).
              </ThemedText>
            </View>
          </View>
        </Card>

        {!withdrawalWindow?.canWithdrawNow && withdrawalWindow?.daysUntilWithdrawal ? (
          <View style={[styles.nextWithdrawalCard, { backgroundColor: `${theme.primary}10` }]}>
            <Feather name="clock" size={18} color={theme.primary} />
            <View style={styles.nextWithdrawalContent}>
              <ThemedText style={[styles.nextWithdrawalLabel, { color: theme.textSecondary }]}>
                Next withdrawal window
              </ThemedText>
              <ThemedText style={[styles.nextWithdrawalDate, { color: theme.text }]}>
                {formatNextWithdrawalDate()}
              </ThemedText>
              <ThemedText style={[styles.nextWithdrawalDays, { color: theme.primary }]}>
                {withdrawalWindow.daysUntilWithdrawal === 1 
                  ? "Tomorrow" 
                  : `${withdrawalWindow.daysUntilWithdrawal} days`}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <Pressable
          style={[
            styles.withdrawButton,
            {
              backgroundColor: canWithdraw ? theme.money : theme.backgroundTertiary,
            },
          ]}
          onPress={handleOpenWithdrawModal}
          disabled={!canWithdraw || withdrawMutation.isPending}
        >
          {withdrawMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="download" size={20} color={canWithdraw ? "#FFFFFF" : theme.textSecondary} />
              <ThemedText style={[styles.withdrawButtonText, { color: canWithdraw ? "#FFFFFF" : theme.textSecondary }]}>
                {canWithdraw
                  ? `Withdraw $${pendingBalance}`
                  : parseFloat(pendingBalance) > 0
                    ? "Withdrawals open on Mondays"
                    : "No balance to withdraw"}
              </ThemedText>
            </>
          )}
        </Pressable>

        {earnings?.lastWithdrawalAt ? (
          <ThemedText style={[styles.lastWithdrawal, { color: theme.textSecondary, opacity: 0.7 }]}>
            Last withdrawal: {new Date(earnings.lastWithdrawalAt).toLocaleDateString()}
          </ThemedText>
        ) : null}
      </ScrollView>

      <Modal
        visible={withdrawModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWithdrawModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setWithdrawModalVisible(false)}
        >
          <Pressable 
            style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}
            onPress={(e) => e.stopPropagation()}
          >
            <KeyboardAwareScrollViewCompat
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Withdraw Earnings</ThemedText>
              <Pressable onPress={() => setWithdrawModalVisible(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <ThemedText style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Available balance: ${parseFloat(earnings?.pendingBalance || "0").toFixed(2)}
            </ThemedText>

            <View style={[styles.amountInputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <ThemedText style={styles.currencySymbol}>$</ThemedText>
              <TextInput
                style={[styles.amountInput, { color: theme.text }]}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <View style={styles.presetButtonsRow}>
              <Pressable
                style={[styles.presetButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => handlePresetAmount(10)}
              >
                <ThemedText style={styles.presetButtonText}>$10</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.presetButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => handlePresetAmount(25)}
              >
                <ThemedText style={styles.presetButtonText}>$25</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.presetButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => handlePresetAmount(50)}
              >
                <ThemedText style={styles.presetButtonText}>$50</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.presetButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => handlePresetAmount(100)}
              >
                <ThemedText style={styles.presetButtonText}>$100</ThemedText>
              </Pressable>
            </View>

            <Pressable
              style={[styles.withdrawAllButton, { borderColor: theme.primary }]}
              onPress={handleWithdrawAll}
            >
              <ThemedText style={[styles.withdrawAllText, { color: theme.primary }]}>
                Withdraw All (${parseFloat(earnings?.pendingBalance || "0").toFixed(2)})
              </ThemedText>
            </Pressable>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.cancelButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => setWithdrawModalVisible(false)}
              >
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, { backgroundColor: theme.money }]}
                onPress={handleConfirmWithdraw}
                disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0}
              >
                <ThemedText style={styles.confirmButtonText}>Confirm</ThemedText>
              </Pressable>
            </View>
            </KeyboardAwareScrollViewCompat>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    padding: Spacing.lg,
    alignItems: "center",
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  statTitle: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  statSubtitle: {
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  infoCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  infoRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
  withdrawButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  withdrawButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  lastWithdrawal: {
    fontSize: 12,
    textAlign: "center",
  },
  nextWithdrawalCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    borderRadius: 12,
  },
  nextWithdrawalContent: {
    flex: 1,
  },
  nextWithdrawalLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  nextWithdrawalDate: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  nextWithdrawalDays: {
    fontSize: 13,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: Spacing.lg,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: "600",
    marginRight: Spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: "600",
    paddingVertical: Spacing.lg,
  },
  presetButtonsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  presetButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: "center",
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  withdrawAllButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  withdrawAllText: {
    fontSize: 14,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  modalScrollContent: {
    flexGrow: 1,
  },
});
