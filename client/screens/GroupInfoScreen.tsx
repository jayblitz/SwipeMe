import React, { useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";

type GroupInfoScreenProps = NativeStackScreenProps<ChatsStackParamList, "GroupInfo">;

interface GroupMember {
  id: string;
  chatId: string;
  userId: string;
  role: "admin" | "member";
  joinedAt: string;
  user: {
    id: string;
    username?: string;
    name?: string;
    email?: string;
    walletAddress?: string;
  };
}

interface GroupData {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  adminId: string;
  type: "group";
  members: GroupMember[];
}

export default function GroupInfoScreen({ navigation, route }: GroupInfoScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { groupId } = route.params;

  const { data: group, isLoading } = useQuery<GroupData>({
    queryKey: ["/api/groups", groupId],
  });

  const isAdmin = user?.id === group?.adminId;

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const url = new URL(`/api/groups/${groupId}/members/${memberId}`, getApiUrl());
      return fetch(url.toString(), {
        method: "DELETE",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to remove member");
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async () => {
      const url = new URL(`/api/groups/${groupId}/leave`, getApiUrl());
      return fetch(url.toString(), {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      navigation.popToTop();
    },
    onError: () => {
      Alert.alert("Error", "Failed to leave group");
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async () => {
      const url = new URL(`/api/groups/${groupId}`, getApiUrl());
      return fetch(url.toString(), {
        method: "DELETE",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      navigation.popToTop();
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete group");
    },
  });

  const handleRemoveMember = useCallback((member: GroupMember) => {
    if (member.role === "admin") {
      Alert.alert("Cannot Remove", "You cannot remove the group admin");
      return;
    }

    Alert.alert(
      "Remove Member",
      `Remove ${member.user.name || member.user.username || "this member"} from the group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeMemberMutation.mutate(member.userId),
        },
      ]
    );
  }, [removeMemberMutation]);

  const handleLeaveGroup = useCallback(() => {
    if (isAdmin && (group?.members.length || 0) > 1) {
      Alert.alert(
        "Transfer Admin First",
        "As admin, you must transfer admin rights to another member before leaving"
      );
      return;
    }

    Alert.alert(
      "Leave Group",
      "Are you sure you want to leave this group?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => leaveGroupMutation.mutate(),
        },
      ]
    );
  }, [isAdmin, group?.members.length, leaveGroupMutation]);

  const handleDeleteGroup = useCallback(() => {
    Alert.alert(
      "Delete Group",
      "Are you sure you want to delete this group? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteGroupMutation.mutate(),
        },
      ]
    );
  }, [deleteGroupMutation]);

  const handleTransferAdmin = useCallback((member: GroupMember) => {
    if (member.userId === user?.id) return;

    Alert.alert(
      "Transfer Admin",
      `Make ${member.user.name || member.user.username || "this member"} the new admin?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: async () => {
            try {
              const url = new URL(`/api/groups/${groupId}/transfer-admin`, getApiUrl());
              await fetch(url.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ newAdminId: member.userId }),
              });
              queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
              Alert.alert("Success", "Admin rights transferred");
            } catch {
              Alert.alert("Error", "Failed to transfer admin");
            }
          },
        },
      ]
    );
  }, [groupId, user?.id, queryClient]);

  const renderMember = useCallback(({ item }: { item: GroupMember }) => {
    const displayName = item.user.name || item.user.username || item.user.email || "Unknown";
    const initials = displayName.slice(0, 2).toUpperCase();
    const isMe = item.userId === user?.id;
    const isMemberAdmin = item.role === "admin";

    return (
      <Pressable
        style={[styles.memberItem, { backgroundColor: theme.backgroundDefault }]}
        onLongPress={() => {
          if (isAdmin && !isMe) {
            Alert.alert(
              displayName,
              "What would you like to do?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Make Admin", onPress: () => handleTransferAdmin(item) },
                { text: "Remove", style: "destructive", onPress: () => handleRemoveMember(item) },
              ]
            );
          }
        }}
        delayLongPress={500}
      >
        <View style={[styles.memberAvatar, { backgroundColor: theme.primary }]}>
          <ThemedText style={styles.memberInitials}>{initials}</ThemedText>
        </View>
        <View style={styles.memberInfo}>
          <ThemedText style={styles.memberName}>
            {displayName}{isMe ? " (You)" : ""}
          </ThemedText>
          {item.user.username ? (
            <ThemedText style={[styles.memberUsername, { color: theme.textSecondary }]}>
              @{item.user.username}
            </ThemedText>
          ) : null}
        </View>
        {isMemberAdmin ? (
          <View style={[styles.adminBadge, { backgroundColor: theme.primaryLight }]}>
            <ThemedText style={[styles.adminBadgeText, { color: theme.primary }]}>Admin</ThemedText>
          </View>
        ) : null}
      </Pressable>
    );
  }, [theme, user?.id, isAdmin, handleRemoveMember, handleTransferAdmin]);

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  if (!group) {
    return (
      <ThemedView style={styles.errorContainer}>
        <Feather name="alert-circle" size={48} color={theme.error} />
        <ThemedText style={[styles.errorText, { color: theme.textSecondary }]}>
          Group not found
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.groupAvatar, { backgroundColor: theme.primary }]}>
            <Feather name="users" size={40} color="#FFFFFF" />
          </View>
          <ThemedText style={styles.groupName}>{group.name}</ThemedText>
          {group.description ? (
            <ThemedText style={[styles.groupDescription, { color: theme.textSecondary }]}>
              {group.description}
            </ThemedText>
          ) : null}
          <ThemedText style={[styles.memberCount, { color: theme.textSecondary }]}>
            {group.members.length} member{group.members.length !== 1 ? "s" : ""}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Members
          </ThemedText>
          <FlatList
            data={group.members}
            keyExtractor={item => item.userId}
            renderItem={renderMember}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
          />
        </View>

        <View style={styles.actionsSection}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.errorLight }]}
            onPress={handleLeaveGroup}
          >
            <Feather name="log-out" size={20} color={theme.error} />
            <ThemedText style={[styles.actionButtonText, { color: theme.error }]}>
              Leave Group
            </ThemedText>
          </Pressable>

          {isAdmin ? (
            <Pressable
              style={[styles.actionButton, { backgroundColor: theme.errorLight, marginTop: Spacing.sm }]}
              onPress={handleDeleteGroup}
            >
              <Feather name="trash-2" size={20} color={theme.error} />
              <ThemedText style={[styles.actionButtonText, { color: theme.error }]}>
                Delete Group
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
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
    alignItems: "center",
    justifyContent: "center",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  errorText: {
    fontSize: 16,
  },
  header: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  groupAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  groupName: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  groupDescription: {
    fontSize: 15,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  memberCount: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  section: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInitials: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "500",
  },
  memberUsername: {
    fontSize: 14,
    marginTop: 2,
  },
  adminBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actionsSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
