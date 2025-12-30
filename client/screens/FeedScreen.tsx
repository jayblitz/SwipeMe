import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  mediaType: string | null;
  visibility: string;
  likesCount: string;
  commentsCount: string;
  tipsTotal: string;
  createdAt: string;
  author: PostAuthor;
  isLiked: boolean;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: PostAuthor;
}

function FeedItem({ 
  item, 
  onLike,
  onComment,
  onTip,
  onShare,
  onFollow,
  onProfilePress,
}: { 
  item: Post;
  onLike: (postId: string) => void;
  onComment: (postId: string) => void;
  onTip: (postId: string) => void;
  onShare: (postId: string) => void;
  onFollow: (userId: string) => void;
  onProfilePress: (userId: string) => void;
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const authorName = item.author.displayName || item.author.username || "Anonymous";
  const authorUsername = item.author.username ? `@${item.author.username}` : "";
  const isOwnPost = user?.id === item.authorId;
  const hasMedia = item.mediaUrls && item.mediaUrls.length > 0;
  const mediaUrl = hasMedia ? item.mediaUrls![0] : null;

  const handleDoubleTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLike(item.id);
  }, [item.id, onLike]);

  return (
    <View style={[styles.feedItem, { height: SCREEN_HEIGHT }]}>
      {hasMedia && mediaUrl ? (
        <Pressable style={styles.mediaContainer} onPress={handleDoubleTap}>
          <Image 
            source={{ uri: mediaUrl }} 
            style={styles.fullScreenMedia}
            contentFit="cover"
          />
        </Pressable>
      ) : (
        <View style={[styles.textPostContainer, { backgroundColor: theme.primary }]}>
          <Text style={styles.textPostContent}>{item.content}</Text>
        </View>
      )}

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.8)"]}
        style={styles.bottomGradient}
      />

      <View style={[styles.contentOverlay, { paddingBottom: insets.bottom + 80 }]}>
        <View style={styles.authorSection}>
          <Pressable 
            style={styles.authorRow}
            onPress={() => onProfilePress(item.authorId)}
          >
            <View style={styles.avatarContainer}>
              {item.author.profileImage ? (
                <Image source={{ uri: item.author.profileImage }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Feather name="user" size={18} color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{authorName}</Text>
              {authorUsername ? (
                <Text style={styles.authorUsername}>{authorUsername}</Text>
              ) : null}
            </View>
          </Pressable>
          
          {!isOwnPost ? (
            <Pressable 
              style={styles.followButton}
              onPress={() => onFollow(item.authorId)}
            >
              <Feather name="plus" size={14} color="#fff" />
              <Text style={styles.followButtonText}>Follow</Text>
            </Pressable>
          ) : null}
        </View>

        {item.content && hasMedia ? (
          <Text style={styles.caption} numberOfLines={3}>
            {item.content}
          </Text>
        ) : null}
      </View>

      <View style={[styles.actionsColumn, { paddingBottom: insets.bottom + 100 }]}>
        <Pressable 
          style={styles.actionItem}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onLike(item.id);
          }}
        >
          <Feather 
            name="heart" 
            size={28} 
            color={item.isLiked ? "#FF4458" : "#fff"}
          />
          <Text style={styles.actionCount}>
            {parseInt(item.likesCount) > 0 ? item.likesCount : ""}
          </Text>
        </Pressable>

        <Pressable 
          style={styles.actionItem}
          onPress={() => onComment(item.id)}
        >
          <Feather name="message-circle" size={28} color="#fff" />
          <Text style={styles.actionCount}>
            {parseInt(item.commentsCount) > 0 ? item.commentsCount : ""}
          </Text>
        </Pressable>

        <Pressable 
          style={styles.actionItem}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onTip(item.id);
          }}
        >
          <Feather name="dollar-sign" size={28} color="#fff" />
          <Text style={styles.actionCount}>
            {parseFloat(item.tipsTotal) > 0 ? `$${item.tipsTotal}` : ""}
          </Text>
        </Pressable>

        <Pressable 
          style={styles.actionItem}
          onPress={() => onShare(item.id)}
        >
          <Feather name="share" size={28} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [showComments, setShowComments] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipPostId, setTipPostId] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState("");
  const [tipLoading, setTipLoading] = useState(false);

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["/api/moments"],
    enabled: !!user,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/moments", selectedPostId, "comments"],
    enabled: !!selectedPostId,
  });

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("POST", `/api/moments/${postId}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
    },
  });

  const followMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/users/${userId}/follow`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      return apiRequest("POST", `/api/moments/${postId}/comments`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments", selectedPostId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      setCommentText("");
    },
  });

  const handleLike = useCallback((postId: string) => {
    likeMutation.mutate(postId);
  }, [likeMutation]);

  const handleComment = useCallback((postId: string) => {
    setSelectedPostId(postId);
    setShowComments(true);
  }, []);

  const handleTip = useCallback((postId: string) => {
    setTipPostId(postId);
    setShowTipModal(true);
  }, []);

  const handleShare = useCallback(async (_postId: string) => {
    try {
      await Share.share({
        message: `Check out this post on SwipeMe!`,
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  }, []);

  const handleFollow = useCallback((userId: string) => {
    followMutation.mutate(userId);
  }, [followMutation]);

  const handleProfilePress = useCallback((userId: string) => {
    navigation.navigate("CreatorProfile", { userId });
  }, [navigation]);

  const handleSendTip = useCallback(async () => {
    if (!tipPostId || !tipAmount) return;
    setTipLoading(true);
    try {
      const response = await apiRequest("POST", `/api/moments/${tipPostId}/tip`, { amount: tipAmount });
      const result = await response.json();
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Tip Sent!",
          `Your tip of $${tipAmount} was sent successfully.`,
          result.explorer ? [
            { 
              text: "View Transaction", 
              onPress: async () => {
                try {
                  await WebBrowser.openBrowserAsync(result.explorer);
                } catch {}
              }
            },
            { text: "Done", style: "cancel" }
          ] : [{ text: "Done" }]
        );
      } else {
        Alert.alert("Tip Failed", result.error || "Could not send tip");
      }
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to send tip");
    } finally {
      setTipLoading(false);
      setShowTipModal(false);
      setTipAmount("");
      setTipPostId(null);
    }
  }, [tipPostId, tipAmount, queryClient]);

  const handleSubmitComment = useCallback(() => {
    if (!selectedPostId || !commentText.trim()) return;
    addCommentMutation.mutate({ postId: selectedPostId, content: commentText.trim() });
  }, [selectedPostId, commentText, addCommentMutation]);

  const viewabilityConfig = useMemo(() => ({
    itemVisiblePercentThreshold: 50,
  }), []);

  const renderItem = useCallback(({ item }: { item: Post }) => (
    <FeedItem
      item={item}
      onLike={handleLike}
      onComment={handleComment}
      onTip={handleTip}
      onShare={handleShare}
      onFollow={handleFollow}
      onProfilePress={handleProfilePress}
    />
  ), [handleLike, handleComment, handleTip, handleShare, handleFollow, handleProfilePress]);

  const keyExtractor = useCallback((item: Post) => item.id, []);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: "#000" }]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={styles.topBarTitle}>Feed</Text>
        <Pressable 
          style={styles.createButton}
          onPress={() => navigation.navigate("CreatePost")}
        >
          <Feather name="plus" size={24} color="#fff" />
        </Pressable>
      </View>

      <Modal
        visible={showComments}
        animationType="slide"
        transparent
        onRequestClose={() => setShowComments(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowComments(false)}
        />
        <View style={[styles.commentsSheet, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.commentsHeader}>
            <Text style={[styles.commentsTitle, { color: theme.text }]}>Comments</Text>
            <Pressable onPress={() => setShowComments(false)}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          {commentsLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={theme.primary} />
          ) : comments.length === 0 ? (
            <Text style={[styles.noComments, { color: theme.textSecondary }]}>
              No comments yet. Be the first!
            </Text>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              renderItem={({ item: comment }) => (
                <View style={styles.commentItem}>
                  <View style={[styles.commentAvatar, { backgroundColor: theme.border }]}>
                    {comment.author.profileImage ? (
                      <Image source={{ uri: comment.author.profileImage }} style={styles.commentAvatarImage} />
                    ) : (
                      <Feather name="user" size={14} color={theme.textSecondary} />
                    )}
                  </View>
                  <View style={styles.commentContent}>
                    <Text style={[styles.commentAuthor, { color: theme.text }]}>
                      {comment.author.displayName || comment.author.username || "Anonymous"}
                    </Text>
                    <Text style={[styles.commentText, { color: theme.text }]}>
                      {comment.content}
                    </Text>
                  </View>
                </View>
              )}
              style={styles.commentsList}
            />
          )}

          <View style={[styles.commentInputContainer, { borderTopColor: theme.border, paddingBottom: insets.bottom }]}>
            <TextInput
              style={[styles.commentInput, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
              placeholder="Add a comment..."
              placeholderTextColor={theme.textSecondary}
              value={commentText}
              onChangeText={setCommentText}
              returnKeyType="send"
              onSubmitEditing={handleSubmitComment}
            />
            <Pressable 
              style={[styles.sendButton, { backgroundColor: theme.primary }]}
              onPress={handleSubmitComment}
              disabled={!commentText.trim() || addCommentMutation.isPending}
            >
              {addCommentMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="send" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTipModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowTipModal(false)}
      >
        <View style={styles.tipModalOverlay}>
          <View style={[styles.tipModal, { backgroundColor: theme.backgroundSecondary }]}>
            <Text style={[styles.tipTitle, { color: theme.text }]}>Send a Tip</Text>
            <Text style={[styles.tipSubtitle, { color: theme.textSecondary }]}>
              Send pathUSD to support this creator
            </Text>

            <View style={styles.tipAmounts}>
              {["1", "5", "10", "25"].map((amount) => (
                <Pressable
                  key={amount}
                  style={[
                    styles.tipAmountButton,
                    { borderColor: theme.border },
                    tipAmount === amount && { backgroundColor: theme.primary, borderColor: theme.primary }
                  ]}
                  onPress={() => setTipAmount(amount)}
                >
                  <Text style={[
                    styles.tipAmountText, 
                    { color: tipAmount === amount ? "#fff" : theme.text }
                  ]}>
                    ${amount}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.tipInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
              placeholder="Custom amount"
              placeholderTextColor={theme.textSecondary}
              value={tipAmount}
              onChangeText={setTipAmount}
              keyboardType="decimal-pad"
            />

            <View style={styles.tipActions}>
              <Pressable 
                style={[styles.tipCancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setShowTipModal(false);
                  setTipAmount("");
                  setTipPostId(null);
                }}
              >
                <Text style={{ color: theme.text }}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={[styles.tipSendButton, { backgroundColor: theme.primary }]}
                onPress={handleSendTip}
                disabled={!tipAmount || tipLoading}
              >
                {tipLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.tipSendText}>Send ${tipAmount || "0"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  feedItem: {
    width: SCREEN_WIDTH,
    justifyContent: "center",
    alignItems: "center",
  },
  mediaContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  fullScreenMedia: {
    width: "100%",
    height: "100%",
  },
  textPostContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  textPostContent: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 36,
  },
  playPauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  contentOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 80,
    paddingHorizontal: Spacing.lg,
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatarContainer: {
    marginRight: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  authorUsername: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
  followButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF4458",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  followButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  caption: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  actionsColumn: {
    position: "absolute",
    right: Spacing.md,
    bottom: 0,
    alignItems: "center",
    gap: Spacing.lg,
  },
  actionItem: {
    alignItems: "center",
    gap: 4,
  },
  actionCount: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  topBarTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  commentsSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "60%",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
  },
  commentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  commentsTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  noComments: {
    textAlign: "center",
    padding: Spacing.xl,
  },
  commentsList: {
    maxHeight: 300,
    paddingHorizontal: Spacing.lg,
  },
  commentItem: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  commentAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 18,
  },
  commentInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  commentInput: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  tipModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  tipModal: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  tipTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  tipSubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  tipAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  tipAmountButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: "center",
  },
  tipAmountText: {
    fontSize: 16,
    fontWeight: "600",
  },
  tipInput: {
    height: 48,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  tipActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  tipCancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: "center",
  },
  tipSendButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  tipSendText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
