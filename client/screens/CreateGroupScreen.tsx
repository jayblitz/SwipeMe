import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";

type CreateGroupScreenProps = NativeStackScreenProps<ChatsStackParamList, "CreateGroup">;

interface UserSearchResult {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  walletAddress?: string;
}

interface CreateGroupResponse {
  group: { id: string; name: string };
}

export default function CreateGroupScreen({ navigation }: CreateGroupScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<UserSearchResult[]>([]);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const createGroupMutation = useMutation<CreateGroupResponse, Error, { name: string; description?: string; memberIds: string[] }>({
    mutationFn: async (data) => {
      const url = new URL("/api/groups", getApiUrl());
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create group");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      navigation.replace("Chat", {
        chatId: data.group.id,
        name: data.group.name,
        isGroup: true,
      });
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to create group");
    },
  });

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const cleanQuery = text.trim();
    if (cleanQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const isEmail = cleanQuery.includes("@");
        const url = new URL(
          isEmail ? "/api/users/search" : "/api/users/search-username",
          getApiUrl()
        );
        url.searchParams.set(isEmail ? "email" : "username", cleanQuery.replace(/^@/, ""));

        const response = await fetch(url.toString(), { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          const alreadySelected = new Set(selectedMembers.map(m => m.id));
          setSearchResults((data.users || []).filter((u: UserSearchResult) => !alreadySelected.has(u.id)));
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [selectedMembers]);

  const handleAddMember = useCallback((user: UserSearchResult) => {
    setSelectedMembers(prev => [...prev, user]);
    setSearchResults(prev => prev.filter(u => u.id !== user.id));
    setSearchQuery("");
  }, []);

  const handleRemoveMember = useCallback((userId: string) => {
    setSelectedMembers(prev => prev.filter(m => m.id !== userId));
  }, []);

  const handleCreateGroup = useCallback(() => {
    const name = groupName.trim();
    if (!name) {
      Alert.alert("Required", "Please enter a group name");
      return;
    }
    if (selectedMembers.length === 0) {
      Alert.alert("Required", "Please add at least one member");
      return;
    }

    createGroupMutation.mutate({
      name,
      description: groupDescription.trim() || undefined,
      memberIds: selectedMembers.map(m => m.id),
    });
  }, [groupName, groupDescription, selectedMembers, createGroupMutation]);

  const canCreate = useMemo(() => {
    return groupName.trim().length > 0 && selectedMembers.length > 0 && !createGroupMutation.isPending;
  }, [groupName, selectedMembers, createGroupMutation.isPending]);

  const renderSelectedMember = useCallback(({ item }: { item: UserSearchResult }) => {
    const displayName = item.name || item.username || item.email || "Unknown";
    const initials = displayName.slice(0, 2).toUpperCase();

    return (
      <View style={[styles.selectedMember, { backgroundColor: theme.primaryLight }]}>
        <View style={[styles.selectedMemberAvatar, { backgroundColor: theme.primary }]}>
          <ThemedText style={styles.selectedMemberInitials}>{initials}</ThemedText>
        </View>
        <ThemedText style={[styles.selectedMemberName, { color: theme.text }]} numberOfLines={1}>
          {displayName}
        </ThemedText>
        <Pressable onPress={() => handleRemoveMember(item.id)} hitSlop={8}>
          <Feather name="x" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
    );
  }, [theme, handleRemoveMember]);

  const renderSearchResult = useCallback(({ item }: { item: UserSearchResult }) => {
    const displayName = item.name || `@${item.username}` || item.email || "Unknown";
    const subtext = item.username ? `@${item.username}` : item.email || "";
    const initials = (item.name || item.username || item.email || "?").slice(0, 2).toUpperCase();

    return (
      <Pressable
        style={({ pressed }) => [
          styles.searchResultItem,
          { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
        ]}
        onPress={() => handleAddMember(item)}
      >
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <ThemedText style={styles.avatarText}>{initials}</ThemedText>
        </View>
        <View style={styles.resultInfo}>
          <ThemedText style={styles.resultName}>{displayName}</ThemedText>
          {subtext ? (
            <ThemedText style={[styles.resultSubtext, { color: theme.textSecondary }]}>
              {subtext}
            </ThemedText>
          ) : null}
        </View>
        <Feather name="plus-circle" size={22} color={theme.primary} />
      </Pressable>
    );
  }, [theme, handleAddMember]);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Group Name</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
            placeholder="Enter group name"
            placeholderTextColor={theme.textSecondary}
            value={groupName}
            onChangeText={setGroupName}
            maxLength={100}
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Description (optional)</ThemedText>
          <TextInput
            style={[styles.input, styles.descriptionInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
            placeholder="What's this group about?"
            placeholderTextColor={theme.textSecondary}
            value={groupDescription}
            onChangeText={setGroupDescription}
            multiline
            maxLength={500}
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Add Members</ThemedText>
          <View style={[styles.searchContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by username or email"
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : searchQuery.length > 0 ? (
              <Pressable onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
                <Feather name="x-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {selectedMembers.length > 0 ? (
          <View style={styles.selectedMembersSection}>
            <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
              Selected ({selectedMembers.length})
            </ThemedText>
            <FlatList
              data={selectedMembers}
              keyExtractor={item => item.id}
              renderItem={renderSelectedMember}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectedMembersList}
            />
          </View>
        ) : null}

        {searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            keyExtractor={item => item.id}
            renderItem={renderSearchResult}
            style={styles.searchResultsList}
            contentContainerStyle={{ paddingBottom: Spacing.lg }}
          />
        ) : searchQuery.length >= 2 && !isSearching ? (
          <View style={styles.noResultsContainer}>
            <Feather name="user-x" size={28} color={theme.textSecondary} />
            <ThemedText style={[styles.noResultsText, { color: theme.textSecondary }]}>
              No users found
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.spacer} />

        <Pressable
          style={[
            styles.createButton,
            {
              backgroundColor: canCreate ? theme.primary : theme.backgroundSecondary,
              opacity: canCreate ? 1 : 0.6,
            },
          ]}
          onPress={handleCreateGroup}
          disabled={!canCreate}
        >
          {createGroupMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <ThemedText style={[styles.createButtonText, { color: canCreate ? "#FFFFFF" : theme.textSecondary }]}>
              Create Group
            </ThemedText>
          )}
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    fontSize: 16,
    borderWidth: 1,
  },
  descriptionInput: {
    height: 80,
    paddingTop: Spacing.sm,
    textAlignVertical: "top",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  selectedMembersSection: {
    marginBottom: Spacing.lg,
  },
  selectedMembersList: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  selectedMember: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    marginRight: Spacing.sm,
  },
  selectedMemberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedMemberInitials: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  selectedMemberName: {
    fontSize: 14,
    fontWeight: "500",
    maxWidth: 100,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 16,
    fontWeight: "500",
  },
  resultSubtext: {
    fontSize: 14,
    marginTop: 2,
  },
  noResultsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  noResultsText: {
    fontSize: 14,
  },
  spacer: {
    flex: 1,
  },
  createButton: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: "600",
  },
});
