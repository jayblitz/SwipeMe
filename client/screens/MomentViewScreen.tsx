import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { MomentsStackParamList } from "@/navigation/MomentsStackNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

interface PostAuthor {
  id: string;
  username: string | null;
  displayName: string | null;
  profileImage: string | null;
}

interface Post {
  id: string;
  authorId: string;
  content: string | null;
  mediaUrls: string[] | null;
  mediaType: "text" | "photo" | "video";
  likesCount: string;
  commentsCount: string;
  tipsTotal: string;
  createdAt: string;
  author: PostAuthor;
  isLiked: boolean;
}

export default function MomentViewScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NativeStackNavigationProp<MomentsStackParamList>>();
  const route = useRoute<RouteProp<MomentsStackParamList, "MomentView">>();
  const { postId } = route.params;

  const { data: post, isLoading, error } = useQuery<Post>({
    queryKey: ["/api/moments", postId],
    enabled: !!user && !!postId,
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.centerContent, { paddingTop: headerHeight + Spacing.lg }]}>
          <Feather name="lock" size={48} color={theme.textSecondary} />
          <Text style={[styles.messageTitle, { color: theme.text }]}>
            Sign in to view this moment
          </Text>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate("Feed")}
          >
            <Text style={styles.actionButtonText}>Go to Feed</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.centerContent, { paddingTop: headerHeight + Spacing.lg }]}>
          <Feather name="alert-circle" size={48} color={theme.textSecondary} />
          <Text style={[styles.messageTitle, { color: theme.text }]}>
            Moment not found
          </Text>
          <Pressable
            style={[styles.actionButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate("Feed")}
          >
            <Text style={styles.actionButtonText}>Go to Feed</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const authorName = post.author.displayName || post.author.username || "User";
  const avatarInitial = authorName.charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: insets.bottom + Spacing.lg }
        ]}
      >
        <View style={[styles.postCard, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.authorSection}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              {post.author.profileImage ? (
                <Image source={{ uri: post.author.profileImage }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>{avatarInitial}</Text>
              )}
            </View>
            <View style={styles.authorInfo}>
              <Text style={[styles.authorName, { color: theme.text }]}>{authorName}</Text>
              <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
                @{post.author.username || "user"} - {formatTime(post.createdAt)}
              </Text>
            </View>
          </View>

          {post.mediaUrls && post.mediaUrls.length > 0 && (
            <View style={styles.mediaContainer}>
              {post.mediaType === "video" ? (
                <Video
                  source={{ uri: post.mediaUrls[0] }}
                  style={styles.media}
                  resizeMode={ResizeMode.CONTAIN}
                  useNativeControls
                  isLooping
                />
              ) : (
                <Image
                  source={{ uri: post.mediaUrls[0] }}
                  style={styles.media}
                  contentFit="contain"
                />
              )}
            </View>
          )}

          {post.content ? (
            <Text style={[styles.postContent, { color: theme.text }]}>{post.content}</Text>
          ) : null}

          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            <View style={styles.stat}>
              <Feather name="heart" size={18} color={theme.textSecondary} />
              <Text style={[styles.statText, { color: theme.textSecondary }]}>
                {post.likesCount || "0"}
              </Text>
            </View>
            <View style={styles.stat}>
              <Feather name="message-circle" size={18} color={theme.textSecondary} />
              <Text style={[styles.statText, { color: theme.textSecondary }]}>
                {post.commentsCount || "0"}
              </Text>
            </View>
            <View style={styles.stat}>
              <Feather name="dollar-sign" size={18} color={theme.textSecondary} />
              <Text style={[styles.statText, { color: theme.textSecondary }]}>
                ${parseFloat(post.tipsTotal || "0").toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.viewAllButton, { borderColor: theme.primary }]}
          onPress={() => navigation.navigate("Feed")}
        >
          <Text style={[styles.viewAllText, { color: theme.primary }]}>
            View All Moments
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  messageTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  actionButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  postCard: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontWeight: "600",
    fontSize: 16,
  },
  timestamp: {
    fontSize: 13,
    marginTop: 2,
  },
  mediaContainer: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#000",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  postContent: {
    padding: Spacing.md,
    fontSize: 16,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: "row",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.lg,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statText: {
    fontSize: 14,
  },
  viewAllButton: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  viewAllText: {
    fontWeight: "600",
    fontSize: 16,
  },
});
