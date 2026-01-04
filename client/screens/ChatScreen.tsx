import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from "react";
import { View, StyleSheet, FlatList, TextInput, Pressable, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import { useHeaderHeight, HeaderButton } from "@react-navigation/elements";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import { AudioModule, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getMessages, sendMessage, sendPayment, sendAttachmentMessage, getChats, Message, Chat, getChatBackground, setChatBackground, PRESET_BACKGROUNDS, ChatBackground, DisappearingTimer, getChatDisappearingTimer, setChatDisappearingTimer, getTimerLabel, cleanupExpiredMessages } from "@/lib/storage";
import { fetchTokenBalances, TokenBalance, TEMPO_TOKENS, TempoToken } from "@/lib/tempo-tokens";
import { getApiUrl } from "@/lib/query-client";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";
import { useXMTP } from "@/contexts/XMTPContext";
import { findOrCreateDm, sendXMTPMessage, getMessages as getXMTPMessages, streamMessages, type XMTPConversation } from "@/lib/xmtp";
import { PaymentCelebration } from "@/components/PaymentCelebration";
import { realtimeClient } from "@/lib/realtime";

interface AttachmentOption {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
}

const attachmentOptions: AttachmentOption[] = [
  { id: "photos", icon: "image", label: "Photos", color: "#0066FF" },
  { id: "camera", icon: "camera", label: "Camera", color: "#6B7280" },
  { id: "location", icon: "map-pin", label: "Location", color: "#10B981" },
  { id: "contact", icon: "user", label: "Contact", color: "#6B7280" },
  { id: "document", icon: "file-text", label: "Document", color: "#0066FF" },
];

interface AttachmentsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectOption: (optionId: string) => void;
}

function AttachmentsModal({ visible, onClose, onSelectOption }: AttachmentsModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const handleOptionPress = (optionId: string) => {
    onSelectOption(optionId);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.attachmentOverlay}>
        <Pressable style={styles.attachmentOverlayTouch} onPress={onClose} />
        <View 
          style={[
            styles.attachmentSheet, 
            { 
              backgroundColor: theme.backgroundRoot,
              paddingBottom: insets.bottom + Spacing.lg,
            }
          ]}
        >
          <View style={styles.attachmentHandle} />
          <View style={styles.attachmentGrid}>
            {attachmentOptions.map((option) => (
              <Pressable
                key={option.id}
                style={({ pressed }) => [
                  styles.attachmentItem,
                  pressed && { opacity: 0.6 }
                ]}
                onPress={() => handleOptionPress(option.id)}
              >
                <View style={[styles.attachmentIcon, { backgroundColor: theme.backgroundSecondary }]}>
                  <Feather name={option.icon} size={24} color={option.color} />
                </View>
                <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  
  const daysDiff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }
  
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

function isSameDay(timestamp1: number, timestamp2: number): boolean {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);
  return date1.toDateString() === date2.toDateString();
}

interface DateSeparatorProps {
  timestamp: number;
}

function DateSeparator({ timestamp }: DateSeparatorProps) {
  const { theme } = useTheme();
  
  return (
    <View style={styles.dateSeparatorContainer}>
      <View style={[styles.dateSeparatorBubble, { backgroundColor: theme.backgroundSecondary }]}>
        <ThemedText style={[styles.dateSeparatorText, { color: theme.textSecondary }]}>
          {formatDateSeparator(timestamp)}
        </ThemedText>
      </View>
    </View>
  );
}

interface AudioMessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
}

const WAVEFORM_BARS = 25;
const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

function generateWaveformHeights(seed: number): number[] {
  const heights: number[] = [];
  let val = seed;
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    val = (val * 9301 + 49297) % 233280;
    heights.push(0.2 + (val / 233280) * 0.8);
  }
  return heights;
}

function AudioMessageBubble({ message, isOwnMessage }: AudioMessageBubbleProps) {
  const { theme } = useTheme();
  const [progress, setProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [hasPlayed, setHasPlayed] = useState(false);
  
  const audioUri = message.audioAttachment?.uri || null;
  const player = useAudioPlayer(audioUri);
  const status = useAudioPlayerStatus(player);
  
  const duration = message.audioAttachment?.duration || 0;
  const durationSeconds = Math.round(duration);
  const currentTimeDisplay = Math.round((status.currentTime || 0) / playbackSpeed);
  const displayTime = status.playing ? currentTimeDisplay : durationSeconds;
  const timeFormatted = `${Math.floor(displayTime / 60)}:${(displayTime % 60).toString().padStart(2, '0')}`;
  
  const isPlaying = status.playing;
  const waveformHeights = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < message.id.length; i++) {
      hash = ((hash << 5) - hash) + message.id.charCodeAt(i);
      hash = hash & hash;
    }
    return generateWaveformHeights(Math.abs(hash));
  }, [message.id]);
  
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      if (status.currentTime !== undefined && status.duration) {
        setProgress(status.currentTime / status.duration);
        if (status.currentTime >= status.duration) {
          setProgress(0);
        }
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [isPlaying, status.currentTime, status.duration]);
  
  const handlePlayPause = async () => {
    if (!player || !audioUri) {
      return;
    }
    
    try {
      await AudioModule.setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      
      if (isPlaying) {
        player.pause();
      } else {
        if (!hasPlayed) {
          setHasPlayed(true);
        }
        if (progress >= 0.99) {
          player.seekTo(0);
          setProgress(0);
        }
        player.play();
      }
    } catch (error) {
      console.error("Playback error:", error);
    }
  };
  
  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(newSpeed);
    if (player && typeof player.setPlaybackRate === "function") {
      player.setPlaybackRate(newSpeed);
    }
  };
  
  const playedBars = Math.floor(progress * WAVEFORM_BARS);
  
  return (
    <View style={[
      styles.audioBubble,
      { 
        backgroundColor: isOwnMessage ? theme.sentMessage : theme.receivedMessage,
        alignSelf: isOwnMessage ? "flex-end" : "flex-start",
      }
    ]}>
      <View style={styles.audioMainRow}>
        {!isOwnMessage ? (
          <View style={styles.audioAvatarContainer}>
            <View style={[styles.audioAvatar, { backgroundColor: "#00A884" }]}>
              <Feather name="mic" size={16} color="#FFFFFF" />
            </View>
            {!hasPlayed ? (
              <View style={styles.unplayedDot} />
            ) : null}
          </View>
        ) : null}
        
        <Pressable 
          onPress={handlePlayPause}
          style={styles.audioPlayButtonWhatsApp}
        >
          <Feather 
            name={isPlaying ? "pause" : "play"} 
            size={24} 
            color={isOwnMessage ? "#FFFFFF" : "#54656F"} 
          />
        </Pressable>
        
        <View style={styles.audioWaveformContainer}>
          <View style={styles.audioWaveformBars}>
            {waveformHeights.map((height, index) => (
              <View
                key={index}
                style={[
                  styles.audioWaveformBar,
                  {
                    height: height * 24,
                    backgroundColor: index < playedBars
                      ? (isOwnMessage ? "#FFFFFF" : "#00A884")
                      : (isOwnMessage ? "rgba(255,255,255,0.4)" : "#A0AEB4"),
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.audioMetaRow}>
            <ThemedText style={[
              styles.audioTimeDisplay,
              { color: isOwnMessage ? "rgba(255,255,255,0.8)" : "#667781" }
            ]}>
              {timeFormatted}
            </ThemedText>
            <View style={styles.audioMetaRight}>
              <ThemedText style={[
                styles.audioTimestamp,
                { color: isOwnMessage ? "rgba(255,255,255,0.7)" : "#667781" }
              ]}>
                {formatTime(message.timestamp)}
              </ThemedText>
              {isOwnMessage ? (
                <Feather name="check" size={14} color="rgba(255,255,255,0.7)" style={{ marginLeft: 2 }} />
              ) : null}
            </View>
          </View>
        </View>
        
        {isOwnMessage ? (
          <View style={styles.audioAvatarContainer}>
            <View style={[styles.audioAvatar, { backgroundColor: "#128C7E" }]}>
              <Feather name="mic" size={16} color="#FFFFFF" />
            </View>
          </View>
        ) : null}
      </View>
      
      {hasPlayed || isPlaying ? (
        <Pressable onPress={cyclePlaybackSpeed} style={styles.playbackSpeedButton}>
          <ThemedText style={[
            styles.playbackSpeedText,
            { color: isOwnMessage ? "#FFFFFF" : "#00A884" }
          ]}>
            {playbackSpeed}x
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  recipientUsername?: string;
  isHighlighted?: boolean;
}

const { width: screenWidth } = Dimensions.get("window");
const IMAGE_MAX_WIDTH = screenWidth * 0.65;

function MessageBubble({ message, isOwnMessage, recipientUsername, isHighlighted }: MessageBubbleProps) {
  const { theme } = useTheme();
  
  const handleExplorerPress = async () => {
    if (!message.paymentExplorerUrl) return;
    try {
      const canOpen = await Linking.canOpenURL(message.paymentExplorerUrl);
      if (canOpen) {
        await Linking.openURL(message.paymentExplorerUrl);
      } else {
        Alert.alert("Unable to open link", "Could not open the transaction explorer.");
      }
    } catch (error) {
      console.error("Failed to open explorer URL:", error);
      Alert.alert("Error", "Failed to open the transaction link.");
    }
  };
  
  if (message.type === "payment") {
    const gradientColors: readonly [string, string, string] = isOwnMessage 
      ? ["#6366F1", "#8B5CF6", "#A855F7"]
      : ["#10B981", "#34D399", "#6EE7B7"];
    
    return (
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.paymentBubble,
          { alignSelf: isOwnMessage ? "flex-end" : "flex-start" }
        ]}
      >
        <View style={styles.paymentHeader}>
          <Feather 
            name={isOwnMessage ? "arrow-up-right" : "arrow-down-left"} 
            size={16} 
            color="#FFFFFF"
          />
          <ThemedText style={[styles.paymentLabel, { color: "rgba(255,255,255,0.9)" }]}>
            {isOwnMessage 
              ? `You swiped${recipientUsername ? ` @${recipientUsername}` : ""}` 
              : `${recipientUsername ? `@${recipientUsername}` : "Someone"} swiped you`}
          </ThemedText>
        </View>
        <ThemedText style={[styles.paymentAmount, { color: "#FFFFFF" }]}>
          ${message.paymentAmount?.toFixed(2)}
        </ThemedText>
        {message.paymentMemo ? (
          <ThemedText style={[styles.paymentMemo, { color: "rgba(255,255,255,0.85)" }]}>
            {message.paymentMemo}
          </ThemedText>
        ) : null}
        <View style={styles.paymentFooter}>
          <View style={styles.paymentStatus}>
            <Feather 
              name="check-circle" 
              size={12} 
              color="rgba(255,255,255,0.85)"
            />
            <ThemedText style={[styles.paymentStatusText, { color: "rgba(255,255,255,0.85)" }]}>
              {message.paymentStatus === "completed" ? "Completed" : "Pending"}
            </ThemedText>
          </View>
          {message.paymentExplorerUrl ? (
            <Pressable onPress={handleExplorerPress} style={styles.explorerLink}>
              <Feather name="external-link" size={12} color="rgba(255,255,255,0.85)" />
              <ThemedText style={[styles.explorerLinkText, { color: "rgba(255,255,255,0.85)" }]}>
                View
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
    );
  }

  if (message.type === "image" && message.imageAttachment) {
    const aspectRatio = (message.imageAttachment.width && message.imageAttachment.height)
      ? message.imageAttachment.width / message.imageAttachment.height
      : 1;
    const imageWidth = Math.min(IMAGE_MAX_WIDTH, message.imageAttachment.width || IMAGE_MAX_WIDTH);
    const imageHeight = imageWidth / aspectRatio;
    
    const getImageStatusIcon = () => {
      if (!isOwnMessage) return null;
      const status = message.status || "sent";
      const iconColor = status === "read" ? "#53BDEB" : "rgba(255,255,255,0.9)";
      
      if (status === "sending") {
        return <Feather name="clock" size={10} color="rgba(255,255,255,0.7)" style={{ marginLeft: 3 }} />;
      }
      if (status === "sent") {
        return <Feather name="check" size={10} color={iconColor} style={{ marginLeft: 3 }} />;
      }
      if (status === "delivered" || status === "read") {
        return (
          <View style={{ flexDirection: "row", marginLeft: 3 }}>
            <Feather name="check" size={10} color={iconColor} style={{ marginRight: -5 }} />
            <Feather name="check" size={10} color={iconColor} />
          </View>
        );
      }
      return null;
    };

    return (
      <View style={[
        styles.imageBubble,
        { alignSelf: isOwnMessage ? "flex-end" : "flex-start" }
      ]}>
        <Image
          source={{ uri: message.imageAttachment.uri }}
          style={[styles.imageMessage, { width: imageWidth, height: imageHeight }]}
          contentFit="cover"
        />
        <View style={{ flexDirection: "row", alignItems: "center", position: "absolute", bottom: 8, right: 12 }}>
          <ThemedText style={[
            styles.imageTime,
            { color: "rgba(255,255,255,0.9)" }
          ]}>
            {formatTime(message.timestamp)}
          </ThemedText>
          {getImageStatusIcon()}
        </View>
      </View>
    );
  }

  if (message.type === "location" && message.locationAttachment) {
    const { latitude, longitude, address } = message.locationAttachment;
    return (
      <View style={[
        styles.locationBubble,
        { 
          backgroundColor: isOwnMessage ? theme.sentMessage : theme.receivedMessage,
          alignSelf: isOwnMessage ? "flex-end" : "flex-start",
        }
      ]}>
        <View style={[styles.locationPreview, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="map-pin" size={32} color={theme.primary} />
        </View>
        <View style={styles.locationInfo}>
          <ThemedText style={[styles.locationTitle, { color: isOwnMessage ? "#FFFFFF" : theme.text }]}>
            Shared Location
          </ThemedText>
          {address ? (
            <ThemedText style={[styles.locationAddress, { color: isOwnMessage ? "rgba(255,255,255,0.8)" : theme.textSecondary }]} numberOfLines={2}>
              {address}
            </ThemedText>
          ) : null}
          <ThemedText style={[styles.locationCoords, { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </ThemedText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end" }}>
          <ThemedText style={[
            styles.messageTime,
            { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
          ]}>
            {formatTime(message.timestamp)}
          </ThemedText>
          {isOwnMessage ? (() => {
            const status = message.status || "sent";
            const iconColor = status === "read" ? "#53BDEB" : "rgba(255,255,255,0.7)";
            if (status === "sending") return <Feather name="clock" size={10} color="rgba(255,255,255,0.5)" style={{ marginLeft: 3 }} />;
            if (status === "sent") return <Feather name="check" size={10} color={iconColor} style={{ marginLeft: 3 }} />;
            if (status === "delivered" || status === "read") return (
              <View style={{ flexDirection: "row", marginLeft: 3 }}>
                <Feather name="check" size={10} color={iconColor} style={{ marginRight: -5 }} />
                <Feather name="check" size={10} color={iconColor} />
              </View>
            );
            return null;
          })() : null}
        </View>
      </View>
    );
  }

  if (message.type === "contact" && message.contactAttachment) {
    const { name, phoneNumber, email } = message.contactAttachment;
    return (
      <View style={[
        styles.contactBubble,
        { 
          backgroundColor: isOwnMessage ? theme.sentMessage : theme.receivedMessage,
          alignSelf: isOwnMessage ? "flex-end" : "flex-start",
        }
      ]}>
        <View style={styles.contactHeader}>
          <View style={[styles.contactAvatar, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="user" size={20} color={theme.primary} />
          </View>
          <View style={styles.contactInfo}>
            <ThemedText style={[styles.contactName, { color: isOwnMessage ? "#FFFFFF" : theme.text }]}>
              {name}
            </ThemedText>
            {phoneNumber ? (
              <ThemedText style={[styles.contactDetail, { color: isOwnMessage ? "rgba(255,255,255,0.8)" : theme.textSecondary }]}>
                {phoneNumber}
              </ThemedText>
            ) : null}
            {email ? (
              <ThemedText style={[styles.contactDetail, { color: isOwnMessage ? "rgba(255,255,255,0.8)" : theme.textSecondary }]}>
                {email}
              </ThemedText>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end" }}>
          <ThemedText style={[
            styles.messageTime,
            { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
          ]}>
            {formatTime(message.timestamp)}
          </ThemedText>
          {isOwnMessage ? (() => {
            const status = message.status || "sent";
            const iconColor = status === "read" ? "#53BDEB" : "rgba(255,255,255,0.7)";
            if (status === "sending") return <Feather name="clock" size={10} color="rgba(255,255,255,0.5)" style={{ marginLeft: 3 }} />;
            if (status === "sent") return <Feather name="check" size={10} color={iconColor} style={{ marginLeft: 3 }} />;
            if (status === "delivered" || status === "read") return (
              <View style={{ flexDirection: "row", marginLeft: 3 }}>
                <Feather name="check" size={10} color={iconColor} style={{ marginRight: -5 }} />
                <Feather name="check" size={10} color={iconColor} />
              </View>
            );
            return null;
          })() : null}
        </View>
      </View>
    );
  }

  if (message.type === "document" && message.documentAttachment) {
    const { name: docName, mimeType, size } = message.documentAttachment;
    const formatSize = (bytes?: number) => {
      if (!bytes) return "";
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    
    return (
      <View style={[
        styles.documentBubble,
        { 
          backgroundColor: isOwnMessage ? theme.sentMessage : theme.receivedMessage,
          alignSelf: isOwnMessage ? "flex-end" : "flex-start",
        }
      ]}>
        <View style={styles.documentContent}>
          <View style={[styles.documentIcon, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="file-text" size={24} color={theme.primary} />
          </View>
          <View style={styles.documentInfo}>
            <ThemedText style={[styles.documentName, { color: isOwnMessage ? "#FFFFFF" : theme.text }]} numberOfLines={2}>
              {docName}
            </ThemedText>
            <ThemedText style={[styles.documentMeta, { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}>
              {formatSize(size)}{mimeType ? ` - ${mimeType.split("/")[1]?.toUpperCase() || mimeType}` : ""}
            </ThemedText>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end" }}>
          <ThemedText style={[
            styles.messageTime,
            { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
          ]}>
            {formatTime(message.timestamp)}
          </ThemedText>
          {isOwnMessage ? (() => {
            const status = message.status || "sent";
            const iconColor = status === "read" ? "#53BDEB" : "rgba(255,255,255,0.7)";
            if (status === "sending") return <Feather name="clock" size={10} color="rgba(255,255,255,0.5)" style={{ marginLeft: 3 }} />;
            if (status === "sent") return <Feather name="check" size={10} color={iconColor} style={{ marginLeft: 3 }} />;
            if (status === "delivered" || status === "read") return (
              <View style={{ flexDirection: "row", marginLeft: 3 }}>
                <Feather name="check" size={10} color={iconColor} style={{ marginRight: -5 }} />
                <Feather name="check" size={10} color={iconColor} />
              </View>
            );
            return null;
          })() : null}
        </View>
      </View>
    );
  }

  if (message.type === "audio" && message.audioAttachment) {
    return (
      <AudioMessageBubble 
        message={message} 
        isOwnMessage={isOwnMessage} 
      />
    );
  }

  if (message.type === "system") {
    return (
      <View style={[styles.systemMessageContainer, { backgroundColor: theme.backgroundTertiary }]}>
        <Feather name="clock" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
        <ThemedText style={[styles.systemMessageText, { color: theme.textSecondary }]}>
          {message.content}
        </ThemedText>
      </View>
    );
  }

  const renderStatusIcon = () => {
    if (!isOwnMessage) return null;
    
    const status = message.status || "sent";
    const iconColor = status === "read" ? "#53BDEB" : "rgba(255,255,255,0.7)";
    
    if (status === "sending") {
      return <Feather name="clock" size={12} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />;
    }
    if (status === "sent") {
      return <Feather name="check" size={12} color={iconColor} style={{ marginLeft: 4 }} />;
    }
    if (status === "delivered" || status === "read") {
      return (
        <View style={{ flexDirection: "row", marginLeft: 4 }}>
          <Feather name="check" size={12} color={iconColor} style={{ marginRight: -6 }} />
          <Feather name="check" size={12} color={iconColor} />
        </View>
      );
    }
    return null;
  };

  return (
    <View style={[
      styles.messageBubble,
      isOwnMessage ? [styles.ownMessage, { backgroundColor: theme.sentMessage }] 
                   : [styles.otherMessage, { backgroundColor: theme.receivedMessage }],
      isHighlighted && styles.highlightedMessage,
    ]}>
      <ThemedText style={[
        styles.messageText,
        { color: isOwnMessage ? "#FFFFFF" : theme.text }
      ]}>
        {message.content}
      </ThemedText>
      <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end" }}>
        <ThemedText style={[
          styles.messageTime,
          { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
        ]}>
          {formatTime(message.timestamp)}
        </ThemedText>
        {renderStatusIcon()}
      </View>
    </View>
  );
}

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (amount: number, memo: string, selectedToken: TempoToken) => void;
  recipientName: string;
  recipientAvatar?: string;
  tokenBalances: TokenBalance[];
  sending: boolean;
}

function PaymentModal({ visible, onClose, onSend, recipientName, recipientAvatar, tokenBalances, sending }: PaymentModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0);
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  
  const selectedBalance = tokenBalances[selectedTokenIndex] || { token: TEMPO_TOKENS[0], balanceUsd: 0 };

  const handleSend = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    if (numAmount > selectedBalance.balanceUsd) {
      Alert.alert("Error", `Insufficient ${selectedBalance.token.symbol} balance`);
      return;
    }
    
    Alert.alert(
      "Confirm Payment",
      `Send $${numAmount.toFixed(2)} ${selectedBalance.token.symbol} to ${recipientName}?${memo ? `\n\nNote: ${memo}` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Send", 
          style: "default",
          onPress: () => {
            onSend(numAmount, memo, selectedBalance.token);
            setAmount("");
            setMemo("");
          }
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.modalHeader}>
          <View style={styles.modalHandle} />
          <ThemedText type="h4" style={styles.modalTitle}>Send Payment</ThemedText>
          <Pressable onPress={onClose} style={styles.modalClose}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat 
          style={styles.modalContent}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        >
          <View style={styles.recipientRow}>
            <Avatar avatarId={recipientAvatar} size={48} />
            <View style={styles.recipientInfo}>
              <ThemedText style={[styles.recipientLabel, { color: theme.textSecondary }]}>
                Sending to
              </ThemedText>
              <ThemedText style={styles.recipientName}>{recipientName}</ThemedText>
            </View>
          </View>

          <Pressable 
            onPress={() => setShowAssetSelector(true)}
            style={[
              styles.assetSelectorButton, 
              { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: selectedBalance.token.color,
              }
            ]}
          >
            <View style={styles.assetSelectorLeft}>
              <View style={[styles.assetSelectorIcon, { backgroundColor: selectedBalance.token.color }]}>
                <ThemedText style={styles.assetSelectorIconText}>
                  {selectedBalance.token.symbol.charAt(0)}
                </ThemedText>
              </View>
              <View>
                <ThemedText style={styles.assetSelectorSymbol}>{selectedBalance.token.symbol}</ThemedText>
                <ThemedText style={[styles.assetSelectorBalance, { color: theme.textSecondary }]}>
                  Balance: ${selectedBalance.balanceUsd.toFixed(2)}
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-down" size={20} color={theme.textSecondary} />
          </Pressable>

          <Modal
            visible={showAssetSelector}
            transparent
            animationType="fade"
            onRequestClose={() => setShowAssetSelector(false)}
          >
            <Pressable 
              style={styles.assetSelectorOverlay} 
              onPress={() => setShowAssetSelector(false)}
            >
              <Pressable 
                style={[styles.assetSelectorSheet, { backgroundColor: theme.backgroundRoot }]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.assetSelectorHeader}>
                  <ThemedText type="h4">Select Asset</ThemedText>
                  <Pressable onPress={() => setShowAssetSelector(false)}>
                    <Feather name="x" size={24} color={theme.text} />
                  </Pressable>
                </View>
                {tokenBalances.map((tb, index) => (
                  <Pressable
                    key={tb.token.symbol}
                    style={[
                      styles.assetSelectorItem,
                      selectedTokenIndex === index && { backgroundColor: theme.backgroundSecondary },
                      index < tokenBalances.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                    ]}
                    onPress={() => {
                      setSelectedTokenIndex(index);
                      setShowAssetSelector(false);
                    }}
                  >
                    <View style={[styles.assetSelectorItemIcon, { backgroundColor: tb.token.color }]}>
                      <ThemedText style={styles.assetSelectorIconText}>
                        {tb.token.symbol.charAt(0)}
                      </ThemedText>
                    </View>
                    <View style={styles.assetSelectorItemInfo}>
                      <ThemedText style={styles.assetSelectorItemSymbol}>{tb.token.symbol}</ThemedText>
                      <ThemedText style={[styles.assetSelectorItemName, { color: theme.textSecondary }]}>
                        {tb.token.name}
                      </ThemedText>
                    </View>
                    <View style={styles.assetSelectorItemBalance}>
                      <ThemedText style={styles.assetSelectorItemUsd}>${tb.balanceUsd.toFixed(2)}</ThemedText>
                      <ThemedText style={[styles.assetSelectorItemTokens, { color: theme.textSecondary }]}>
                        {parseFloat(tb.balanceFormatted).toLocaleString()}
                      </ThemedText>
                    </View>
                    {selectedTokenIndex === index ? (
                      <Feather name="check" size={20} color={theme.primary} style={{ marginLeft: Spacing.sm }} />
                    ) : null}
                  </Pressable>
                ))}
              </Pressable>
            </Pressable>
          </Modal>

          <View style={styles.amountContainer}>
            <ThemedText style={styles.currencySymbol}>$</ThemedText>
            <TextInput
              style={[styles.amountInput, { color: theme.text }]}
              placeholder="0.00"
              placeholderTextColor={theme.textSecondary}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <View style={[styles.memoContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <Feather name="edit-3" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.memoInput, { color: theme.text }]}
              placeholder="What's this for?"
              placeholderTextColor={theme.textSecondary}
              value={memo}
              onChangeText={setMemo}
            />
          </View>

          <Button 
            onPress={handleSend} 
            disabled={sending || !amount}
            style={styles.paymentSendButton}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              `Send ${amount ? `$${parseFloat(amount || "0").toFixed(2)}` : ""} ${selectedBalance.token.symbol}`
            )}
          </Button>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

interface MessageSearchModalProps {
  visible: boolean;
  onClose: () => void;
  messages: Message[];
  onSelectMessage: (messageId: string) => void;
}

function MessageSearchModal({ visible, onClose, messages, onSelectMessage }: MessageSearchModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  
  const filteredMessages = useMemo(() => {
    if (!query.trim()) return [];
    const searchTerm = query.toLowerCase();
    return messages.filter(msg => 
      msg.content.toLowerCase().includes(searchTerm) ||
      msg.paymentMemo?.toLowerCase().includes(searchTerm)
    ).slice(0, 50);
  }, [messages, query]);

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <ThemedText style={{ color: theme.text }}>{text}</ThemedText>;
    
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    
    return (
      <ThemedText style={{ color: theme.text }}>
        {parts.map((part, index) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <ThemedText key={index} style={{ backgroundColor: "#FFEB3B", color: "#000" }}>{part}</ThemedText>
          ) : (
            <ThemedText key={index} style={{ color: theme.text }}>{part}</ThemedText>
          )
        )}
      </ThemedText>
    );
  };

  const handleSelectMessage = (messageId: string) => {
    onSelectMessage(messageId);
    setQuery("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.searchModalContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.searchModalHeader, { borderBottomColor: theme.border }]}>
          <View style={[styles.searchInputContainer, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search messages..."
              placeholderTextColor={theme.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            {query ? (
              <Pressable onPress={() => setQuery("")}>
                <Feather name="x-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={onClose} style={styles.searchCancelButton}>
            <ThemedText style={{ color: theme.primary }}>Cancel</ThemedText>
          </Pressable>
        </View>
        
        {query.trim() ? (
          filteredMessages.length > 0 ? (
            <FlatList
              data={filteredMessages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.searchResultItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleSelectMessage(item.id)}
                >
                  <View style={styles.searchResultContent}>
                    <ThemedText style={[styles.searchResultTime, { color: theme.textSecondary }]}>
                      {formatTime(item.timestamp)} - {new Date(item.timestamp).toLocaleDateString()}
                    </ThemedText>
                    <View style={styles.searchResultText}>
                      {highlightText(
                        item.type === "payment" 
                          ? `$${item.paymentAmount?.toFixed(2)}${item.paymentMemo ? ` - ${item.paymentMemo}` : ""}`
                          : item.content,
                        query
                      )}
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                </Pressable>
              )}
            />
          ) : (
            <View style={styles.searchEmptyState}>
              <Feather name="search" size={48} color={theme.textSecondary} />
              <ThemedText style={[styles.searchEmptyText, { color: theme.textSecondary }]}>
                No messages found for "{query}"
              </ThemedText>
            </View>
          )
        ) : (
          <View style={styles.searchEmptyState}>
            <Feather name="message-circle" size={48} color={theme.textSecondary} />
            <ThemedText style={[styles.searchEmptyText, { color: theme.textSecondary }]}>
              Search for messages in this chat
            </ThemedText>
          </View>
        )}
      </View>
    </Modal>
  );
}

interface DeviceContact {
  id: string;
  name: string;
  phoneNumber?: string;
  email?: string;
}

interface ContactPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectContact: (contact: DeviceContact) => void;
  contacts: DeviceContact[];
}

function ContactPickerModal({ visible, onClose, onSelectContact, contacts }: ContactPickerModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.attachmentOverlay} onPress={onClose}>
        <Pressable 
          style={[
            styles.contactPickerSheet, 
            { 
              backgroundColor: theme.backgroundRoot,
              paddingBottom: insets.bottom + Spacing.lg,
              maxHeight: "70%",
            }
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.attachmentHandle} />
          <ThemedText type="h4" style={styles.contactPickerTitle}>Select Contact</ThemedText>
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.contactPickerItem, { borderBottomColor: theme.border }]}
                onPress={() => {
                  onSelectContact(item);
                  onClose();
                }}
              >
                <View style={[styles.contactPickerAvatar, { backgroundColor: theme.backgroundSecondary }]}>
                  <Feather name="user" size={20} color={theme.primary} />
                </View>
                <View style={styles.contactPickerInfo}>
                  <ThemedText style={styles.contactPickerName}>{item.name}</ThemedText>
                  {item.phoneNumber ? (
                    <ThemedText style={[styles.contactPickerDetail, { color: theme.textSecondary }]}>
                      {item.phoneNumber}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            )}
            showsVerticalScrollIndicator={false}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const route = useRoute<RouteProp<ChatsStackParamList, "Chat">>();
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const { chatId, name, peerAddress, avatarId, contactId } = route.params;
  const { client, isSupported } = useXMTP();
  const [xmtpDm, setXmtpDm] = useState<XMTPConversation | null>(null);
  const useXMTPMode = Platform.OS !== "web" && isSupported && client && peerAddress;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [showDisappearingSettings, setShowDisappearingSettings] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [_searchQuery, _setSearchQuery] = useState("");
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [disappearingTimer, setDisappearingTimer] = useState<DisappearingTimer>(null);
  const [chatBackground, setChatBackgroundState] = useState<ChatBackground | null>(null);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [sending, setSending] = useState(false);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>(
    TEMPO_TOKENS.map(token => ({ token, balance: "0", balanceFormatted: "0", balanceUsd: 0 }))
  );
  const [chat, setChat] = useState<Chat | null>(null);
  const [contactProfile, setContactProfile] = useState<{
    username?: string;
    profileImage?: string;
    lastSeenAt?: Date;
  } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const streamCancelRef = useRef<(() => void) | null>(null);

  const getOnlineStatus = useCallback(() => {
    if (!contactProfile?.lastSeenAt) return null;
    const now = new Date();
    const diffMs = now.getTime() - new Date(contactProfile.lastSeenAt).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 5) return "Online";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return null;
  }, [contactProfile?.lastSeenAt]);

  const handleOpenContactDetails = useCallback(() => {
    const participantId = contactId || chat?.participants?.[0]?.id;
    navigation.navigate("ContactDetails", { chatId, name, peerAddress, avatarId, contactId: participantId });
  }, [navigation, chatId, name, peerAddress, avatarId, contactId, chat?.participants]);

  useLayoutEffect(() => {
    const onlineStatus = getOnlineStatus();
    navigation.setOptions({
      headerTitle: () => (
        <Pressable onPress={handleOpenContactDetails} style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ position: "relative", marginRight: 10 }}>
            <Avatar avatarId={avatarId || "coral"} imageUri={contactProfile?.profileImage} size={36} />
            {onlineStatus === "Online" ? (
              <View style={{ 
                position: "absolute", 
                bottom: 0, 
                right: 0, 
                width: 12, 
                height: 12, 
                borderRadius: 6, 
                backgroundColor: "#22C55E",
                borderWidth: 2,
                borderColor: theme.backgroundRoot,
              }} />
            ) : null}
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>{name}</ThemedText>
              <Feather name="chevron-right" size={18} color={theme.textSecondary} style={{ marginLeft: 2 }} />
            </View>
            {contactProfile?.username ? (
              <ThemedText style={{ fontSize: 12, color: onlineStatus === "Online" ? "#22C55E" : theme.textSecondary }}>
                {onlineStatus === "Online" ? "Online" : (onlineStatus ? `Active ${onlineStatus}` : `@${contactProfile.username}`)}
              </ThemedText>
            ) : onlineStatus ? (
              <ThemedText style={{ fontSize: 12, color: onlineStatus === "Online" ? "#22C55E" : theme.textSecondary }}>
                {onlineStatus === "Online" ? "Online" : `Active ${onlineStatus}`}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
      ),
      headerRight: () => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <HeaderButton onPress={() => setShowMessageSearch(true)}>
            <Feather name="search" size={20} color={theme.primary} />
          </HeaderButton>
          <HeaderButton onPress={() => setShowPayment(true)}>
            <Feather name="dollar-sign" size={20} color={theme.primary} />
          </HeaderButton>
        </View>
      ),
    });
  }, [navigation, theme, name, chatId, avatarId, handleOpenContactDetails, contactProfile, getOnlineStatus]);

  const loadData = useCallback(async () => {
    // Load chat background (reset to null if none set)
    const loadedBackground = await getChatBackground(chatId);
    setChatBackgroundState(loadedBackground);
    
    // Load disappearing messages timer (can be null)
    const loadedTimer = await getChatDisappearingTimer(chatId);
    setDisappearingTimer(loadedTimer);
    
    // Cleanup expired messages on load
    await cleanupExpiredMessages();
    
    if (useXMTPMode && peerAddress) {
      try {
        const convInfo = await findOrCreateDm(peerAddress);
        setXmtpDm(convInfo.dm);
        
        const xmtpMessages = await getXMTPMessages(convInfo.dm);
        const convertedMessages: Message[] = xmtpMessages.map((msg, index) => {
          const content = msg.content;
          const contentStr = typeof content === "string" ? content : String(content || "");
          return {
            id: msg.id || `xmtp-${index}`,
            chatId: chatId,
            senderId: msg.senderInboxId === client?.inboxId ? "me" : (msg.senderInboxId || "unknown"),
            content: contentStr,
            timestamp: msg.sentNs ? Number(msg.sentNs) / 1000000 : Date.now(),
            type: "text" as const,
          };
        });
        setMessages(convertedMessages.sort((a, b) => b.timestamp - a.timestamp));
      } catch (error) {
        console.error("Failed to load XMTP messages:", error);
      }
    } else {
      const [loadedMessages, loadedChats] = await Promise.all([
        getMessages(chatId),
        getChats(),
      ]);
      setMessages(loadedMessages.sort((a, b) => b.timestamp - a.timestamp));
      const currentChat = loadedChats.find(c => c.id === chatId);
      if (currentChat) setChat(currentChat);
    }
    
    if (wallet?.address) {
      try {
        const balances = await fetchTokenBalances(wallet.address);
        setTokenBalances(balances);
      } catch (error) {
        console.error("Failed to fetch balances:", error);
      }
    }
  }, [chatId, user?.id, useXMTPMode, peerAddress, client?.inboxId, wallet?.address]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const fetchContactProfile = async () => {
      const participantId = contactId || chat?.participants?.[0]?.id;
      if (!participantId) return;
      
      try {
        const baseUrl = getApiUrl();
        const response = await fetch(new URL(`/api/users/${participantId}/public`, baseUrl), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        
        if (response.ok) {
          const userData = await response.json();
          setContactProfile({
            username: userData.username,
            profileImage: userData.profileImage,
            lastSeenAt: userData.lastSeenAt ? new Date(userData.lastSeenAt) : undefined,
          });
        }
      } catch (error) {
        console.error("Failed to fetch contact profile:", error);
      }
    };
    
    fetchContactProfile();
    
    const interval = setInterval(fetchContactProfile, 60000);
    return () => clearInterval(interval);
  }, [contactId, chat?.participants]);

  useEffect(() => {
    if (!useXMTPMode || !xmtpDm) return;

    let isCancelled = false;
    let localCancelStream: (() => void) | null = null;

    const setupStream = async () => {
      try {
        if (streamCancelRef.current) {
          streamCancelRef.current();
          streamCancelRef.current = null;
        }

        const cancelStream = await streamMessages(xmtpDm, (msg) => {
          if (isCancelled) return;
          if (msg.senderInboxId === client?.inboxId) return;
          
          const content = msg.content;
          const contentStr = typeof content === "string" ? content : String(content || "");
          const messageId = msg.id || `xmtp-stream-${Date.now()}`;
          const newMessage: Message = {
            id: messageId,
            chatId: chatId,
            senderId: msg.senderInboxId || "unknown",
            content: contentStr,
            timestamp: msg.sentNs ? Number(msg.sentNs) / 1000000 : Date.now(),
            type: "text" as const,
          };
          
          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [newMessage, ...prev].sort((a, b) => b.timestamp - a.timestamp);
          });
          
          if (realtimeClient.isConnected() && msg.senderInboxId) {
            realtimeClient.sendDelivered(messageId, chatId, msg.senderInboxId);
          }
        });
        
        if (isCancelled) {
          cancelStream();
        } else {
          localCancelStream = cancelStream;
          streamCancelRef.current = cancelStream;
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to setup message stream:", error);
        }
      }
    };

    setupStream();

    return () => {
      isCancelled = true;
      if (localCancelStream) {
        localCancelStream();
      }
      if (streamCancelRef.current) {
        streamCancelRef.current();
        streamCancelRef.current = null;
      }
    };
  }, [useXMTPMode, xmtpDm, client?.inboxId, chatId]);

  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe("status_update", (data) => {
      if (data.conversationId !== chatId) return;
      
      const messageId = data.messageId;
      const newStatus = data.status;
      if (!messageId || !newStatus) return;
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: newStatus } : msg
      ));
    });
    
    return () => unsubscribe();
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      const unreadMessages = messages.filter(
        msg => msg.senderId !== "me" && msg.status !== "read"
      );
      
      if (unreadMessages.length > 0 && realtimeClient.isConnected()) {
        const messageIds = unreadMessages.map(msg => msg.id);
        const senderId = unreadMessages[0]?.senderId || "";
        realtimeClient.sendRead(messageIds, chatId, senderId);
        
        setMessages(prev => prev.map(msg => 
          messageIds.includes(msg.id) ? { ...msg, status: "read" } : msg
        ));
      }
    }, [messages, chatId])
  );

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const messageText = inputText.trim();
    setInputText("");
    
    if (useXMTPMode && xmtpDm) {
      try {
        await sendXMTPMessage(xmtpDm, messageText);
        const newMessage: Message = {
          id: `xmtp-${Date.now()}`,
          chatId: chatId,
          senderId: "me",
          content: messageText,
          timestamp: Date.now(),
          type: "text",
          status: "sent",
        };
        setMessages(prev => [newMessage, ...prev]);
        
        if (chat?.participants?.[0]?.id) {
          const recipientId = chat.participants[0].id;
          fetch(new URL("/api/notify/message", getApiUrl()), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ recipientId, message: messageText, chatId }),
          }).catch(err => console.error("Notification send failed:", err));
        }
      } catch (error) {
        console.error("Failed to send XMTP message:", error);
        Alert.alert("Error", "Failed to send message. Please try again.");
        setInputText(messageText);
      }
    } else {
      const newMessage = await sendMessage(chatId, messageText);
      setMessages(prev => [newMessage, ...prev]);
      
      if (chat?.participants?.[0]?.id) {
        const recipientId = chat.participants[0].id;
        fetch(new URL("/api/notify/message", getApiUrl()), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ recipientId, message: messageText, chatId }),
        }).catch(err => console.error("Notification send failed:", err));
      }
    }
  };

  const handleSendPayment = async (amount: number, memo: string, selectedToken: TempoToken) => {
    if (!chat || !user?.id) return;
    setSending(true);
    
    try {
      const participant = chat.participants[0];
      
      let recipientWalletAddress = participant.walletAddress;
      
      if (!recipientWalletAddress && participant.id) {
        try {
          const baseUrl = getApiUrl();
          const userResponse = await fetch(new URL(`/api/users/${participant.id}/public`, baseUrl), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            recipientWalletAddress = userData.walletAddress;
          }
        } catch (fetchError) {
          console.error("Failed to fetch recipient wallet:", fetchError);
        }
      }
      
      if (!recipientWalletAddress) {
        Alert.alert(
          "Recipient Wallet Required",
          "The recipient hasn't set up their wallet yet. They need to create a wallet in the app to receive payments."
        );
        setSending(false);
        return;
      }
      
      // Call the transfer API using fetch directly for better error handling
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/wallet/${user.id}/transfer`, baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tokenAddress: selectedToken.address,
          toAddress: recipientWalletAddress,
          amount: amount.toString(),
          decimals: selectedToken.decimals,
        }),
      });
      
      const txData = await response.json();
      
      if (!response.ok) {
        throw new Error(txData.error || "Transfer failed");
      }
      
      // Record the payment in chat and transaction history
      const recipientName = participant.name || "Contact";
      const { message } = await sendPayment(
        chatId,
        amount,
        `${memo || "Payment"} (${selectedToken.symbol})`,
        participant.id,
        recipientName,
        participant.avatarId,
        txData.txHash,
        txData.explorer
      );
      setMessages(prev => [message, ...prev]);
      
      // Refresh balances
      if (wallet?.address) {
        const balances = await fetchTokenBalances(wallet.address);
        setTokenBalances(balances);
      }
      
      setShowPayment(false);
      setShowCelebration(true);
      
      setTimeout(() => {
        Alert.alert(
          "Swiped!",
          `You just swiped ${recipientName} $${amount.toFixed(2)} ${selectedToken.symbol}`,
          [
            { text: "OK", style: "cancel" },
            { 
              text: "View on Explorer", 
              onPress: () => Linking.openURL(txData.explorer) 
            },
          ]
        );
      }, 500);
    } catch (error) {
      console.error("Payment error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send payment";
      
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes("insufficient funds") || errorMessage.includes("gas")) {
        userFriendlyMessage = "You need TEMPO tokens for gas fees. Tap 'Get Free TEMPO' in your wallet to top up.";
      } else if (errorMessage.includes("Authentication required") || errorMessage.includes("401")) {
        userFriendlyMessage = "Session expired. Please log in again.";
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        userFriendlyMessage = "Network error. Please check your connection and try again.";
      }
      
      Alert.alert("Payment Failed", userFriendlyMessage);
    } finally {
      setSending(false);
    }
  };

  const requestMediaLibraryPermission = async (): Promise<boolean> => {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status === "granted") return true;
    
    if (!canAskAgain && Platform.OS !== "web") {
      Alert.alert(
        "Permission Required",
        "Please enable photo library access in Settings to share photos.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: async () => {
              try {
                await Linking.openSettings();
              } catch (e) {}
            }
          },
        ]
      );
    } else {
      Alert.alert("Permission Denied", "Photo library access is required to share photos.");
    }
    return false;
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
    if (status === "granted") return true;
    
    if (!canAskAgain && Platform.OS !== "web") {
      Alert.alert(
        "Permission Required",
        "Please enable camera access in Settings to take photos.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: async () => {
              try {
                await Linking.openSettings();
              } catch (e) {}
            }
          },
        ]
      );
    } else {
      Alert.alert("Permission Denied", "Camera access is required to take photos.");
    }
    return false;
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") return true;
    
    if (!canAskAgain && Platform.OS !== "web") {
      Alert.alert(
        "Permission Required",
        "Please enable location access in Settings to share your location.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: async () => {
              try {
                await Linking.openSettings();
              } catch (e) {}
            }
          },
        ]
      );
    } else {
      Alert.alert("Permission Denied", "Location access is required to share your location.");
    }
    return false;
  };

  const requestContactsPermission = async (): Promise<boolean> => {
    const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
    if (status === "granted") return true;
    
    if (!canAskAgain && Platform.OS !== "web") {
      Alert.alert(
        "Permission Required",
        "Please enable contacts access in Settings to share contacts.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Open Settings", 
            onPress: async () => {
              try {
                await Linking.openSettings();
              } catch (e) {}
            }
          },
        ]
      );
    } else {
      Alert.alert("Permission Denied", "Contacts access is required to share contacts.");
    }
    return false;
  };

  const handleAttachmentOption = async (optionId: string) => {
    setShowAttachments(false);
    switch (optionId) {
      case "photos": {
        const hasMediaPermission = await requestMediaLibraryPermission();
        if (!hasMediaPermission) return;
        
        const photoResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        });
        if (!photoResult.canceled && photoResult.assets[0]) {
          const asset = photoResult.assets[0];
          const message = await sendAttachmentMessage(chatId, "image", {
            image: {
              uri: asset.uri,
              width: asset.width,
              height: asset.height,
            },
          });
          setMessages(prev => [message, ...prev]);
        }
        break;
      }
      case "camera": {
        const hasCameraPermission = await requestCameraPermission();
        if (!hasCameraPermission) return;
        
        const cameraResult = await ImagePicker.launchCameraAsync({
          quality: 0.8,
        });
        if (!cameraResult.canceled && cameraResult.assets[0]) {
          const asset = cameraResult.assets[0];
          const message = await sendAttachmentMessage(chatId, "image", {
            image: {
              uri: asset.uri,
              width: asset.width,
              height: asset.height,
            },
          });
          setMessages(prev => [message, ...prev]);
        }
        break;
      }
      case "location": {
        if (Platform.OS === "web") {
          Alert.alert("Not Available", "Run in Expo Go to use this feature");
          return;
        }
        const hasLocationPermission = await requestLocationPermission();
        if (!hasLocationPermission) return;
        
        try {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const { latitude, longitude } = location.coords;
          
          let address: string | undefined;
          try {
            const [geocode] = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (geocode) {
              const parts = [geocode.street, geocode.city, geocode.region].filter(Boolean);
              address = parts.join(", ");
            }
          } catch (e) {}
          
          const message = await sendAttachmentMessage(chatId, "location", {
            location: { latitude, longitude, address },
          });
          setMessages(prev => [message, ...prev]);
        } catch (error) {
          Alert.alert("Error", "Failed to get your location");
        }
        break;
      }
      case "contact": {
        if (Platform.OS === "web") {
          Alert.alert("Not Available", "Run in Expo Go to use this feature");
          return;
        }
        const hasContactsPermission = await requestContactsPermission();
        if (!hasContactsPermission) return;
        
        try {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
          });
          
          if (data.length === 0) {
            Alert.alert("No Contacts", "No contacts found on this device");
            return;
          }
          
          const mappedContacts: DeviceContact[] = data
            .filter(c => c.name)
            .map(c => ({
              id: c.id || `contact-${Date.now()}-${Math.random()}`,
              name: c.name || "Unknown",
              phoneNumber: c.phoneNumbers?.[0]?.number,
              email: c.emails?.[0]?.email,
            }));
          
          setDeviceContacts(mappedContacts);
          setShowContactPicker(true);
        } catch (error) {
          Alert.alert("Error", "Failed to access contacts");
        }
        break;
      }
      case "document": {
        try {
          const result = await DocumentPicker.getDocumentAsync({
            type: "*/*",
            copyToCacheDirectory: true,
          });
          
          if (!result.canceled && result.assets[0]) {
            const doc = result.assets[0];
            const message = await sendAttachmentMessage(chatId, "document", {
              document: {
                uri: doc.uri,
                name: doc.name,
                mimeType: doc.mimeType,
                size: doc.size,
              },
            });
            setMessages(prev => [message, ...prev]);
          }
        } catch (error) {
          Alert.alert("Error", "Failed to select document");
        }
        break;
      }
    }
  };

  const handleSelectContact = async (contact: DeviceContact) => {
    const message = await sendAttachmentMessage(chatId, "contact", {
      contact: {
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        email: contact.email,
      },
    });
    setMessages(prev => [message, ...prev]);
  };

  const handleSelectBackground = async (background: ChatBackground) => {
    setChatBackgroundState(background);
    await setChatBackground(chatId, background);
    setShowBackgroundPicker(false);
  };

  const participant = chat?.participants[0];

  const isImageBackground = chatBackground?.type === "image";
  const backgroundStyle = chatBackground?.value && chatBackground.value !== "transparent" && !isImageBackground
    ? { backgroundColor: chatBackground.value }
    : {};

  return (
    <ThemedView style={styles.container}>
      {isImageBackground ? (
        <Image
          source={{ uri: chatBackground.value }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : null}
      <View style={[styles.chatBackground, backgroundStyle]}>
        <KeyboardAvoidingView 
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={headerHeight}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const nextMessage = messages[index + 1];
              const showDateSeparator = !nextMessage || !isSameDay(item.timestamp, nextMessage.timestamp);
              
              return (
                <>
                  <MessageBubble 
                    message={item} 
                    isOwnMessage={item.senderId === "me"} 
                    recipientUsername={participant?.username}
                    isHighlighted={highlightedMessageId === item.id}
                  />
                  {showDateSeparator ? <DateSeparator timestamp={item.timestamp} /> : null}
                </>
              );
            }}
            inverted
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        
        <View style={[
          styles.inputContainer, 
          { 
            backgroundColor: theme.backgroundRoot,
            paddingBottom: Math.max(insets.bottom, Spacing.md),
            borderTopColor: theme.border,
          }
        ]}>
          <Pressable 
            onPress={() => setShowAttachments(true)}
            style={[styles.attachButton, { backgroundColor: theme.backgroundSecondary }]}
          >
            <Feather name="plus" size={22} color={theme.text} />
          </Pressable>
          
          <View style={[
            styles.textInputContainer, 
            { 
              backgroundColor: theme.backgroundSecondary, 
              borderColor: theme.textSecondary,
              borderWidth: 1.5,
            }
          ]}>
            <TextInput
              style={[styles.textInput, { color: theme.text }]}
              placeholder="Type a message..."
              placeholderTextColor={theme.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />
          </View>
          
          <Pressable 
            onPress={handleSend}
            disabled={!inputText.trim()}
            style={[
              styles.sendButton,
              { 
                backgroundColor: inputText.trim() ? theme.primary : theme.backgroundSecondary,
              }
            ]}
          >
            <Feather 
              name="send" 
              size={18} 
              color={inputText.trim() ? "#FFFFFF" : theme.textSecondary} 
            />
          </Pressable>
        </View>
        </KeyboardAvoidingView>
      </View>

      {participant ? (
        <PaymentModal
          visible={showPayment}
          onClose={() => setShowPayment(false)}
          onSend={handleSendPayment}
          recipientName={participant.name}
          recipientAvatar={participant.avatarId}
          tokenBalances={tokenBalances}
          sending={sending}
        />
      ) : null}

      <PaymentCelebration
        visible={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />

      <AttachmentsModal
        visible={showAttachments}
        onClose={() => setShowAttachments(false)}
        onSelectOption={handleAttachmentOption}
      />

      <ContactPickerModal
        visible={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelectContact={handleSelectContact}
        contacts={deviceContacts}
      />

      <MessageSearchModal
        visible={showMessageSearch}
        onClose={() => setShowMessageSearch(false)}
        messages={messages}
        onSelectMessage={(messageId) => {
          setHighlightedMessageId(messageId);
          const messageIndex = messages.findIndex(m => m.id === messageId);
          if (messageIndex !== -1 && flatListRef.current) {
            flatListRef.current.scrollToIndex({ index: messageIndex, animated: true, viewPosition: 0.5 });
            setTimeout(() => setHighlightedMessageId(null), 2000);
          }
        }}
      />

      <Modal
        visible={showBackgroundPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBackgroundPicker(false)}
      >
        <Pressable 
          style={styles.attachmentOverlay} 
          onPress={() => setShowBackgroundPicker(false)}
        >
          <Pressable 
            style={[styles.backgroundPickerContainer, { backgroundColor: theme.backgroundRoot }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.backgroundPickerHeader}>
              <ThemedText style={styles.backgroundPickerTitle}>Chat Background</ThemedText>
              <Pressable onPress={() => setShowBackgroundPicker(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <View style={styles.backgroundPickerGrid}>
              {PRESET_BACKGROUNDS.map((bg) => (
                <Pressable
                  key={bg.id}
                  style={[
                    styles.backgroundPickerItem,
                    { backgroundColor: bg.value === "transparent" ? theme.backgroundRoot : bg.value },
                    chatBackground?.value === bg.value && styles.backgroundPickerItemSelected,
                  ]}
                  onPress={() => handleSelectBackground({ type: bg.type, value: bg.value })}
                >
                  {bg.value === "transparent" ? (
                    <Feather name="x-circle" size={24} color={theme.textSecondary} />
                  ) : null}
                  {chatBackground?.value === bg.value ? (
                    <View style={styles.backgroundPickerCheck}>
                      <Feather name="check" size={16} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
            
            <Pressable
              style={[styles.backgroundGalleryButton, { backgroundColor: theme.backgroundSecondary }]}
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ["images"],
                  allowsEditing: true,
                  quality: 0.8,
                });
                if (!result.canceled && result.assets[0]) {
                  handleSelectBackground({ type: "image", value: result.assets[0].uri });
                }
              }}
            >
              <Feather name="image" size={20} color={theme.text} />
              <ThemedText style={styles.backgroundGalleryText}>Choose from Gallery</ThemedText>
            </Pressable>
            
            {chatBackground?.type === "image" ? (
              <View style={styles.currentImagePreview}>
                <Image
                  source={{ uri: chatBackground.value }}
                  style={styles.currentImageThumbnail}
                  contentFit="cover"
                />
                <ThemedText style={[styles.currentImageLabel, { color: theme.textSecondary }]}>
                  Current background
                </ThemedText>
              </View>
            ) : null}
            
            <ThemedText style={[styles.backgroundPickerHint, { color: theme.textSecondary }]}>
              Each chat can have its own unique background
            </ThemedText>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Disappearing Messages Modal */}
      <Modal
        visible={showDisappearingSettings}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDisappearingSettings(false)}
      >
        <Pressable 
          style={styles.attachmentOverlay} 
          onPress={() => setShowDisappearingSettings(false)}
        >
          <Pressable 
            style={[styles.backgroundPickerContainer, { backgroundColor: theme.backgroundRoot }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.backgroundPickerHeader}>
              <ThemedText style={styles.backgroundPickerTitle}>Disappearing Messages</ThemedText>
              <Pressable onPress={() => setShowDisappearingSettings(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            
            <ThemedText style={[styles.disappearingDescription, { color: theme.textSecondary }]}>
              When enabled, new messages sent in this chat will disappear after the selected time.
            </ThemedText>
            
            <View style={styles.disappearingOptions}>
              {([null, "24h", "7d", "30d"] as DisappearingTimer[]).map((timer) => (
                <Pressable
                  key={timer || "off"}
                  style={[
                    styles.disappearingOption,
                    { backgroundColor: theme.backgroundSecondary },
                    disappearingTimer === timer && styles.disappearingOptionSelected,
                  ]}
                  onPress={async () => {
                    setDisappearingTimer(timer);
                    await setChatDisappearingTimer(chatId, timer);
                    setShowDisappearingSettings(false);
                    if (timer) {
                      Alert.alert(
                        "Disappearing Messages On",
                        `New messages will disappear after ${getTimerLabel(timer)}.`
                      );
                    }
                  }}
                >
                  <View style={styles.disappearingOptionContent}>
                    <Feather 
                      name={timer ? "clock" : "eye-off"} 
                      size={20} 
                      color={disappearingTimer === timer ? theme.primary : theme.text} 
                    />
                    <ThemedText style={[
                      styles.disappearingOptionText,
                      disappearingTimer === timer && { color: theme.primary, fontWeight: "600" }
                    ]}>
                      {getTimerLabel(timer)}
                    </ThemedText>
                  </View>
                  {disappearingTimer === timer ? (
                    <Feather name="check" size={20} color={theme.primary} />
                  ) : null}
                </Pressable>
              ))}
            </View>
            
            {disappearingTimer ? (
              <View style={[styles.disappearingWarning, { backgroundColor: `${theme.warning}20` }]}>
                <Feather name="alert-triangle" size={16} color={theme.warning} />
                <ThemedText style={[styles.disappearingWarningText, { color: theme.warning }]}>
                  This only affects new messages. Existing messages are not affected.
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatBackground: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  backgroundPickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  backgroundPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backgroundPickerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  backgroundPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  backgroundPickerItem: {
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundPickerItemSelected: {
    borderColor: "#00A884",
  },
  backgroundPickerCheck: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#00A884",
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundPickerHint: {
    fontSize: 13,
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  backgroundGalleryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 12,
  },
  backgroundGalleryText: {
    fontSize: 15,
    fontWeight: "500",
  },
  currentImagePreview: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  currentImageThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  currentImageLabel: {
    fontSize: 13,
  },
  dateSeparatorContainer: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  dateSeparatorBubble: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  dateSeparatorText: {
    fontSize: 12,
    fontWeight: "500",
  },
  messagesList: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: "80%",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.messageBubble,
    marginBottom: Spacing.sm,
  },
  ownMessage: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  paymentBubble: {
    maxWidth: "75%",
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
  },
  paymentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.xs,
  },
  paymentLabel: {
    fontSize: 12,
  },
  paymentAmount: {
    fontSize: 28,
    fontWeight: "700",
  },
  paymentMemo: {
    fontSize: 13,
    marginTop: 4,
  },
  paymentStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  paymentStatusText: {
    fontSize: 12,
  },
  paymentFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  explorerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
  },
  explorerLinkText: {
    fontSize: 11,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  paymentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  textInputContainer: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 16,
    minHeight: 24,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  attachmentOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  attachmentOverlayTouch: {
    flex: 1,
  },
  attachmentSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  attachmentHandle: {
    width: 36,
    height: 5,
    backgroundColor: "rgba(128,128,128,0.4)",
    borderRadius: 2.5,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  attachmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: Spacing.lg,
  },
  attachmentItem: {
    width: 72,
    alignItems: "center",
  },
  attachmentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  attachmentLabel: {
    fontSize: 12,
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalHandle: {
    width: 36,
    height: 5,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 2.5,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    textAlign: "center",
  },
  modalClose: {
    position: "absolute",
    right: Spacing.lg,
    top: Spacing.lg + Spacing.md,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  recipientInfo: {
    marginLeft: Spacing.md,
  },
  recipientLabel: {
    fontSize: 12,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: "600",
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  currencySymbol: {
    fontSize: 40,
    fontWeight: "300",
  },
  amountInput: {
    fontSize: 56,
    fontWeight: "700",
    minWidth: 100,
    textAlign: "center",
  },
  memoContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  memoInput: {
    flex: 1,
    fontSize: 16,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  paymentSendButton: {
    width: "100%",
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  tokenSelectorLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  tokenSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tokenOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
  },
  tokenOptionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tokenBalance: {
    fontSize: 11,
    marginTop: 2,
  },
  imageBubble: {
    maxWidth: "80%",
    borderRadius: BorderRadius.card,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  imageMessage: {
    borderRadius: BorderRadius.card,
  },
  imageTime: {
    position: "absolute",
    bottom: 8,
    right: 8,
    fontSize: 11,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  locationBubble: {
    maxWidth: "75%",
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
  },
  locationPreview: {
    width: "100%",
    height: 80,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  locationInfo: {
    marginBottom: Spacing.xs,
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 13,
    marginBottom: 2,
  },
  locationCoords: {
    fontSize: 11,
  },
  contactBubble: {
    maxWidth: "75%",
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
  },
  contactHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: "600",
  },
  contactDetail: {
    fontSize: 13,
    marginTop: 2,
  },
  documentBubble: {
    maxWidth: "75%",
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
  },
  documentContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  documentIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 14,
    fontWeight: "500",
  },
  documentMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  contactPickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  contactPickerTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  contactPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  contactPickerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  contactPickerInfo: {
    flex: 1,
  },
  contactPickerName: {
    fontSize: 16,
    fontWeight: "500",
  },
  contactPickerDetail: {
    fontSize: 14,
    marginTop: 2,
  },
  assetSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    marginBottom: Spacing.lg,
  },
  assetSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  assetSelectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  assetSelectorIconText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  assetSelectorSymbol: {
    fontSize: 16,
    fontWeight: "600",
  },
  assetSelectorBalance: {
    fontSize: 13,
    marginTop: 2,
  },
  assetSelectorOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  assetSelectorSheet: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  assetSelectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  assetSelectorItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  assetSelectorItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  assetSelectorItemInfo: {
    flex: 1,
  },
  assetSelectorItemSymbol: {
    fontSize: 15,
    fontWeight: "600",
  },
  assetSelectorItemName: {
    fontSize: 13,
    marginTop: 2,
  },
  assetSelectorItemBalance: {
    alignItems: "flex-end",
  },
  assetSelectorItemUsd: {
    fontSize: 15,
    fontWeight: "600",
  },
  assetSelectorItemTokens: {
    fontSize: 12,
    marginTop: 2,
  },
  audioBubble: {
    maxWidth: "80%",
    minWidth: 240,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.sm,
  },
  audioMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  audioAvatarContainer: {
    position: "relative",
  },
  audioAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  unplayedDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00A884",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  audioPlayButtonWhatsApp: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  audioWaveformContainer: {
    flex: 1,
    gap: 4,
  },
  audioWaveformBars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 28,
  },
  audioWaveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  audioMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  audioTimeDisplay: {
    fontSize: 11,
    fontWeight: "500",
  },
  audioMetaRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  audioTimestamp: {
    fontSize: 11,
  },
  playbackSpeedButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  playbackSpeedText: {
    fontSize: 12,
    fontWeight: "600",
  },
  disappearingDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  disappearingOptions: {
    gap: Spacing.sm,
  },
  disappearingOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  disappearingOptionSelected: {
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  disappearingOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  disappearingOptionText: {
    fontSize: 16,
  },
  disappearingWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: 8,
  },
  disappearingWarningText: {
    flex: 1,
    fontSize: 13,
  },
  systemMessageContainer: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.sm,
    maxWidth: "90%",
  },
  systemMessageText: {
    flex: 1,
    fontSize: 13,
    textAlign: "center",
  },
  searchModalContainer: {
    flex: 1,
  },
  searchModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  searchCancelButton: {
    paddingHorizontal: Spacing.sm,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  searchResultContent: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  searchResultTime: {
    fontSize: 12,
    marginBottom: 4,
  },
  searchResultText: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  searchEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  searchEmptyText: {
    fontSize: 16,
    textAlign: "center",
    maxWidth: "80%",
  },
  highlightedMessage: {
    borderWidth: 2,
    borderColor: "#FFEB3B",
  },
});
