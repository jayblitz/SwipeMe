import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface MediaAsset {
  uri: string;
  type: "image" | "video";
  duration?: number;
}

export default function CreatePostScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset[]>([]);
  const [mediaType, setMediaType] = useState<"text" | "photo" | "video">("text");

  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();

  const createPostMutation = useMutation({
    mutationFn: async (data: { content?: string; mediaUrls?: string[]; mediaType?: string; durationSeconds?: number }) => {
      return apiRequest("POST", "/api/moments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: (error) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to create post");
    },
  });

  const handleOpenSettings = useCallback(async () => {
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch {
      }
    }
  }, []);

  const handlePickMedia = useCallback(async () => {
    if (!mediaLibraryPermission?.granted) {
      if (mediaLibraryPermission?.status === "denied" && !mediaLibraryPermission?.canAskAgain) {
        Alert.alert(
          "Permission Required",
          "Please enable media library access in Settings",
          Platform.OS !== "web" 
            ? [{ text: "Cancel" }, { text: "Open Settings", onPress: handleOpenSettings }]
            : [{ text: "OK" }]
        );
        return;
      }
      const result = await requestMediaLibraryPermission();
      if (!result?.granted) return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newMedia: MediaAsset[] = result.assets.map(a => ({
        uri: a.uri,
        type: a.type === "video" ? "video" : "image",
        duration: a.duration ? Math.round(a.duration) : undefined,
      }));
      setSelectedMedia(prev => [...prev, ...newMedia].slice(0, 10));
      const firstAsset = result.assets[0];
      if (firstAsset.type === "video") {
        setMediaType("video");
      } else {
        setMediaType("photo");
      }
    }
  }, [mediaLibraryPermission, requestMediaLibraryPermission, handleOpenSettings]);

  const handleTakePhoto = useCallback(async () => {
    if (!cameraPermission?.granted) {
      if (cameraPermission?.status === "denied" && !cameraPermission?.canAskAgain) {
        Alert.alert(
          "Permission Required",
          "Please enable camera access in Settings",
          Platform.OS !== "web" 
            ? [{ text: "Cancel" }, { text: "Open Settings", onPress: handleOpenSettings }]
            : [{ text: "OK" }]
        );
        return;
      }
      const result = await requestCameraPermission();
      if (!result?.granted) return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newMedia: MediaAsset[] = result.assets.map(a => ({
        uri: a.uri,
        type: "image",
        duration: undefined,
      }));
      setSelectedMedia(prev => [...prev, ...newMedia].slice(0, 10));
      setMediaType("photo");
    }
  }, [cameraPermission, requestCameraPermission, handleOpenSettings]);

  const handleRemoveMedia = useCallback((index: number) => {
    setSelectedMedia(prev => prev.filter((_, i) => i !== index));
    if (selectedMedia.length <= 1) {
      setMediaType("text");
    }
  }, [selectedMedia.length]);

  const handlePost = useCallback(() => {
    if (!content.trim() && selectedMedia.length === 0) {
      Alert.alert("Empty Post", "Please add some content or media");
      return;
    }

    const videoAssets = selectedMedia.filter(m => m.type === "video");
    const imageAssets = selectedMedia.filter(m => m.type === "image");
    
    const actualMediaType = videoAssets.length > 0 ? "video" : (imageAssets.length > 0 ? "photo" : "text");
    const firstVideo = videoAssets[0];
    
    createPostMutation.mutate({
      content: content.trim() || undefined,
      mediaUrls: selectedMedia.length > 0 ? selectedMedia.map(m => m.uri) : undefined,
      mediaType: selectedMedia.length > 0 ? actualMediaType : "text",
      durationSeconds: actualMediaType === "video" && firstVideo?.duration ? firstVideo.duration : undefined,
    });
  }, [content, selectedMedia, createPostMutation]);

  const canPost = content.trim().length > 0 || selectedMedia.length > 0;

  return (
    <KeyboardAwareScrollViewCompat 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}
    >
      <TextInput
        style={[styles.contentInput, { color: theme.text }]}
        placeholder="What's on your mind?"
        placeholderTextColor={theme.textSecondary}
        value={content}
        onChangeText={setContent}
        multiline
        maxLength={2000}
        autoFocus
      />

      {selectedMedia.length > 0 ? (
        <View style={styles.mediaGrid}>
          {selectedMedia.map((asset, index) => (
            <View key={index} style={styles.mediaPreviewContainer}>
              <Image source={{ uri: asset.uri }} style={styles.mediaPreview} contentFit="cover" />
              {asset.type === "video" ? (
                <View style={styles.videoIndicator}>
                  <Feather name="play-circle" size={28} color="#fff" />
                  {asset.duration ? (
                    <Text style={styles.videoDuration}>
                      {Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, "0")}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Pressable
                style={[styles.removeMediaButton, { backgroundColor: theme.error }]}
                onPress={() => handleRemoveMedia(index)}
              >
                <Feather name="x" size={16} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.mediaActions}>
        <Pressable
          style={[styles.mediaButton, { borderColor: theme.border }]}
          onPress={handlePickMedia}
        >
          <Feather name="image" size={22} color={theme.primary} />
          <Text style={[styles.mediaButtonText, { color: theme.text }]}>Gallery</Text>
        </Pressable>

        <Pressable
          style={[styles.mediaButton, { borderColor: theme.border }]}
          onPress={handleTakePhoto}
        >
          <Feather name="camera" size={22} color={theme.primary} />
          <Text style={[styles.mediaButtonText, { color: theme.text }]}>Camera</Text>
        </Pressable>
      </View>

      <Pressable
        style={[
          styles.postButton,
          { backgroundColor: canPost ? theme.primary : theme.border }
        ]}
        onPress={handlePost}
        disabled={!canPost || createPostMutation.isPending}
      >
        {createPostMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.postButtonText}>Post</Text>
        )}
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  contentInput: {
    fontSize: 18,
    minHeight: 120,
    textAlignVertical: "top",
    marginBottom: Spacing.lg,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  mediaPreviewContainer: {
    position: "relative",
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  mediaPreview: {
    width: "100%",
    height: "100%",
  },
  removeMediaButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  videoIndicator: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDuration: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  mediaActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  mediaButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  mediaButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  postButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  postButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
