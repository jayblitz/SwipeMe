import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
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
import { Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface CreatorEarnings {
  totalEarned: string;
  totalWithdrawn: string;
  pendingBalance: string;
  totalTipsReceived: string;
  totalFeesPaid: string;
  lastWithdrawalAt: string | null;
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

  const handleWithdraw = () => {
    if (!earnings || parseFloat(earnings.pendingBalance) <= 0) {
      Alert.alert("No Balance", "You don't have any pending balance to withdraw");
      return;
    }

    Alert.alert(
      "Withdraw Earnings",
      `Withdraw $${parseFloat(earnings.pendingBalance).toFixed(2)} to your wallet?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Withdraw",
          onPress: () => withdrawMutation.mutate(earnings.pendingBalance),
        },
      ]
    );
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
  const totalFeesPaid = parseFloat(earnings?.totalFeesPaid || "0").toFixed(2);
  const tipsCount = earnings?.totalTipsReceived || "0";

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
            subtitle="Ready to withdraw"
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
            title="Platform Fees"
            value={totalFeesPaid}
            subtitle="5% on tips"
            icon="percent"
            color={theme.warning}
          />
        </View>

        <Card style={styles.infoCard} elevation={1}>
          <View style={styles.infoRow}>
            <Feather name="info" size={20} color={theme.primary} />
            <View style={styles.infoContent}>
              <ThemedText style={styles.infoTitle}>How it works</ThemedText>
              <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
                When someone tips your post, you receive 95% of the tip amount directly to your wallet. The 5% platform fee helps keep SwipeMe running.
              </ThemedText>
            </View>
          </View>
        </Card>

        <Pressable
          style={[
            styles.withdrawButton,
            {
              backgroundColor: parseFloat(pendingBalance) > 0 ? theme.money : theme.backgroundTertiary,
            },
          ]}
          onPress={handleWithdraw}
          disabled={parseFloat(pendingBalance) <= 0 || withdrawMutation.isPending}
        >
          {withdrawMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="download" size={20} color="#FFFFFF" />
              <ThemedText style={styles.withdrawButtonText}>
                {parseFloat(pendingBalance) > 0
                  ? `Withdraw $${pendingBalance}`
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
});
