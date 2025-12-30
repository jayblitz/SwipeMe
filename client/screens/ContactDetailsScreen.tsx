import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, Modal, FlatList, Alert, Dimensions, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { 
  getMessages, 
  Message, 
  Chat, 
  getChats,
  getChatBackground, 
  setChatBackground, 
  PRESET_BACKGROUNDS, 
  ChatBackground,
  DisappearingTimer, 
  getChatDisappearingTimer, 
  setChatDisappearingTimer, 
  getTimerLabel,
  Transaction,
  getTransactions,
} from "@/lib/storage";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";

type ContactDetailsRouteProp = RouteProp<ChatsStackParamList, "ContactDetails">;
type ContactDetailsNavigationProp = NativeStackNavigationProp<ChatsStackParamList, "ContactDetails">;

interface QuickActionButtonProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

function QuickActionButton({ icon, label, onPress, disabled }: QuickActionButtonProps) {
  const { theme } = useTheme();
  
  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickActionButton,
        { backgroundColor: theme.backgroundSecondary },
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 }
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Feather name={icon} size={22} color={disabled ? theme.textSecondary : theme.text} />
      <ThemedText style={[styles.quickActionLabel, { color: disabled ? theme.textSecondary : theme.text }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  showChevron?: boolean;
  iconColor?: string;
  labelColor?: string;
  toggle?: boolean;
  toggleValue?: boolean;
}

function SettingsRow({ icon, label, value, onPress, showChevron = true, iconColor, labelColor, toggle, toggleValue }: SettingsRowProps) {
  const { theme } = useTheme();
  
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingsRow,
        { borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSecondary }
      ]}
      onPress={onPress}
    >
      <View style={styles.settingsRowLeft}>
        <View style={[styles.settingsIcon, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name={icon} size={18} color={iconColor || theme.textSecondary} />
        </View>
        <ThemedText style={[styles.settingsLabel, labelColor ? { color: labelColor } : {}]}>
          {label}
        </ThemedText>
      </View>
      <View style={styles.settingsRowRight}>
        {value ? (
          <ThemedText style={[styles.settingsValue, { color: theme.textSecondary }]}>
            {value}
          </ThemedText>
        ) : null}
        {toggle !== undefined ? (
          <View style={[
            styles.toggleTrack,
            { backgroundColor: toggleValue ? theme.primary : theme.backgroundTertiary }
          ]}>
            <View style={[
              styles.toggleThumb,
              { backgroundColor: "#fff", transform: [{ translateX: toggleValue ? 16 : 0 }] }
            ]} />
          </View>
        ) : null}
        {showChevron ? (
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        ) : null}
      </View>
    </Pressable>
  );
}

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundDefault }]}>
      <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {title}
      </ThemedText>
    </View>
  );
}

interface MediaItem {
  id: string;
  uri: string;
  type: "image" | "document";
  timestamp: number;
}

interface LinkItem {
  id: string;
  url: string;
  title?: string;
  timestamp: number;
}

interface DocumentItem {
  id: string;
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
  timestamp: number;
}

type MediaTabType = "media" | "links" | "docs";

export default function ContactDetailsScreen() {
  const route = useRoute<ContactDetailsRouteProp>();
  const navigation = useNavigation<ContactDetailsNavigationProp>();
  const { chatId, name, peerAddress, avatarId, contactId } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [disappearingTimer, setDisappearingTimer] = useState<DisappearingTimer>(null);
  const [chatBackground, setChatBackgroundState] = useState<ChatBackground | null>(null);
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [linkItems, setLinkItems] = useState<LinkItem[]>([]);
  const [documentItems, setDocumentItems] = useState<DocumentItem[]>([]);
  const [activeMediaTab, setActiveMediaTab] = useState<MediaTabType>("media");
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<Date | null>(null);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [contactEmail, setContactEmail] = useState<string>("");
  const [contactUsername, setContactUsername] = useState<string>("");
  const [contactProfileImage, setContactProfileImage] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);
  
  useEffect(() => {
    loadContactData();
  }, [chatId, contactId]);
  
  const loadContactData = useCallback(async () => {
    const [timer, background, messages, transactions] = await Promise.all([
      getChatDisappearingTimer(chatId),
      getChatBackground(chatId),
      getMessages(chatId),
      getTransactions(),
    ]);
    
    setDisappearingTimer(timer);
    if (background) setChatBackgroundState(background);
    
    if (contactId) {
      try {
        const baseUrl = getApiUrl();
        const response = await fetch(new URL(`/api/users/${contactId}/public`, baseUrl), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        
        if (response.ok) {
          const userData = await response.json();
          if (userData.email) setContactEmail(userData.email);
          if (userData.username) setContactUsername(userData.username);
          if (userData.profileImage) setContactProfileImage(userData.profileImage);
          if (userData.lastSeenAt) setLastSeenAt(new Date(userData.lastSeenAt));
        }
        
        const muteResponse = await fetch(new URL(`/api/chats/${chatId}/mute-status`, baseUrl), {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        
        if (muteResponse.ok) {
          const muteData = await muteResponse.json();
          setNotificationsMuted(muteData.isMuted);
          if (muteData.mutedUntil) setMutedUntil(new Date(muteData.mutedUntil));
        }
      } catch (error) {
        console.error("Failed to fetch contact profile:", error);
      }
    }
    
    const media: MediaItem[] = [];
    const links: LinkItem[] = [];
    const docs: DocumentItem[] = [];
    
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
    const cleanUrl = (url: string) => url.replace(/[.,;:!?)]+$/, '');
    
    messages.forEach(msg => {
      if (msg.imageAttachment?.uri) {
        media.push({
          id: msg.id,
          uri: msg.imageAttachment.uri,
          type: "image",
          timestamp: msg.timestamp,
        });
      }
      
      if (msg.documentAttachment?.uri) {
        docs.push({
          id: msg.id,
          name: msg.documentAttachment.name || "Document",
          uri: msg.documentAttachment.uri,
          mimeType: msg.documentAttachment.mimeType,
          size: msg.documentAttachment.size,
          timestamp: msg.timestamp,
        });
      }
      
      if (msg.content && msg.type !== "payment" && msg.type !== "system") {
        const foundUrls = msg.content.match(urlRegex);
        if (foundUrls) {
          foundUrls.forEach((url, idx) => {
            links.push({
              id: `${msg.id}_link_${idx}`,
              url: cleanUrl(url),
              timestamp: msg.timestamp,
            });
          });
        }
      }
    });
    
    setMediaItems(media.sort((a, b) => b.timestamp - a.timestamp));
    setLinkItems(links.sort((a, b) => b.timestamp - a.timestamp));
    setDocumentItems(docs.sort((a, b) => b.timestamp - a.timestamp));
    
    const contactPayments = transactions.filter(tx => {
      if (tx.contactId && chatId) {
        const contactIdFromChat = chatId.replace("chat_", "");
        if (tx.contactId === contactIdFromChat) return true;
      }
      if (tx.contactName && name && tx.contactName.toLowerCase() === name.toLowerCase()) return true;
      if (peerAddress && tx.txHash) return true;
      return false;
    });
    setPayments(contactPayments);
  }, [chatId, name, peerAddress]);
  
  const handleDisappearingTimerChange = async (timer: DisappearingTimer) => {
    await setChatDisappearingTimer(chatId, timer);
    setDisappearingTimer(timer);
    setShowDisappearingModal(false);
  };
  
  const handleBackgroundChange = async (bg: ChatBackground) => {
    await setChatBackground(chatId, bg);
    setChatBackgroundState(bg);
    setShowThemeModal(false);
  };
  
  const handleSearch = () => {
    Alert.alert("Coming Soon", "In-chat search will be available in a future update.");
  };
  
  const handleMuteToggle = () => {
    if (notificationsMuted) {
      handleUnmute();
    } else {
      setShowMuteModal(true);
    }
  };
  
  const handleMuteDuration = async (duration: "1h" | "8h" | "1d" | "1w" | "forever") => {
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/chats/${chatId}/mute`, baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ duration }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotificationsMuted(true);
        setMutedUntil(new Date(data.mutedUntil));
        setShowMuteModal(false);
      }
    } catch (error) {
      console.error("Failed to mute chat:", error);
      Alert.alert("Error", "Failed to mute notifications");
    }
  };
  
  const handleUnmute = async () => {
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/chats/${chatId}/unmute`, baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (response.ok) {
        setNotificationsMuted(false);
        setMutedUntil(null);
      }
    } catch (error) {
      console.error("Failed to unmute chat:", error);
      Alert.alert("Error", "Failed to unmute notifications");
    }
  };
  
  const getOnlineStatus = () => {
    if (!lastSeenAt) return null;
    const now = new Date();
    const diffMs = now.getTime() - lastSeenAt.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 5) return "Online";
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Active yesterday";
    if (diffDays < 7) return `Active ${diffDays} days ago`;
    
    return `Last seen ${lastSeenAt.toLocaleDateString()}`;
  };
  
  const handleBlockUser = () => {
    if (isBlocked) {
      Alert.alert(
        "Unblock User",
        `Are you sure you want to unblock ${name}? They will be able to send you messages again.`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Unblock", 
            onPress: () => {
              setIsBlocked(false);
              Alert.alert("Unblocked", `${name} has been unblocked.`);
            }
          }
        ]
      );
    } else {
      Alert.alert(
        "Block User",
        `Are you sure you want to block ${name}? They will no longer be able to send you messages.`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Block", 
            style: "destructive", 
            onPress: () => {
              setIsBlocked(true);
              Alert.alert("Blocked", `${name} has been blocked.`);
            }
          }
        ]
      );
    }
  };
  
  const handleReportSpam = () => {
    Alert.alert(
      "Report Spam",
      `Report ${name} as spam? This will also block them.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Report", 
          style: "destructive", 
          onPress: () => {
            setIsBlocked(true);
            Alert.alert("Reported", "Thank you for your report. This user has been blocked.");
          }
        }
      ]
    );
  };
  
  const handlePickWallpaper = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      handleBackgroundChange({ type: "image", value: result.assets[0].uri });
    }
  };
  
  const screenWidth = Dimensions.get("window").width;
  const mediaGridSize = (screenWidth - Spacing.md * 4) / 3;
  
  return (
    <ThemedView style={styles.container}>
      <ScrollView 
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.profileHeader, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.avatarContainer}>
            <Avatar avatarId={avatarId || "coral"} imageUri={contactProfileImage} size={100} />
            {getOnlineStatus() === "Online" ? (
              <View style={[styles.onlineIndicator, { backgroundColor: "#22C55E" }]} />
            ) : null}
          </View>
          <ThemedText style={styles.profileName}>{name}</ThemedText>
          {contactUsername ? (
            <ThemedText style={[styles.profileUsername, { color: theme.primary }]}>
              @{contactUsername}
            </ThemedText>
          ) : null}
          {contactEmail ? (
            <ThemedText style={[styles.profileEmail, { color: theme.textSecondary }]}>
              {contactEmail}
            </ThemedText>
          ) : null}
          {getOnlineStatus() ? (
            <ThemedText style={[styles.onlineStatus, { color: getOnlineStatus() === "Online" ? "#22C55E" : theme.textSecondary }]}>
              {getOnlineStatus()}
            </ThemedText>
          ) : null}
          {peerAddress ? (
            <ThemedText style={[styles.profileAddress, { color: theme.textSecondary }]}>
              {peerAddress.slice(0, 8)}...{peerAddress.slice(-6)}
            </ThemedText>
          ) : null}
        </View>
        
        <View style={styles.quickActionsRow}>
          <QuickActionButton 
            icon={notificationsMuted ? "bell-off" : "bell"} 
            label={notificationsMuted ? "Unmute" : "Mute"} 
            onPress={handleMuteToggle} 
          />
          <QuickActionButton icon="search" label="Search" onPress={handleSearch} />
        </View>
        
        <View style={[styles.section, { backgroundColor: theme.backgroundRoot }]}>
          <SettingsRow
            icon="clock"
            label="Disappearing Messages"
            value={getTimerLabel(disappearingTimer)}
            onPress={() => setShowDisappearingModal(true)}
          />
          <SettingsRow
            icon="droplet"
            label="Chat Color & Wallpaper"
            onPress={() => setShowThemeModal(true)}
          />
          <SettingsRow
            icon={notificationsMuted ? "bell-off" : "bell"}
            label="Notifications"
            value={notificationsMuted ? (mutedUntil && mutedUntil.getTime() < Date.now() + 99 * 365 * 24 * 60 * 60 * 1000 ? `Until ${mutedUntil.toLocaleDateString()}` : "Muted") : "On"}
            onPress={handleMuteToggle}
          />
        </View>
        
        <View style={[styles.mediaTabs, { backgroundColor: theme.backgroundRoot }]}>
          <Pressable 
            style={[styles.mediaTab, activeMediaTab === "media" ? { borderBottomColor: theme.primary } : { borderBottomColor: "transparent" }]}
            onPress={() => setActiveMediaTab("media")}
          >
            <ThemedText style={[styles.mediaTabText, { color: activeMediaTab === "media" ? theme.primary : theme.textSecondary }]}>
              Media ({mediaItems.length})
            </ThemedText>
          </Pressable>
          <Pressable 
            style={[styles.mediaTab, activeMediaTab === "links" ? { borderBottomColor: theme.primary } : { borderBottomColor: "transparent" }]}
            onPress={() => setActiveMediaTab("links")}
          >
            <ThemedText style={[styles.mediaTabText, { color: activeMediaTab === "links" ? theme.primary : theme.textSecondary }]}>
              Links ({linkItems.length})
            </ThemedText>
          </Pressable>
          <Pressable 
            style={[styles.mediaTab, activeMediaTab === "docs" ? { borderBottomColor: theme.primary } : { borderBottomColor: "transparent" }]}
            onPress={() => setActiveMediaTab("docs")}
          >
            <ThemedText style={[styles.mediaTabText, { color: activeMediaTab === "docs" ? theme.primary : theme.textSecondary }]}>
              Docs ({documentItems.length})
            </ThemedText>
          </Pressable>
        </View>
        
        <View style={[styles.section, { backgroundColor: theme.backgroundRoot }]}>
          {activeMediaTab === "media" ? (
            mediaItems.length > 0 ? (
              <View style={styles.mediaGrid}>
                {mediaItems.slice(0, 6).map((item) => (
                  <Pressable key={item.id} style={[styles.mediaItem, { width: mediaGridSize, height: mediaGridSize }]}>
                    <Image 
                      source={{ uri: item.uri }} 
                      style={styles.mediaImage}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
                {mediaItems.length > 6 ? (
                  <Pressable 
                    style={[styles.mediaItem, styles.mediaViewAll, { width: mediaGridSize, height: mediaGridSize, backgroundColor: theme.backgroundTertiary }]}
                    onPress={() => Alert.alert("View All", `${mediaItems.length} total media items`)}
                  >
                    <ThemedText style={styles.mediaViewAllText}>+{mediaItems.length - 6}</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Feather name="image" size={32} color={theme.textSecondary} />
                <ThemedText style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                  No shared media yet
                </ThemedText>
              </View>
            )
          ) : activeMediaTab === "links" ? (
            linkItems.length > 0 ? (
              <View style={styles.linksList}>
                {linkItems.slice(0, 5).map((link) => (
                  <Pressable 
                    key={link.id} 
                    style={[styles.linkRow, { borderBottomColor: theme.border }]}
                    onPress={async () => {
                      try {
                        const canOpen = await Linking.canOpenURL(link.url);
                        if (canOpen) {
                          await Linking.openURL(link.url);
                        } else {
                          Alert.alert("Cannot Open", "This link cannot be opened.");
                        }
                      } catch {
                        Alert.alert("Error", "Failed to open this link.");
                      }
                    }}
                  >
                    <View style={[styles.linkIcon, { backgroundColor: theme.backgroundTertiary }]}>
                      <Feather name="link" size={16} color={theme.primary} />
                    </View>
                    <View style={styles.linkContent}>
                      <ThemedText style={styles.linkUrl} numberOfLines={1}>
                        {link.url}
                      </ThemedText>
                      <ThemedText style={[styles.linkDate, { color: theme.textSecondary }]}>
                        {new Date(link.timestamp).toLocaleDateString()}
                      </ThemedText>
                    </View>
                    <Feather name="external-link" size={16} color={theme.textSecondary} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Feather name="link" size={32} color={theme.textSecondary} />
                <ThemedText style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                  No shared links yet
                </ThemedText>
              </View>
            )
          ) : (
            documentItems.length > 0 ? (
              <View style={styles.docsList}>
                {documentItems.slice(0, 5).map((doc) => (
                  <Pressable 
                    key={doc.id} 
                    style={[styles.docRow, { borderBottomColor: theme.border }]}
                    onPress={async () => {
                      try {
                        if (doc.uri.startsWith("file://")) {
                          Alert.alert("Document", `${doc.name}\n\nLocal documents can be viewed in the chat.`);
                          return;
                        }
                        const canOpen = await Linking.canOpenURL(doc.uri);
                        if (canOpen) {
                          await Linking.openURL(doc.uri);
                        } else {
                          Alert.alert("Cannot Open", "This document cannot be opened.");
                        }
                      } catch {
                        Alert.alert("Error", "Failed to open this document.");
                      }
                    }}
                  >
                    <View style={[styles.docIcon, { backgroundColor: theme.backgroundTertiary }]}>
                      <Feather name="file-text" size={20} color={theme.primary} />
                    </View>
                    <View style={styles.docContent}>
                      <ThemedText style={styles.docName} numberOfLines={1}>
                        {doc.name}
                      </ThemedText>
                      <ThemedText style={[styles.docMeta, { color: theme.textSecondary }]}>
                        {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : "Document"} - {new Date(doc.timestamp).toLocaleDateString()}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Feather name="file" size={32} color={theme.textSecondary} />
                <ThemedText style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                  No shared documents yet
                </ThemedText>
              </View>
            )
          )}
        </View>
        
        <SectionHeader title="Shared Payments" />
        <View style={[styles.section, { backgroundColor: theme.backgroundRoot }]}>
          {payments.length > 0 ? (
            payments.slice(0, 3).map((payment) => (
              <View key={payment.id} style={[styles.paymentRow, { borderBottomColor: theme.border }]}>
                <View style={styles.paymentInfo}>
                  <ThemedText style={styles.paymentAmount}>
                    {payment.type === "sent" ? "-" : "+"}${payment.amount.toFixed(2)}
                  </ThemedText>
                  <ThemedText style={[styles.paymentMemo, { color: theme.textSecondary }]}>
                    {payment.memo || "Payment"}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.paymentDate, { color: theme.textSecondary }]}>
                  {new Date(payment.timestamp).toLocaleDateString()}
                </ThemedText>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Feather name="dollar-sign" size={32} color={theme.textSecondary} />
              <ThemedText style={[styles.emptyStateText, { color: theme.textSecondary }]}>
                No payments yet
              </ThemedText>
            </View>
          )}
        </View>
        
        <SectionHeader title="Groups in Common" />
        <View style={[styles.section, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.emptyState}>
            <Feather name="users" size={32} color={theme.textSecondary} />
            <ThemedText style={[styles.emptyStateText, { color: theme.textSecondary }]}>
              No Groups in Common
            </ThemedText>
          </View>
          <SettingsRow
            icon="plus"
            label="Add to a Group"
            onPress={() => Alert.alert("Coming Soon", "Group feature coming soon.")}
          />
        </View>
        
        <View style={[styles.section, { backgroundColor: theme.backgroundRoot, marginTop: Spacing.lg }]}>
          <SettingsRow
            icon={isBlocked ? "user-check" : "slash"}
            label={isBlocked ? "Unblock User" : "Block User"}
            onPress={handleBlockUser}
            showChevron={false}
            iconColor={isBlocked ? theme.primary : theme.error}
            labelColor={isBlocked ? theme.primary : theme.error}
          />
          <SettingsRow
            icon="alert-circle"
            label="Report Spam"
            onPress={handleReportSpam}
            showChevron={false}
            iconColor={theme.error}
            labelColor={theme.error}
          />
        </View>
      </ScrollView>
      
      <Modal
        visible={showDisappearingModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDisappearingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayTouch} onPress={() => setShowDisappearingModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: theme.backgroundRoot, paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHandle} />
            <ThemedText style={styles.modalTitle}>Disappearing Messages</ThemedText>
            <ThemedText style={[styles.modalDescription, { color: theme.textSecondary }]}>
              New messages will disappear after the selected time.
            </ThemedText>
            
            {([null, "24h", "7d", "30d"] as DisappearingTimer[]).map((timer) => (
              <Pressable
                key={timer || "off"}
                style={[styles.timerOption, { borderBottomColor: theme.border }]}
                onPress={() => handleDisappearingTimerChange(timer)}
              >
                <ThemedText style={styles.timerLabel}>{getTimerLabel(timer)}</ThemedText>
                {disappearingTimer === timer ? (
                  <Feather name="check" size={22} color={theme.primary} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
      
      <Modal
        visible={showThemeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowThemeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayTouch} onPress={() => setShowThemeModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: theme.backgroundRoot, paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHandle} />
            <ThemedText style={styles.modalTitle}>Chat Color & Wallpaper</ThemedText>
            
            <Pressable
              style={[styles.galleryButton, { backgroundColor: theme.backgroundSecondary }]}
              onPress={handlePickWallpaper}
            >
              <Feather name="image" size={20} color={theme.text} />
              <ThemedText style={styles.galleryButtonText}>Choose from Gallery</ThemedText>
            </Pressable>
            
            <ThemedText style={[styles.colorSectionLabel, { color: theme.textSecondary }]}>
              Preset Colors
            </ThemedText>
            
            <View style={styles.colorGrid}>
              {PRESET_BACKGROUNDS.map((bg) => (
                <Pressable
                  key={bg.id}
                  style={[
                    styles.colorOption,
                    { backgroundColor: bg.value },
                    chatBackground?.value === bg.value && { borderWidth: 3, borderColor: theme.primary }
                  ]}
                  onPress={() => handleBackgroundChange({ type: bg.type, value: bg.value })}
                >
                  {chatBackground?.value === bg.value ? (
                    <Feather name="check" size={24} color="#fff" />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
      
      <Modal
        visible={showMuteModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMuteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayTouch} onPress={() => setShowMuteModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: theme.backgroundRoot, paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.modalHandle} />
            <ThemedText style={styles.modalTitle}>Mute Notifications</ThemedText>
            <ThemedText style={[styles.modalDescription, { color: theme.textSecondary }]}>
              Choose how long to mute notifications from this chat.
            </ThemedText>
            
            {([
              { key: "1h", label: "1 hour" },
              { key: "8h", label: "8 hours" },
              { key: "1d", label: "1 day" },
              { key: "1w", label: "1 week" },
              { key: "forever", label: "Until I unmute" },
            ] as { key: "1h" | "8h" | "1d" | "1w" | "forever"; label: string }[]).map((option) => (
              <Pressable
                key={option.key}
                style={[styles.timerOption, { borderBottomColor: theme.border }]}
                onPress={() => handleMuteDuration(option.key)}
              >
                <ThemedText style={styles.timerLabel}>{option.label}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  avatarContainer: {
    position: "relative",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#fff",
  },
  profileName: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: Spacing.md,
  },
  profileUsername: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: Spacing.xs,
  },
  profileEmail: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  onlineStatus: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  profileAddress: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: "monospace",
  },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  quickActionButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 72,
    height: 64,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  section: {
    marginTop: Spacing.xs,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  settingsIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsLabel: {
    fontSize: 16,
  },
  settingsRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  settingsValue: {
    fontSize: 15,
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  mediaItem: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  mediaViewAll: {
    alignItems: "center",
    justifyContent: "center",
  },
  mediaViewAllText: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyStateText: {
    fontSize: 14,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  paymentInfo: {
    gap: 2,
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
  paymentMemo: {
    fontSize: 13,
  },
  paymentDate: {
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalOverlayTouch: {
    flex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  modalDescription: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  timerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timerLabel: {
    fontSize: 16,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  colorOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  galleryButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  colorSectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  mediaTabs: {
    flexDirection: "row",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
  },
  mediaTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
  },
  mediaTabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  linksList: {
    paddingHorizontal: Spacing.sm,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  linkContent: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  linkUrl: {
    fontSize: 14,
    fontWeight: "500",
  },
  linkDate: {
    fontSize: 12,
    marginTop: 2,
  },
  docsList: {
    paddingHorizontal: Spacing.sm,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  docContent: {
    flex: 1,
  },
  docName: {
    fontSize: 14,
    fontWeight: "500",
  },
  docMeta: {
    fontSize: 12,
    marginTop: 2,
  },
});
