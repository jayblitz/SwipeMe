import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_ITEM_SIZE = (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 2) / 3;

interface UserProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImage: string | null;
  status: string | null;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  posts: Post[];
}

interface Post {
  id: string;
  content: string | null;
  mediaUrls: string[] | null;
  mediaType: string | null;
  likesCount: string;
  createdAt: string;
}

type RouteParams = {
  CreatorProfile: { userId: string };
};

export default function CreatorProfileScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RouteParams, "CreatorProfile">>();
  const queryClient = useQueryClient();
  const { userId } = route.params;

  const isOwnProfile = user?.id === userId;

  const { data: profile, isLoading, error } = useQuery<UserProfile>({
    queryKey: ["/api/users", userId, "profile"],
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (profile?.isFollowing) {
        return apiRequest("DELETE", `/api/users/${userId}/follow`);
      }
      return apiRequest("POST", `/api/users/${userId}/follow`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleFollow = useCallback(() => {
    followMutation.mutate();
  }, [followMutation]);

  const renderPostItem = useCallback(({ item }: { item: Post }) => {
    const thumbnailUrl = item.mediaUrls && item.mediaUrls.length > 0 ? item.mediaUrls[0] : null;
    
    return (
      <Pressable style={styles.gridItem}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.gridImage} contentFit="cover" />
        ) : (
          <View style={[styles.textPostThumbnail, { backgroundColor: theme.primary }]}>
            <Text style={styles.textPostSnippet} numberOfLines={3}>
              {item.content}
            </Text>
          </View>
        )}
        {item.mediaType === "video" ? (
          <View style={styles.videoIndicator}>
            <Feather name="play" size={16} color="#fff" />
          </View>
        ) : null}
        <View style={styles.likesOverlay}>
          <Feather name="heart" size={12} color="#fff" />
          <Text style={styles.likesCount}>{item.likesCount}</Text>
        </View>
      </Pressable>
    );
  }, [theme.primary]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="user-x" size={48} color={theme.textSecondary} />
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>
          User not found
        </Text>
      </View>
    );
  }

  const displayName = profile.displayName || profile.username || "Anonymous";

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={profile.posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: Spacing.lg }]}>
            <View style={styles.avatarContainer}>
              {profile.profileImage ? (
                <Image source={{ uri: profile.profileImage }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.border }]}>
                  <Feather name="user" size={40} color={theme.textSecondary} />
                </View>
              )}
            </View>

            <Text style={[styles.displayName, { color: theme.text }]}>{displayName}</Text>
            {profile.username ? (
              <Text style={[styles.username, { color: theme.textSecondary }]}>
                @{profile.username}
              </Text>
            ) : null}
            {profile.status ? (
              <Text style={[styles.bio, { color: theme.text }]}>{profile.status}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: theme.text }]}>
                  {profile.posts.length}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Posts</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: theme.text }]}>
                  {profile.followersCount}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Followers</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: theme.text }]}>
                  {profile.followingCount}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Following</Text>
              </View>
            </View>

            {!isOwnProfile ? (
              <Pressable
                style={[
                  styles.followButton,
                  profile.isFollowing 
                    ? { backgroundColor: theme.backgroundSecondary, borderColor: theme.border, borderWidth: 1 }
                    : { backgroundColor: theme.primary }
                ]}
                onPress={handleFollow}
                disabled={followMutation.isPending}
              >
                {followMutation.isPending ? (
                  <ActivityIndicator size="small" color={profile.isFollowing ? theme.text : "#fff"} />
                ) : (
                  <Text style={[
                    styles.followButtonText,
                    { color: profile.isFollowing ? theme.text : "#fff" }
                  ]}>
                    {profile.isFollowing ? "Following" : "Follow"}
                  </Text>
                )}
              </Pressable>
            ) : null}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyPosts}>
            <Feather name="image" size={40} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No posts yet
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      />
    </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    fontSize: 16,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  avatarContainer: {
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  displayName: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
    marginBottom: Spacing.sm,
  },
  bio: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.xl * 2,
    marginBottom: Spacing.lg,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 12,
  },
  followButton: {
    paddingHorizontal: Spacing.xl * 2,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    minWidth: 140,
    alignItems: "center",
  },
  followButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    width: "100%",
  },
  gridRow: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    position: "relative",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  textPostThumbnail: {
    width: "100%",
    height: "100%",
    padding: Spacing.sm,
    justifyContent: "center",
  },
  textPostSnippet: {
    color: "#fff",
    fontSize: 11,
    textAlign: "center",
  },
  videoIndicator: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  likesOverlay: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  likesCount: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  emptyPosts: {
    alignItems: "center",
    paddingTop: Spacing.xl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 16,
  },
});
