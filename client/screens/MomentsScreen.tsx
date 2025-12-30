import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Card } from "@/components/Card";

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

export default function MomentsScreen() {
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipPostId, setTipPostId] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);

  const { data: posts = [], isLoading, refetch, isRefetching } = useQuery<Post[]>({
    queryKey: ["/api/moments"],
    enabled: !!user,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/moments", selectedPostId, "comments"],
    enabled: !!selectedPostId,
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: { content: string }) => {
      return apiRequest("POST", "/api/moments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      setIsComposeOpen(false);
      setComposeText("");
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("POST", `/api/moments/${postId}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
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

  const handlePost = useCallback(() => {
    if (!composeText.trim()) return;
    createPostMutation.mutate({ content: composeText.trim() });
  }, [composeText, createPostMutation]);

  const handleTip = useCallback(async () => {
    if (!tipPostId || !tipAmount) return;
    setTipLoading(true);
    try {
      const response = await apiRequest("POST", `/api/moments/${tipPostId}/tip`, { amount: tipAmount });
      const result = await response.json();
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
        const explorerUrl = result.explorer;
        Alert.alert(
          "Tip Sent!",
          `Your tip of $${tipAmount} was sent successfully.`,
          explorerUrl ? [
            { 
              text: "View Transaction", 
              onPress: async () => {
                try {
                  await WebBrowser.openBrowserAsync(explorerUrl);
                } catch {
                  Alert.alert("Error", "Could not open transaction explorer");
                }
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

  const handleLike = useCallback((postId: string) => {
    likeMutation.mutate(postId);
  }, [likeMutation]);

  const formatTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  }, []);

  const renderPost = useCallback(({ item }: { item: Post }) => {
    const authorName = item.author.displayName || item.author.username || "Anonymous";
    const authorUsername = item.author.username ? `@${item.author.username}` : "";

    return (
      <Card style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={[styles.avatar, { backgroundColor: theme.border }]}>
            {item.author.profileImage ? (
              <Image source={{ uri: item.author.profileImage }} style={styles.avatarImage} />
            ) : (
              <Feather name="user" size={20} color={theme.textSecondary} />
            )}
          </View>
          <View style={styles.postHeaderText}>
            <Text style={[styles.authorName, { color: theme.text }]}>{authorName}</Text>
            <View style={styles.metaRow}>
              {authorUsername ? (
                <Text style={[styles.username, { color: theme.textSecondary }]}>{authorUsername}</Text>
              ) : null}
              <Text style={[styles.time, { color: theme.textSecondary }]}>
                {authorUsername ? " · " : ""}{formatTime(item.createdAt)}
              </Text>
            </View>
          </View>
          <Pressable style={styles.moreButton}>
            <Feather name="more-horizontal" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        {item.content ? (
          <Text style={[styles.postContent, { color: theme.text }]}>{item.content}</Text>
        ) : null}

        {item.mediaUrls && item.mediaUrls.length > 0 ? (
          <View style={styles.mediaGrid}>
            {item.mediaUrls.slice(0, 4).map((url, index) => (
              <View
                key={index}
                style={[
                  styles.mediaItem,
                  item.mediaUrls!.length === 1 && styles.mediaSingle,
                  item.mediaUrls!.length === 2 && styles.mediaDouble,
                ]}
              >
                <Image source={{ uri: url }} style={styles.mediaImage} contentFit="cover" />
                {index === 3 && item.mediaUrls!.length > 4 ? (
                  <View style={styles.moreOverlay}>
                    <Text style={styles.moreText}>+{item.mediaUrls!.length - 4}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.postActions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => handleLike(item.id)}
          >
            <Feather
              name="heart"
              size={20}
              color={item.isLiked ? theme.error : theme.textSecondary}
              style={item.isLiked ? { opacity: 1 } : undefined}
            />
            <Text style={[styles.actionCount, { color: theme.textSecondary }]}>
              {parseInt(item.likesCount) > 0 ? item.likesCount : ""}
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={() => setSelectedPostId(item.id)}
          >
            <Feather name="message-circle" size={20} color={theme.textSecondary} />
            <Text style={[styles.actionCount, { color: theme.textSecondary }]}>
              {parseInt(item.commentsCount) > 0 ? item.commentsCount : ""}
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={() => {
              setTipPostId(item.id);
              setShowTipModal(true);
            }}
          >
            <Feather name="dollar-sign" size={20} color={theme.textSecondary} />
            <Text style={[styles.actionCount, { color: theme.textSecondary }]}>
              {parseFloat(item.tipsTotal) > 0 ? `$${item.tipsTotal}` : ""}
            </Text>
          </Pressable>

          <Pressable style={styles.actionButton}>
            <Feather name="share" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      </Card>
    );
  }, [theme, formatTime, handleLike]);

  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: insets.bottom + 80,
          paddingHorizontal: Spacing.md,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.light.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="image" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Moments Yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Share your first moment with friends
            </Text>
          </View>
        }
      />

      <Pressable
        style={[styles.fab, { backgroundColor: Colors.light.primary }]}
        onPress={() => setIsComposeOpen(true)}
      >
        <Feather name="plus" size={24} color="#FFF" />
      </Pressable>

      <Modal
        visible={isComposeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsComposeOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setIsComposeOpen(false)}>
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New Moment</Text>
            <Pressable
              onPress={handlePost}
              disabled={createPostMutation.isPending || !composeText.trim()}
            >
              <Text
                style={[
                  styles.postButton,
                  {
                    color: !composeText.trim()
                      ? theme.textSecondary
                      : Colors.light.primary,
                  },
                ]}
              >
                {createPostMutation.isPending ? "Posting..." : "Post"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.composeContent}>
            <TextInput
              style={[styles.composeInput, { color: theme.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={theme.textSecondary}
              multiline
              value={composeText}
              onChangeText={setComposeText}
              autoFocus
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!selectedPostId}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedPostId(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedPostId(null)}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Comments</Text>
            <View style={{ width: 24 }} />
          </View>

          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: Spacing.md }}
            ListEmptyComponent={
              commentsLoading ? (
                <ActivityIndicator size="small" color={Colors.light.primary} />
              ) : (
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary, textAlign: "center" }]}>
                  No comments yet. Be the first!
                </Text>
              )
            }
            renderItem={({ item }) => (
              <View style={styles.commentItem}>
                <View style={[styles.commentAvatar, { backgroundColor: theme.border }]}>
                  {item.author.profileImage ? (
                    <Image source={{ uri: item.author.profileImage }} style={styles.avatarImage} />
                  ) : (
                    <Feather name="user" size={14} color={theme.textSecondary} />
                  )}
                </View>
                <View style={styles.commentContent}>
                  <Text style={[styles.commentAuthor, { color: theme.text }]}>
                    {item.author.displayName || item.author.username || "Anonymous"}
                  </Text>
                  <Text style={[styles.commentText, { color: theme.text }]}>{item.content}</Text>
                  <Text style={[styles.commentTime, { color: theme.textSecondary }]}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            )}
          />

          <View style={[styles.commentInputRow, { borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.sm }]}>
            <TextInput
              style={[styles.commentInput, { color: theme.text, backgroundColor: theme.backgroundSecondary }]}
              placeholder="Add a comment..."
              placeholderTextColor={theme.textSecondary}
              value={commentText}
              onChangeText={setCommentText}
            />
            <Pressable
              style={styles.sendButton}
              onPress={() => {
                if (selectedPostId && commentText.trim()) {
                  addCommentMutation.mutate({ postId: selectedPostId, content: commentText.trim() });
                }
              }}
              disabled={!commentText.trim() || addCommentMutation.isPending}
            >
              <Feather
                name="send"
                size={20}
                color={commentText.trim() ? Colors.light.primary : theme.textSecondary}
              />
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
          <View style={[styles.tipModalContent, { backgroundColor: theme.backgroundSecondary }]}>
            <Text style={[styles.tipModalTitle, { color: theme.text }]}>Send a Tip</Text>
            <Text style={[styles.tipModalSubtitle, { color: theme.textSecondary }]}>
              Show appreciation for this moment
            </Text>

            <View style={styles.tipAmountRow}>
              {["1", "5", "10", "25"].map((amount) => (
                <Pressable
                  key={amount}
                  style={[
                    styles.tipPreset,
                    tipAmount === amount && { backgroundColor: Colors.light.primary },
                    { borderColor: theme.border },
                  ]}
                  onPress={() => setTipAmount(amount)}
                >
                  <Text
                    style={[
                      styles.tipPresetText,
                      { color: tipAmount === amount ? "#FFF" : theme.text },
                    ]}
                  >
                    ${amount}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.tipInput, { color: theme.text, borderColor: theme.border }]}
              placeholder="Custom amount"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              value={tipAmount}
              onChangeText={setTipAmount}
            />

            <View style={styles.tipModalButtons}>
              <Pressable
                style={[styles.tipCancelButton, { borderColor: theme.border }]}
                onPress={() => {
                  setShowTipModal(false);
                  setTipAmount("");
                  setTipPostId(null);
                }}
                disabled={tipLoading}
              >
                <Text style={[styles.tipCancelText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tipConfirmButton,
                  { backgroundColor: tipAmount && !tipLoading ? Colors.light.primary : theme.border },
                ]}
                onPress={handleTip}
                disabled={!tipAmount || tipLoading}
              >
                {tipLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.tipConfirmText}>Tip ${tipAmount || "0"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: typeof Colors.light, _isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.backgroundRoot,
    },
    centerContent: {
      justifyContent: "center",
      alignItems: "center",
    },
    postCard: {
      marginBottom: Spacing.md,
      padding: Spacing.md,
    },
    postHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: Spacing.sm,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    postHeaderText: {
      flex: 1,
      marginLeft: Spacing.sm,
    },
    authorName: {
      fontSize: Typography.body.fontSize,
      fontWeight: "600",
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    username: {
      fontSize: Typography.caption.fontSize,
    },
    time: {
      fontSize: Typography.caption.fontSize,
    },
    moreButton: {
      padding: Spacing.xs,
    },
    postContent: {
      fontSize: Typography.body.fontSize,
      lineHeight: 22,
      marginBottom: Spacing.sm,
    },
    mediaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: Spacing.xs,
      marginBottom: Spacing.sm,
      gap: 4,
    },
    mediaItem: {
      width: "48%",
      aspectRatio: 1,
      borderRadius: BorderRadius.md,
      overflow: "hidden",
    },
    mediaSingle: {
      width: "100%",
      aspectRatio: 16 / 9,
    },
    mediaDouble: {
      width: "49%",
    },
    mediaImage: {
      width: "100%",
      height: "100%",
    },
    moreOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    moreText: {
      color: "#FFF",
      fontSize: Typography.h3.fontSize,
      fontWeight: "700",
    },
    postActions: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    actionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: Spacing.xs,
    },
    actionCount: {
      marginLeft: Spacing.xs,
      fontSize: Typography.caption.fontSize,
    },
    emptyState: {
      alignItems: "center",
      paddingTop: 100,
    },
    emptyTitle: {
      fontSize: Typography.h3.fontSize,
      fontWeight: "600",
      marginTop: Spacing.md,
    },
    emptySubtitle: {
      fontSize: Typography.body.fontSize,
      marginTop: Spacing.xs,
    },
    fab: {
      position: "absolute",
      right: Spacing.lg,
      bottom: 100,
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    modalContainer: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontSize: Typography.h3.fontSize,
      fontWeight: "600",
    },
    cancelText: {
      fontSize: Typography.body.fontSize,
    },
    postButton: {
      fontSize: Typography.body.fontSize,
      fontWeight: "600",
    },
    composeContent: {
      flex: 1,
      padding: Spacing.md,
    },
    composeInput: {
      fontSize: Typography.body.fontSize,
      lineHeight: 24,
      textAlignVertical: "top",
      minHeight: 120,
    },
    imagePreviewGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: Spacing.md,
    },
    imagePreview: {
      width: 80,
      height: 80,
      borderRadius: BorderRadius.sm,
      overflow: "hidden",
    },
    previewImage: {
      width: "100%",
      height: "100%",
    },
    removeImage: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    composeFooter: {
      flexDirection: "row",
      padding: Spacing.md,
      borderTopWidth: 1,
    },
    mediaButton: {
      padding: Spacing.sm,
      marginRight: Spacing.sm,
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
      overflow: "hidden",
    },
    commentContent: {
      flex: 1,
      marginLeft: Spacing.sm,
    },
    commentAuthor: {
      fontSize: Typography.caption.fontSize,
      fontWeight: "600",
    },
    commentText: {
      fontSize: Typography.body.fontSize,
      marginTop: 2,
    },
    commentTime: {
      fontSize: Typography.small.fontSize,
      marginTop: 4,
    },
    commentInputRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: Spacing.md,
      borderTopWidth: 1,
    },
    commentInput: {
      flex: 1,
      height: 40,
      borderRadius: 20,
      paddingHorizontal: Spacing.md,
      fontSize: Typography.body.fontSize,
    },
    sendButton: {
      marginLeft: Spacing.sm,
      padding: Spacing.sm,
    },
    tipModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: Spacing.lg,
    },
    tipModalContent: {
      width: "100%",
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
    },
    tipModalTitle: {
      fontSize: Typography.h3.fontSize,
      fontWeight: "700",
      textAlign: "center",
    },
    tipModalSubtitle: {
      fontSize: Typography.body.fontSize,
      textAlign: "center",
      marginTop: Spacing.xs,
      marginBottom: Spacing.lg,
    },
    tipAmountRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: Spacing.md,
    },
    tipPreset: {
      flex: 1,
      marginHorizontal: 4,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      alignItems: "center",
    },
    tipPresetText: {
      fontSize: Typography.body.fontSize,
      fontWeight: "600",
    },
    tipInput: {
      height: 48,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      paddingHorizontal: Spacing.md,
      fontSize: Typography.body.fontSize,
      textAlign: "center",
      marginBottom: Spacing.lg,
    },
    tipModalButtons: {
      flexDirection: "row",
      gap: Spacing.md,
    },
    tipCancelButton: {
      flex: 1,
      height: 48,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    tipCancelText: {
      fontSize: Typography.body.fontSize,
      fontWeight: "600",
    },
    tipConfirmButton: {
      flex: 1,
      height: 48,
      borderRadius: BorderRadius.md,
      justifyContent: "center",
      alignItems: "center",
    },
    tipConfirmText: {
      color: "#FFF",
      fontSize: Typography.body.fontSize,
      fontWeight: "600",
    },
  });
}
