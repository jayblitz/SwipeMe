import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";

type VideoCallRouteProp = RouteProp<ChatsStackParamList, "VideoCall">;

export default function VideoCallScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const route = useRoute<VideoCallRouteProp>();
  const { chatId, contactName, contactAvatar, isVideoCall } = route.params;

  const [isConnecting, setIsConnecting] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const initializeCall = async () => {
      try {
        const roomResponse = await apiRequest("POST", "/api/videosdk/room", {});
        const roomData = await roomResponse.json();
        setRoomId(roomData.roomId);

        const tokenResponse = await apiRequest("POST", "/api/videosdk/token", {
          roomId: roomData.roomId,
        });
        const tokenData = await tokenResponse.json();
        setToken(tokenData.token);

        setIsConnecting(false);
      } catch (error) {
        console.error("Failed to initialize call:", error);
        Alert.alert("Call Failed", "Unable to connect the call. Please try again.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    };

    initializeCall();
  }, [navigation]);

  useEffect(() => {
    if (!isConnecting && roomId) {
      const timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isConnecting, roomId]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEndCall = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleToggleVideo = useCallback(() => {
    setIsVideoOff((prev) => !prev);
  }, []);

  const handleToggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  if (Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.webFallback}>
          <Feather
            name={isVideoCall ? "video" : "phone"}
            size={64}
            color={theme.textSecondary}
          />
          <ThemedText style={styles.webFallbackTitle}>
            {isVideoCall ? "Video" : "Voice"} Calling
          </ThemedText>
          <ThemedText style={[styles.webFallbackText, { color: theme.textSecondary }]}>
            Voice and video calls require the mobile app.
            {"\n"}Please use Expo Go to make calls.
          </ThemedText>
          <Pressable
            style={[styles.backButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
          >
            <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: "#1a1a1a" }]}>
      <View style={[styles.videoArea, { paddingTop: insets.top + Spacing.lg }]}>
        {isConnecting ? (
          <View style={styles.connectingState}>
            <View style={[styles.avatarLarge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.avatarText}>
                {contactName.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText style={styles.contactNameLarge}>{contactName}</ThemedText>
            <ThemedText style={styles.callStatus}>
              {isVideoCall ? "Connecting video call..." : "Calling..."}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.connectedState}>
            <View style={[styles.avatarLarge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.avatarText}>
                {contactName.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText style={styles.contactNameLarge}>{contactName}</ThemedText>
            <ThemedText style={styles.callDuration}>
              {formatDuration(callDuration)}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={[styles.controlsContainer, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.controlsRow}>
          <Pressable
            style={[
              styles.controlButton,
              isMuted && styles.controlButtonActive,
            ]}
            onPress={handleToggleMute}
          >
            <Feather
              name={isMuted ? "mic-off" : "mic"}
              size={24}
              color={isMuted ? "#1a1a1a" : "#fff"}
            />
            <ThemedText style={[styles.controlLabel, isMuted && styles.controlLabelActive]}>
              {isMuted ? "Unmute" : "Mute"}
            </ThemedText>
          </Pressable>

          {isVideoCall && (
            <Pressable
              style={[
                styles.controlButton,
                isVideoOff && styles.controlButtonActive,
              ]}
              onPress={handleToggleVideo}
            >
              <Feather
                name={isVideoOff ? "video-off" : "video"}
                size={24}
                color={isVideoOff ? "#1a1a1a" : "#fff"}
              />
              <ThemedText style={[styles.controlLabel, isVideoOff && styles.controlLabelActive]}>
                {isVideoOff ? "Video On" : "Video Off"}
              </ThemedText>
            </Pressable>
          )}

          <Pressable
            style={[
              styles.controlButton,
              isSpeakerOn && styles.controlButtonActive,
            ]}
            onPress={handleToggleSpeaker}
          >
            <Feather
              name={isSpeakerOn ? "volume-2" : "volume-x"}
              size={24}
              color={isSpeakerOn ? "#1a1a1a" : "#fff"}
            />
            <ThemedText style={[styles.controlLabel, isSpeakerOn && styles.controlLabelActive]}>
              Speaker
            </ThemedText>
          </Pressable>
        </View>

        <Pressable style={styles.endCallButton} onPress={handleEndCall}>
          <Feather name="phone-off" size={28} color="#fff" />
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  webFallbackTitle: {
    fontSize: 22,
    fontWeight: "600",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  webFallbackText: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  backButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  videoArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  connectingState: {
    alignItems: "center",
  },
  connectedState: {
    alignItems: "center",
  },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: "600",
    color: "#fff",
  },
  contactNameLarge: {
    fontSize: 28,
    fontWeight: "600",
    color: "#fff",
    marginBottom: Spacing.sm,
  },
  callStatus: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.7)",
  },
  callDuration: {
    fontSize: 18,
    color: "rgba(255, 255, 255, 0.9)",
    fontVariant: ["tabular-nums"],
  },
  controlsContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  controlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonActive: {
    backgroundColor: "#fff",
  },
  controlLabel: {
    fontSize: 12,
    color: "#fff",
    marginTop: Spacing.xs,
  },
  controlLabelActive: {
    color: "#1a1a1a",
  },
  endCallButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
  },
});
