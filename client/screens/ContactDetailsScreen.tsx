import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, Modal, FlatList, Alert, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
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

export default function ContactDetailsScreen() {
  const route = useRoute<ContactDetailsRouteProp>();
  const navigation = useNavigation<ContactDetailsNavigationProp>();
  const { chatId, name, peerAddress, avatarId } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [disappearingTimer, setDisappearingTimer] = useState<DisappearingTimer>(null);
  const [chatBackground, setChatBackgroundState] = useState<ChatBackground | null>(null);
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [nickname, setNickname] = useState<string>("");
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  
  useEffect(() => {
    loadContactData();
  }, [chatId]);
  
  const loadContactData = useCallback(async () => {
    const [timer, background, messages, transactions] = await Promise.all([
      getChatDisappearingTimer(chatId),
      getChatBackground(chatId),
      getMessages(chatId),
      getTransactions(),
    ]);
    
    setDisappearingTimer(timer);
    if (background) setChatBackgroundState(background);
    
    const media: MediaItem[] = [];
    messages.forEach(msg => {
      if (msg.imageAttachment?.uri) {
        media.push({
          id: msg.id,
          uri: msg.imageAttachment.uri,
          type: "image",
          timestamp: msg.timestamp,
        });
      }
    });
    setMediaItems(media.sort((a, b) => b.timestamp - a.timestamp));
    
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
  
  const handleVoiceCall = () => {
    navigation.navigate("VideoCall", {
      chatId,
      contactName: name,
      contactAvatar: avatarId,
      isVideoCall: false,
    });
  };
  
  const handleVideoCall = () => {
    navigation.navigate("VideoCall", {
      chatId,
      contactName: name,
      contactAvatar: avatarId,
      isVideoCall: true,
    });
  };
  
  const handleSearch = () => {
    Alert.alert("Coming Soon", "In-chat search will be available in a future update.");
  };
  
  const handleMuteToggle = () => {
    setNotificationsMuted(!notificationsMuted);
  };
  
  const handleBlockUser = () => {
    Alert.alert(
      "Block User",
      `Are you sure you want to block ${name}? They will no longer be able to send you messages.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: () => Alert.alert("Blocked", `${name} has been blocked.`) }
      ]
    );
  };
  
  const handleReportSpam = () => {
    Alert.alert(
      "Report Spam",
      `Report ${name} as spam? This will also block them.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Report", style: "destructive", onPress: () => Alert.alert("Reported", "Thank you for your report.") }
      ]
    );
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
          <Avatar avatarId={avatarId || "coral"} size={100} />
          <ThemedText style={styles.profileName}>{name}</ThemedText>
          {peerAddress ? (
            <ThemedText style={[styles.profileAddress, { color: theme.textSecondary }]}>
              {peerAddress.slice(0, 8)}...{peerAddress.slice(-6)}
            </ThemedText>
          ) : null}
        </View>
        
        <View style={styles.quickActionsRow}>
          <QuickActionButton icon="phone" label="Voice" onPress={handleVoiceCall} />
          <QuickActionButton icon="video" label="Video" onPress={handleVideoCall} />
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
            icon="edit-3"
            label="Nickname"
            value={nickname || "None"}
            onPress={() => Alert.alert("Coming Soon", "Nickname feature coming soon.")}
          />
          <SettingsRow
            icon="droplet"
            label="Chat Color & Wallpaper"
            onPress={() => setShowThemeModal(true)}
          />
          <SettingsRow
            icon="bell"
            label="Sounds & Notifications"
            onPress={() => Alert.alert("Coming Soon", "Notification settings coming soon.")}
          />
        </View>
        
        <SectionHeader title="All Media" />
        <View style={[styles.section, { backgroundColor: theme.backgroundRoot }]}>
          {mediaItems.length > 0 ? (
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
            icon="slash"
            label="Block User"
            onPress={handleBlockUser}
            showChevron={false}
            iconColor={theme.error}
            labelColor={theme.error}
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
  profileName: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: Spacing.md,
  },
  profileAddress: {
    fontSize: 14,
    marginTop: Spacing.xs,
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
});
