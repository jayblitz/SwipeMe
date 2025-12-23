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
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getMessages, sendMessage, sendPayment, sendAttachmentMessage, sendAudioMessage, getChats, Message, Chat, getContactWalletAddress, getChatBackground, setChatBackground, PRESET_BACKGROUNDS, ChatBackground } from "@/lib/storage";
import { fetchTokenBalances, getTotalBalance, TokenBalance, TEMPO_TOKENS, TempoToken } from "@/lib/tempo-tokens";
import { getApiUrl } from "@/lib/query-client";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";

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
      console.log("No player or audio URI");
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
}

const { width: screenWidth } = Dimensions.get("window");
const IMAGE_MAX_WIDTH = screenWidth * 0.65;

function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
  const { theme } = useTheme();
  
  if (message.type === "payment") {
    return (
      <View style={[
        styles.paymentBubble,
        { 
          backgroundColor: isOwnMessage ? theme.primary : theme.backgroundSecondary,
          alignSelf: isOwnMessage ? "flex-end" : "flex-start",
        }
      ]}>
        <View style={styles.paymentHeader}>
          <Feather 
            name={isOwnMessage ? "arrow-up-right" : "arrow-down-left"} 
            size={16} 
            color={isOwnMessage ? "#FFFFFF" : theme.primary} 
          />
          <ThemedText style={[
            styles.paymentLabel,
            { color: isOwnMessage ? "rgba(255,255,255,0.8)" : theme.textSecondary }
          ]}>
            {isOwnMessage ? "You sent" : "Received"}
          </ThemedText>
        </View>
        <ThemedText style={[
          styles.paymentAmount,
          { color: isOwnMessage ? "#FFFFFF" : theme.text }
        ]}>
          ${message.paymentAmount?.toFixed(2)}
        </ThemedText>
        {message.paymentMemo ? (
          <ThemedText style={[
            styles.paymentMemo,
            { color: isOwnMessage ? "rgba(255,255,255,0.8)" : theme.textSecondary }
          ]}>
            {message.paymentMemo}
          </ThemedText>
        ) : null}
        <View style={styles.paymentStatus}>
          <Feather 
            name="check-circle" 
            size={12} 
            color={isOwnMessage ? "rgba(255,255,255,0.7)" : theme.success} 
          />
          <ThemedText style={[
            styles.paymentStatusText,
            { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.success }
          ]}>
            {message.paymentStatus === "completed" ? "Completed" : "Pending"}
          </ThemedText>
        </View>
      </View>
    );
  }

  if (message.type === "image" && message.imageAttachment) {
    const aspectRatio = (message.imageAttachment.width && message.imageAttachment.height)
      ? message.imageAttachment.width / message.imageAttachment.height
      : 1;
    const imageWidth = Math.min(IMAGE_MAX_WIDTH, message.imageAttachment.width || IMAGE_MAX_WIDTH);
    const imageHeight = imageWidth / aspectRatio;
    
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
        <ThemedText style={[
          styles.imageTime,
          { color: "rgba(255,255,255,0.9)" }
        ]}>
          {formatTime(message.timestamp)}
        </ThemedText>
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
        <ThemedText style={[
          styles.messageTime,
          { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
        ]}>
          {formatTime(message.timestamp)}
        </ThemedText>
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
        <ThemedText style={[
          styles.messageTime,
          { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
        ]}>
          {formatTime(message.timestamp)}
        </ThemedText>
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
        <ThemedText style={[
          styles.messageTime,
          { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
        ]}>
          {formatTime(message.timestamp)}
        </ThemedText>
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

  return (
    <View style={[
      styles.messageBubble,
      isOwnMessage ? [styles.ownMessage, { backgroundColor: theme.sentMessage }] 
                   : [styles.otherMessage, { backgroundColor: theme.receivedMessage }]
    ]}>
      <ThemedText style={[
        styles.messageText,
        { color: isOwnMessage ? "#FFFFFF" : theme.text }
      ]}>
        {message.content}
      </ThemedText>
      <ThemedText style={[
        styles.messageTime,
        { color: isOwnMessage ? "rgba(255,255,255,0.7)" : theme.textSecondary }
      ]}>
        {formatTime(message.timestamp)}
      </ThemedText>
    </View>
  );
}

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (amount: number, memo: string, selectedToken: TempoToken) => void;
  recipientName: string;
  recipientAvatar: string;
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
  const totalBalance = getTotalBalance(tokenBalances);

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
  const route = useRoute<RouteProp<ChatsStackParamList, "Chat">>();
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const { chatId, name } = route.params;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [chatBackground, setChatBackgroundState] = useState<ChatBackground | null>(null);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>(
    TEMPO_TOKENS.map(token => ({ token, balance: "0", balanceFormatted: "0", balanceUsd: 0 }))
  );
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <HeaderButton onPress={() => setShowBackgroundPicker(true)}>
            <Feather name="image" size={20} color={theme.primary} />
          </HeaderButton>
          <HeaderButton onPress={() => setShowPayment(true)}>
            <Feather name="dollar-sign" size={20} color={theme.primary} />
          </HeaderButton>
        </View>
      ),
    });
  }, [navigation, theme]);

  const loadData = useCallback(async () => {
    const [loadedMessages, loadedChats, loadedBackground] = await Promise.all([
      getMessages(chatId),
      getChats(),
      getChatBackground(chatId),
    ]);
    setMessages(loadedMessages.sort((a, b) => b.timestamp - a.timestamp));
    const currentChat = loadedChats.find(c => c.id === chatId);
    if (currentChat) setChat(currentChat);
    if (loadedBackground) setChatBackgroundState(loadedBackground);
    
    // Fetch wallet and token balances
    if (user?.id) {
      try {
        const baseUrl = getApiUrl();
        const walletRes = await fetch(new URL(`/api/wallet/${user.id}`, baseUrl));
        if (walletRes.ok) {
          const walletData = await walletRes.json();
          if (walletData.wallet?.address) {
            setWalletAddress(walletData.wallet.address);
            const balances = await fetchTokenBalances(walletData.wallet.address);
            setTokenBalances(balances);
          }
        }
      } catch (error) {
        console.error("Failed to fetch wallet/balances:", error);
      }
    }
  }, [chatId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const isRecordingRef = useRef(false);
  
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);
  
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (isRecordingRef.current) {
        try {
          audioRecorder.stop();
        } catch (e) {
          // Recorder may already be stopped
        }
      }
    };
  }, []);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const newMessage = await sendMessage(chatId, inputText.trim());
    setMessages(prev => [newMessage, ...prev]);
    setInputText("");
  };

  const handleMicrophonePress = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Voice Messages", "Voice messages work best in the mobile app. Try using Expo Go to test this feature.");
      return;
    }
    
    try {
      const hasPermission = await AudioModule.requestRecordingPermissionsAsync();
      if (!hasPermission.granted) {
        if (!hasPermission.canAskAgain) {
          Alert.alert(
            "Microphone Access Required",
            "Please enable microphone access in your device settings to record voice messages.",
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Open Settings", 
                onPress: async () => {
                  if (Platform.OS !== "web") {
                    try {
                      await Linking.openSettings();
                    } catch (e) {
                      // Settings not available
                    }
                  }
                }
              }
            ]
          );
        } else {
          Alert.alert("Permission Denied", "Microphone permission is required to record voice messages.");
        }
        return;
      }
      
      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      
      setIsRecording(true);
      setRecordingTime(0);
      audioRecorder.record();
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Recording error:", error);
      await AudioModule.setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      Alert.alert("Error", "Failed to start recording. Please try again.");
    }
  };
  
  const handleCancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    audioRecorder.stop();
    await AudioModule.setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
    setIsRecording(false);
    setRecordingTime(0);
  };
  
  const handleSendRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    const duration = recordingTime;
    setIsRecording(false);
    setRecordingTime(0);
    
    try {
      await audioRecorder.stop();
      await AudioModule.setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      const uri = audioRecorder.uri;
      if (uri) {
        const newMessage = await sendAudioMessage(chatId, uri, duration);
        setMessages(prev => [newMessage, ...prev]);
      }
    } catch (error) {
      console.error("Failed to save recording:", error);
      Alert.alert("Error", "Failed to save voice message.");
    }
  };
  
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendPayment = async (amount: number, memo: string, selectedToken: TempoToken) => {
    if (!chat || !user?.id) return;
    setSending(true);
    
    try {
      const participant = chat.participants[0];
      
      // Get wallet address from source of truth first, fall back to cached data
      const recipientWalletAddress = getContactWalletAddress(participant.id) || participant.walletAddress;
      
      // For MVP, we need the recipient's wallet address
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
      const { message } = await sendPayment(
        chatId,
        amount,
        `${memo || "Payment"} (${selectedToken.symbol})`,
        participant.id,
        participant.name,
        participant.avatarId,
        txData.txHash
      );
      setMessages(prev => [message, ...prev]);
      
      // Refresh balances
      if (walletAddress) {
        const balances = await fetchTokenBalances(walletAddress);
        setTokenBalances(balances);
      }
      
      setShowPayment(false);
      Alert.alert(
        "Success",
        "Payment sent successfully!",
        [
          { text: "OK", style: "cancel" },
          { 
            text: "View on Explorer", 
            onPress: () => Linking.openURL(txData.explorer) 
          },
        ]
      );
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
                  <MessageBubble message={item} isOwnMessage={item.senderId === "me"} />
                  {showDateSeparator ? <DateSeparator timestamp={item.timestamp} /> : null}
                </>
              );
            }}
            inverted
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        
        {isRecording ? (
          <View style={[
            styles.recordingBar, 
            { 
              backgroundColor: theme.backgroundRoot,
              paddingBottom: Math.max(insets.bottom, Spacing.md),
              borderTopColor: theme.border,
            }
          ]}>
            <View style={styles.recordingTopRow}>
              <ThemedText style={styles.recordingTimer}>
                {formatRecordingTime(recordingTime)}
              </ThemedText>
              <View style={styles.waveformContainer}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.waveformBar,
                      { 
                        backgroundColor: theme.textSecondary,
                        height: 4 + Math.random() * 20,
                        opacity: i < recordingTime % 20 ? 1 : 0.3,
                      }
                    ]} 
                  />
                ))}
              </View>
              <View style={styles.recordingSpeed}>
                <Feather name="clock" size={14} color={theme.textSecondary} />
                <ThemedText style={[styles.recordingSpeedText, { color: theme.textSecondary }]}>
                  1x
                </ThemedText>
              </View>
            </View>
            <View style={styles.recordingBottomRow}>
              <Pressable 
                onPress={handleCancelRecording}
                style={[styles.recordingActionButton, { backgroundColor: "transparent" }]}
              >
                <Feather name="trash-2" size={24} color={theme.textSecondary} />
              </Pressable>
              <View style={styles.recordingIndicatorWrapper} />
              <Pressable 
                onPress={handleSendRecording}
                style={[styles.recordingSendButton, { backgroundColor: "#25D366" }]}
              >
                <Feather name="send" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ) : (
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
              onPress={inputText.trim() ? handleSend : handleMicrophonePress}
              style={[
                styles.sendButton,
                { 
                  backgroundColor: inputText.trim() ? theme.primary : theme.backgroundSecondary,
                }
              ]}
            >
              <Feather 
                name={inputText.trim() ? "send" : "mic"} 
                size={inputText.trim() ? 18 : 20} 
                color={inputText.trim() ? "#FFFFFF" : theme.text} 
              />
            </Pressable>
          </View>
        )}
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
    marginTop: Spacing.sm,
  },
  paymentStatusText: {
    fontSize: 12,
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
  recordingBar: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  recordingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  recordingTimer: {
    fontSize: 16,
    fontWeight: "500",
    minWidth: 50,
  },
  waveformContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: 32,
    marginHorizontal: Spacing.md,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
  },
  recordingSpeed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recordingSpeedText: {
    fontSize: 12,
  },
  recordingBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  recordingActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingIndicatorWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  recordingSendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
