import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Animated,
  ScrollView,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { Share } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

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
  mediaType: "text" | "photo" | "video";
  hashtags: string[] | null;
  visibility: string;
  likesCount: string;
  commentsCount: string;
  tipsTotal: string;
  createdAt: string;
  author: PostAuthor;
  isLiked: boolean;
}

interface TrendingHashtag {
  hashtag: string;
  count: number;
  postCount: number;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: PostAuthor;
}

interface ViewableItem {
  viewableItems: ViewToken[];
  changed: ViewToken[];
}

export default function MomentsScreen() {
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipPostId, setTipPostId] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  
  const viewStartTimeRef = useRef<number>(0);
  const likeAnimations = useRef<Map<string, Animated.Value>>(new Map());
  const lastTapRef = useRef<Map<string, number>>(new Map());
  const heartAnimationRef = useRef<Map<string, Animated.Value>>(new Map());
  const videoRefs = useRef<Map<string, Video>>(new Map());

  const [feedMode, _setFeedMode] = useState<"recommended" | "chronological">("recommended");
  
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [showTrending, setShowTrending] = useState(true);

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: selectedHashtag 
      ? ["/api/moments/hashtag", selectedHashtag] 
      : ["/api/moments", { mode: feedMode }],
    enabled: !!user,
  });

  const { data: trendingHashtags = [] } = useQuery<TrendingHashtag[]>({
    queryKey: ["/api/moments/trending"],
    enabled: !!user,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/moments", selectedPostId, "comments"],
    enabled: !!selectedPostId,
  });

  const styles = useMemo(() => createStyles(theme, isDark, insets), [theme, isDark, insets]);

  const trackEngagement = useCallback(async (postId: string, eventType: string, data?: Record<string, unknown>) => {
    try {
      await apiRequest("POST", `/api/moments/${postId}/engagement`, {
        eventType,
        ...data,
      });
    } catch {
    }
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: ViewableItem) => {
    if (viewableItems.length > 0) {
      const visibleItem = viewableItems[0];
      const newIndex = visibleItem.index ?? 0;
      
      if (currentIndex !== newIndex && posts[currentIndex]) {
        const viewDuration = Date.now() - viewStartTimeRef.current;
        trackEngagement(posts[currentIndex].id, "view_completed", { 
          durationMs: viewDuration,
          wasSkipped: viewDuration < 2000
        });
        
        const previousPost = posts[currentIndex];
        if (previousPost.mediaType === "video") {
          const previousVideo = videoRefs.current.get(previousPost.id);
          previousVideo?.pauseAsync();
        }
      }
      
      setCurrentIndex(newIndex);
      viewStartTimeRef.current = Date.now();
      
      if (posts[newIndex]) {
        trackEngagement(posts[newIndex].id, "view_started");
        
        const newPost = posts[newIndex];
        if (newPost.mediaType === "video") {
          const newVideo = videoRefs.current.get(newPost.id);
          newVideo?.playAsync();
        }
      }
    }
  }, [currentIndex, posts, trackEngagement]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 80,
    minimumViewTime: 100,
  }).current;

  const createPostMutation = useMutation({
    mutationFn: async (data: { content: string }) => {
      return apiRequest("POST", "/api/moments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      setIsComposeOpen(false);
      setComposeText("");
    },
    onError: (error: Error) => {
      Alert.alert("Post Failed", error.message || "Could not create post. Please try again.");
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (postId: string) => {
      return apiRequest("POST", `/api/moments/${postId}/like`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
    },
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Could not like post.");
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
    onError: (error: Error) => {
      Alert.alert("Error", error.message || "Could not add comment.");
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
        trackEngagement(tipPostId, "tip", { amount: tipAmount });
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
  }, [tipPostId, tipAmount, queryClient, trackEngagement]);

  const handleLike = useCallback((postId: string, isLiked: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    let animation = likeAnimations.current.get(postId);
    if (!animation) {
      animation = new Animated.Value(1);
      likeAnimations.current.set(postId, animation);
    }
    
    Animated.sequence([
      Animated.spring(animation, { toValue: 1.3, useNativeDriver: true }),
      Animated.spring(animation, { toValue: 1, useNativeDriver: true }),
    ]).start();
    
    likeMutation.mutate(postId);
    trackEngagement(postId, isLiked ? "unlike" : "like");
  }, [likeMutation, trackEngagement]);

  const handleShare = useCallback(async (postId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      trackEngagement(postId, "share");
      
      const response = await apiRequest("POST", `/api/moments/${postId}/share`);
      const result = await response.json();
      
      if (result.success) {
        await Share.share({
          message: result.shareMessage,
          url: result.shareUrl,
        });
      }
    } catch (error) {
      if ((error as any)?.message !== "User dismissed the Share screen") {
        console.error("Share error:", error);
      }
    }
  }, [trackEngagement]);

  const handleHashtagPress = useCallback((hashtag: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedHashtag(hashtag);
    setShowTrending(false);
  }, []);

  const clearHashtagFilter = useCallback(() => {
    setSelectedHashtag(null);
    setShowTrending(true);
  }, []);

  const handleTap = useCallback((postId: string, isLiked: boolean) => {
    const now = Date.now();
    const lastTap = lastTapRef.current.get(postId) || 0;
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      lastTapRef.current.delete(postId);
      
      let heartAnim = heartAnimationRef.current.get(postId);
      if (!heartAnim) {
        heartAnim = new Animated.Value(0);
        heartAnimationRef.current.set(postId, heartAnim);
      }
      
      Animated.sequence([
        Animated.timing(heartAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(500),
        Animated.timing(heartAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      
      if (!isLiked) {
        handleLike(postId, false);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      lastTapRef.current.set(postId, now);
    }
  }, [handleLike]);

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

  const formatNumber = useCallback((num: string | number) => {
    const n = typeof num === "string" ? parseInt(num) : num;
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  }, []);

  const renderPost = useCallback(({ item, index }: { item: Post; index: number }) => {
    const authorName = item.author.displayName || item.author.username || "Anonymous";
    const authorUsername = item.author.username ? `@${item.author.username}` : "";
    const hasMedia = item.mediaUrls && item.mediaUrls.length > 0;
    const isVideo = item.mediaType === "video";
    const likeAnimation = likeAnimations.current.get(item.id) || new Animated.Value(1);

    const renderMediaContent = () => {
      if (hasMedia && isVideo) {
        return (
          <Video
            ref={(ref) => {
              if (ref) {
                videoRefs.current.set(item.id, ref);
              } else {
                videoRefs.current.delete(item.id);
              }
            }}
            source={{ uri: item.mediaUrls![0] }}
            style={styles.fullScreenMedia}
            resizeMode={ResizeMode.COVER}
            isLooping={true}
            shouldPlay={currentIndex === index}
            isMuted={false}
          />
        );
      } else if (hasMedia) {
        return (
          <Image
            source={{ uri: item.mediaUrls![0] }}
            style={styles.fullScreenMedia}
            contentFit="cover"
          />
        );
      } else {
        return (
          <LinearGradient
            colors={isDark ? ["#1a1a2e", "#16213e", "#0f3460"] : ["#667eea", "#764ba2", "#f64f59"]}
            style={styles.gradientBackground}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        );
      }
    };

    return (
      <Pressable 
        style={styles.postContainer}
        onPress={() => {
          handleTap(item.id, item.isLiked);
        }}
      >
        {renderMediaContent()}
        
        <Animated.View 
          style={[
            styles.doubleTapHeart,
            {
              opacity: heartAnimationRef.current.get(item.id) || 0,
              transform: [{ 
                scale: (heartAnimationRef.current.get(item.id) || new Animated.Value(0)).interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1.2],
                })
              }],
            }
          ]}
          pointerEvents="none"
        >
          <Feather name="heart" size={100} color="#FF2D55" />
        </Animated.View>
        
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={styles.bottomGradient}
        />

        <View style={styles.contentOverlay}>
          <View style={styles.authorRow}>
            <View style={styles.authorAvatar}>
              {item.author.profileImage ? (
                <Image source={{ uri: item.author.profileImage }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {authorName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{authorName}</Text>
              {authorUsername ? (
                <Text style={styles.authorUsername}>{authorUsername}</Text>
              ) : null}
            </View>
            <Pressable style={styles.followButton}>
              <Text style={styles.followButtonText}>Follow</Text>
            </Pressable>
          </View>

          {item.content ? (
            <Text style={styles.postContent} numberOfLines={3}>
              {item.content}
            </Text>
          ) : null}

          <View style={styles.postMeta}>
            <Feather name="clock" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.postTime}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.sideActions}>
          <Pressable
            style={styles.sideActionButton}
            onPress={() => handleLike(item.id, item.isLiked)}
          >
            <Animated.View style={{ transform: [{ scale: likeAnimation }] }}>
              <Feather
                name="heart"
                size={28}
                color={item.isLiked ? "#FF2D55" : "#FFF"}
              />
            </Animated.View>
            <Text style={styles.sideActionCount}>
              {formatNumber(item.likesCount)}
            </Text>
          </Pressable>

          <Pressable
            style={styles.sideActionButton}
            onPress={() => {
              setSelectedPostId(item.id);
              trackEngagement(item.id, "comment_opened");
            }}
          >
            <Feather name="message-circle" size={28} color="#FFF" />
            <Text style={styles.sideActionCount}>
              {formatNumber(item.commentsCount)}
            </Text>
          </Pressable>

          <Pressable
            style={styles.sideActionButton}
            onPress={() => {
              setTipPostId(item.id);
              setShowTipModal(true);
            }}
          >
            <Feather name="dollar-sign" size={28} color="#FFF" />
            <Text style={styles.sideActionCount}>
              {parseFloat(item.tipsTotal) > 0 ? `$${item.tipsTotal}` : "Tip"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.sideActionButton}
            onPress={() => handleShare(item.id)}
          >
            <Feather name="share" size={28} color="#FFF" />
            <Text style={styles.sideActionCount}>Share</Text>
          </Pressable>

          <Pressable style={styles.sideActionButton}>
            <Feather name="more-horizontal" size={28} color="#FFF" />
          </Pressable>
        </View>

        <View style={styles.progressIndicator}>
          <Text style={styles.progressText}>
            {index + 1} / {posts.length}
          </Text>
        </View>
      </Pressable>
    );
  }, [theme, formatTime, formatNumber, handleLike, handleTap, handleShare, posts.length, styles, isDark, trackEngagement, currentIndex]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#FFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        removeClippedSubviews={Platform.OS === "android"}
        ListEmptyComponent={
          <View style={[styles.postContainer, styles.emptyState]}>
            <LinearGradient
              colors={["#667eea", "#764ba2"]}
              style={styles.gradientBackground}
            />
            <View style={styles.emptyContent}>
              <Feather name="camera" size={64} color="rgba(255,255,255,0.8)" />
              <Text style={styles.emptyTitle}>No Moments Yet</Text>
              <Text style={styles.emptySubtitle}>
                Be the first to share a moment
              </Text>
              <Pressable
                style={styles.createFirstButton}
                onPress={() => setIsComposeOpen(true)}
              >
                <Text style={styles.createFirstText}>Create Moment</Text>
              </Pressable>
            </View>
          </View>
        }
      />

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.topBarRow}>
          {selectedHashtag ? (
            <Pressable style={styles.hashtagBackButton} onPress={clearHashtagFilter}>
              <Feather name="arrow-left" size={20} color="#FFF" />
            </Pressable>
          ) : null}
          <Text style={styles.topBarTitle}>
            {selectedHashtag ? `#${selectedHashtag}` : "Moments"}
          </Text>
        </View>
        <Pressable
          style={styles.createButton}
          onPress={() => setIsComposeOpen(true)}
        >
          <Feather name="plus" size={24} color="#FFF" />
        </Pressable>
      </View>

      {showTrending && trendingHashtags.length > 0 ? (
        <View style={[styles.trendingContainer, { top: insets.top + 60 }]}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendingScroll}
          >
            <Feather name="trending-up" size={16} color="rgba(255,255,255,0.8)" style={{ marginRight: Spacing.sm }} />
            {trendingHashtags.map((item) => (
              <Pressable
                key={item.hashtag}
                style={styles.trendingTag}
                onPress={() => handleHashtagPress(item.hashtag)}
              >
                <Text style={styles.trendingTagText}>#{item.hashtag}</Text>
                <Text style={styles.trendingTagCount}>{item.postCount}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

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
          <View style={[styles.modalHeader, { paddingTop: insets.top }]}>
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
                  styles.postButtonText,
                  { color: !composeText.trim() ? theme.textSecondary : Colors.light.primary },
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
          <View style={[styles.modalHeader, { paddingTop: insets.top }]}>
            <Pressable onPress={() => setSelectedPostId(null)}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Comments</Text>
            <View style={{ width: 24 }} />
          </View>

          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: Spacing.md, flexGrow: 1 }}
            ListEmptyComponent={
              commentsLoading ? (
                <ActivityIndicator size="small" color={Colors.light.primary} />
              ) : (
                <Text style={[styles.emptyComments, { color: theme.textSecondary }]}>
                  No comments yet. Be the first!
                </Text>
              )
            }
            renderItem={({ item }) => (
              <View style={styles.commentItem}>
                <View style={[styles.commentAvatar, { backgroundColor: theme.border }]}>
                  {item.author.profileImage ? (
                    <Image source={{ uri: item.author.profileImage }} style={styles.smallAvatar} />
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

          <View style={[styles.commentInputRow, { paddingBottom: insets.bottom + Spacing.sm, borderTopColor: theme.border }]}>
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
                  <Text style={styles.tipConfirmText}>Send Tip</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>["theme"], _isDark: boolean, insets: ReturnType<typeof useSafeAreaInsets>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    centerContent: {
      justifyContent: "center",
      alignItems: "center",
    },
    postContainer: {
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      position: "relative",
    },
    fullScreenMedia: {
      ...StyleSheet.absoluteFillObject,
    },
    doubleTapHeart: {
      position: "absolute",
      top: "50%",
      left: "50%",
      marginTop: -50,
      marginLeft: -50,
      zIndex: 100,
    },
    gradientBackground: {
      ...StyleSheet.absoluteFillObject,
    },
    bottomGradient: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: SCREEN_HEIGHT * 0.4,
    },
    contentOverlay: {
      position: "absolute",
      bottom: 100,
      left: Spacing.lg,
      right: 80,
    },
    authorRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: Spacing.md,
    },
    authorAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "#FFF",
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    avatarPlaceholder: {
      width: "100%",
      height: "100%",
      backgroundColor: Colors.light.primary,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarInitial: {
      color: "#FFF",
      fontSize: 18,
      fontWeight: "700",
    },
    authorInfo: {
      flex: 1,
      marginLeft: Spacing.sm,
    },
    authorName: {
      color: "#FFF",
      fontSize: 16,
      fontWeight: "700",
    },
    authorUsername: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 13,
    },
    followButton: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: "#FFF",
    },
    followButtonText: {
      color: "#FFF",
      fontSize: 13,
      fontWeight: "600",
    },
    postContent: {
      color: "#FFF",
      fontSize: 15,
      lineHeight: 22,
      marginBottom: Spacing.sm,
    },
    postMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    postTime: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 12,
    },
    sideActions: {
      position: "absolute",
      right: Spacing.md,
      bottom: 120,
      alignItems: "center",
      gap: Spacing.lg,
    },
    sideActionButton: {
      alignItems: "center",
      gap: 4,
    },
    sideActionCount: {
      color: "#FFF",
      fontSize: 12,
      fontWeight: "600",
    },
    progressIndicator: {
      position: "absolute",
      top: insets.top + 60,
      right: Spacing.md,
      backgroundColor: "rgba(0,0,0,0.5)",
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
    },
    progressText: {
      color: "#FFF",
      fontSize: 12,
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
    topBarRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    hashtagBackButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    topBarTitle: {
      color: "#FFF",
      fontSize: 20,
      fontWeight: "700",
    },
    trendingContainer: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 10,
    },
    trendingScroll: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xs,
      alignItems: "center",
    },
    trendingTag: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      marginRight: Spacing.sm,
      gap: Spacing.xs,
    },
    trendingTagText: {
      color: "#FFF",
      fontSize: 13,
      fontWeight: "600",
    },
    trendingTagCount: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 11,
      fontWeight: "500",
    },
    createButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.2)",
      justifyContent: "center",
      alignItems: "center",
    },
    emptyState: {
      justifyContent: "center",
      alignItems: "center",
    },
    emptyContent: {
      alignItems: "center",
      gap: Spacing.md,
    },
    emptyTitle: {
      color: "#FFF",
      fontSize: 24,
      fontWeight: "700",
    },
    emptySubtitle: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 16,
    },
    createFirstButton: {
      marginTop: Spacing.lg,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      backgroundColor: Colors.light.primary,
      borderRadius: BorderRadius.lg,
    },
    createFirstText: {
      color: "#FFF",
      fontSize: 16,
      fontWeight: "600",
    },
    modalContainer: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    cancelText: {
      fontSize: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "600",
    },
    postButtonText: {
      fontSize: 16,
      fontWeight: "600",
    },
    composeContent: {
      flex: 1,
      padding: Spacing.md,
    },
    composeInput: {
      fontSize: 18,
      lineHeight: 26,
      minHeight: 200,
      textAlignVertical: "top",
    },
    commentItem: {
      flexDirection: "row",
      marginBottom: Spacing.md,
    },
    commentAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    smallAvatar: {
      width: "100%",
      height: "100%",
    },
    commentContent: {
      flex: 1,
      marginLeft: Spacing.sm,
    },
    commentAuthor: {
      fontSize: 14,
      fontWeight: "600",
    },
    commentText: {
      fontSize: 14,
      marginTop: 2,
    },
    commentTime: {
      fontSize: 12,
      marginTop: 4,
    },
    emptyComments: {
      textAlign: "center",
      marginTop: Spacing.xl,
    },
    commentInputRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      borderTopWidth: 1,
      gap: Spacing.sm,
    },
    commentInput: {
      flex: 1,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.lg,
      fontSize: 15,
    },
    sendButton: {
      padding: Spacing.sm,
    },
    tipModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: Spacing.lg,
    },
    tipModalContent: {
      width: "100%",
      maxWidth: 340,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
    },
    tipModalTitle: {
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: Spacing.xs,
    },
    tipModalSubtitle: {
      fontSize: 14,
      textAlign: "center",
      marginBottom: Spacing.lg,
    },
    tipAmountRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: Spacing.md,
    },
    tipPreset: {
      width: 70,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      alignItems: "center",
    },
    tipPresetText: {
      fontSize: 16,
      fontWeight: "600",
    },
    tipInput: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: 16,
      marginBottom: Spacing.lg,
    },
    tipModalButtons: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    tipCancelButton: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      alignItems: "center",
    },
    tipCancelText: {
      fontSize: 16,
      fontWeight: "600",
    },
    tipConfirmButton: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    tipConfirmText: {
      color: "#FFF",
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
