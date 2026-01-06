import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { MomentsStackParamList } from "@/navigation/MomentsStackNavigator";

type NavigationProp = NativeStackNavigationProp<MomentsStackParamList, "VideoPreview">;
type VideoPreviewRouteProp = RouteProp<MomentsStackParamList, "VideoPreview">;

export default function VideoPreviewScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<VideoPreviewRouteProp>();
  const queryClient = useQueryClient();
  
  const { videoUri } = route.params || { videoUri: "" };
  
  const videoRef = useRef<Video>(null);
  
  const [caption, setCaption] = useState("");
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const createPostMutation = useMutation({
    mutationFn: async (postData: { content: string; mediaUrl: string; mediaType: string }) => {
      const baseUrl = getApiUrl();
      const response = await expoFetch(new URL("/api/moments", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postData),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to create post");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.popToTop();
    },
    onError: (error) => {
      console.error("Post creation error:", error);
      Alert.alert("Error", "Failed to create post. Please try again.");
    },
  });

  const handlePost = useCallback(async () => {
    if (isUploading || !videoUri) return;
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      const baseUrl = getApiUrl();
      const fileName = videoUri.split("/").pop() || "video.mp4";
      
      if (Platform.OS === "web") {
        formData.append("file", {
          uri: videoUri,
          name: fileName,
          type: "video/mp4",
        } as any);
        
        const uploadResponse = await fetch(new URL("/api/media/upload", baseUrl).toString(), {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!uploadResponse.ok) {
          throw new Error("Upload failed");
        }
        
        const uploadResult = await uploadResponse.json();
        
        await createPostMutation.mutateAsync({
          content: caption.trim(),
          mediaUrl: uploadResult.url,
          mediaType: "video",
        });
      } else {
        const file = new File(videoUri);
        formData.append("file", file);
        
        const uploadResponse = await expoFetch(new URL("/api/media/upload", baseUrl).toString(), {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!uploadResponse.ok) {
          throw new Error("Upload failed");
        }
        
        const uploadResult = await uploadResponse.json();
        
        await createPostMutation.mutateAsync({
          content: caption.trim(),
          mediaUrl: uploadResult.url,
          mediaType: "video",
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload video. Please try again.");
      setIsUploading(false);
    }
  }, [caption, videoUri, createPostMutation, isUploading]);

  const handleRetake = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      "Discard Video?",
      "Your recorded video will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Discard", 
          style: "destructive",
          onPress: () => navigation.popToTop(),
        },
      ]
    );
  }, [navigation]);

  const togglePlayback = useCallback(async () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isMuted]);

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.headerButton} onPress={handleDiscard}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        
        <Text style={[styles.headerTitle, { color: theme.text }]}>Preview</Text>
        
        <Pressable 
          style={[
            styles.postButton,
            { backgroundColor: Colors.light.primary },
            (isUploading || createPostMutation.isPending) && styles.postButtonDisabled,
          ]}
          onPress={handlePost}
          disabled={isUploading || createPostMutation.isPending}
        >
          {isUploading || createPostMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </Pressable>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.videoContainer} onPress={togglePlayback}>
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            isLooping
            shouldPlay={isPlaying}
            isMuted={isMuted}
          />
          
          {!isPlaying ? (
            <View style={styles.playOverlay}>
              <View style={styles.playButton}>
                <Feather name="play" size={40} color="#FFF" />
              </View>
            </View>
          ) : null}
          
          <View style={styles.videoControls}>
            <Pressable style={styles.videoControlButton} onPress={toggleMute}>
              <Feather name={isMuted ? "volume-x" : "volume-2"} size={20} color="#FFF" />
            </Pressable>
          </View>
        </Pressable>

        <View style={styles.captionContainer}>
          <TextInput
            style={[
              styles.captionInput,
              { 
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                borderColor: theme.border,
              }
            ]}
            placeholder="Add a caption..."
            placeholderTextColor={theme.textSecondary}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: theme.textSecondary }]}>
            {caption.length}/500
          </Text>
        </View>

        <View style={styles.hashtagHint}>
          <Feather name="hash" size={16} color={theme.textSecondary} />
          <Text style={[styles.hashtagHintText, { color: theme.textSecondary }]}>
            Add #hashtags to help others discover your video
          </Text>
        </View>

        <View style={styles.actionButtons}>
          <Pressable 
            style={[styles.actionButton, { backgroundColor: theme.backgroundSecondary }]}
            onPress={handleRetake}
          >
            <Feather name="refresh-cw" size={20} color={theme.text} />
            <Text style={[styles.actionButtonText, { color: theme.text }]}>Retake</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  postButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    minWidth: 70,
    alignItems: "center",
  },
  postButtonDisabled: {
    opacity: 0.6,
  },
  postButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  videoContainer: {
    aspectRatio: 9 / 16,
    width: "100%",
    maxHeight: 400,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    alignSelf: "center",
  },
  video: {
    flex: 1,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 8,
  },
  videoControls: {
    position: "absolute",
    bottom: Spacing.md,
    right: Spacing.md,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  videoControlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  speedBadge: {
    position: "absolute",
    top: Spacing.md,
    left: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  speedBadgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  captionContainer: {
    marginTop: Spacing.xl,
  },
  captionInput: {
    minHeight: 100,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    borderWidth: 1,
  },
  charCount: {
    fontSize: 12,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  hashtagHint: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  hashtagHintText: {
    fontSize: 13,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
