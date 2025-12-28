import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, Platform, ActivityIndicator } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getChats, Chat } from "@/lib/storage";
import { useXMTP } from "@/contexts/XMTPContext";
import { getConversations, getMessages, type ConversationInfo, type XMTPConversation } from "@/lib/xmtp";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";

interface XMTPConversationItem {
  id: string;
  peerAddress: string;
  lastMessage: string;
  lastMessageTime: number;
  dm: XMTPConversation;
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface XMTPChatItemProps {
  conversation: XMTPConversationItem;
  onPress: () => void;
}

function XMTPChatItem({ conversation, onPress }: XMTPChatItemProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chatItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
    >
      <View style={[styles.addressAvatar, { backgroundColor: theme.primary }]}>
        <ThemedText style={styles.addressAvatarText}>
          {conversation.peerAddress.slice(2, 4).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <ThemedText style={styles.chatName} numberOfLines={1}>
            {truncateAddress(conversation.peerAddress)}
          </ThemedText>
          <ThemedText style={[styles.chatTime, { color: theme.textSecondary }]}>
            {formatTime(conversation.lastMessageTime)}
          </ThemedText>
        </View>
        <View style={styles.chatFooter}>
          <ThemedText
            style={[styles.chatMessage, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {conversation.lastMessage || "No messages yet"}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

interface LegacyChatItemProps {
  chat: Chat;
  onPress: () => void;
}

function LegacyChatItem({ chat, onPress }: LegacyChatItemProps) {
  const { theme } = useTheme();
  const participant = chat.participants[0];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chatItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
    >
      <Avatar avatarId={participant.avatarId} size={52} />
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <ThemedText style={styles.chatName} numberOfLines={1}>
            {chat.isGroup ? chat.name : participant.name}
          </ThemedText>
          <ThemedText style={[styles.chatTime, { color: theme.textSecondary }]}>
            {formatTime(chat.lastMessageTime)}
          </ThemedText>
        </View>
        <View style={styles.chatFooter}>
          <ThemedText
            style={[styles.chatMessage, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {chat.lastMessage || "No messages yet"}
          </ThemedText>
          {chat.unreadCount > 0 ? (
            <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.unreadText}>{chat.unreadCount}</ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState() {
  const { theme } = useTheme();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="message-circle" size={48} color={theme.textSecondary} />
      </View>
      <ThemedText type="h4" style={styles.emptyTitle}>No conversations yet</ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Start a conversation from the Discover tab
      </ThemedText>
    </View>
  );
}

function XMTPStatus({ isInitializing, error }: { isInitializing: boolean; error: string | null }) {
  const { theme } = useTheme();

  if (isInitializing) {
    return (
      <View style={styles.statusContainer}>
        <ActivityIndicator size="small" color={theme.primary} />
        <ThemedText style={[styles.statusText, { color: theme.textSecondary }]}>
          Connecting to secure messaging...
        </ThemedText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.statusContainer, styles.errorContainer]}>
        <Feather name="alert-circle" size={16} color={theme.error} />
        <ThemedText style={[styles.statusText, { color: theme.error }]}>
          {error}
        </ThemedText>
      </View>
    );
  }

  return null;
}

export default function ChatsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const { client, isInitializing, isSupported, error } = useXMTP();
  
  const [xmtpConversations, setXmtpConversations] = useState<XMTPConversationItem[]>([]);
  const [legacyChats, setLegacyChats] = useState<Chat[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadConversations = useCallback(async () => {
    // Always load legacy chats from AsyncStorage first
    const loadedChats = await getChats();
    setLegacyChats(loadedChats.sort((a, b) => b.lastMessageTime - a.lastMessageTime));

    if (Platform.OS === "web" || !isSupported || !client) {
      return;
    }

    try {
      const conversations = await getConversations();
      const conversationItems: XMTPConversationItem[] = await Promise.all(
        conversations.map(async (conv) => {
          try {
            const messages = await getMessages(conv.dm);
            const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
            const messageContent = lastMessage?.content;
            const contentStr = typeof messageContent === "string" 
              ? messageContent 
              : (messageContent ? String(messageContent) : "");
            const messageTime = lastMessage?.sentNs 
              ? Number(lastMessage.sentNs) / 1000000 
              : Date.now();
            
            return {
              id: conv.id,
              peerAddress: conv.peerAddress,
              lastMessage: contentStr,
              lastMessageTime: messageTime,
              dm: conv.dm,
            };
          } catch {
            return {
              id: conv.id,
              peerAddress: conv.peerAddress,
              lastMessage: "",
              lastMessageTime: Date.now(),
              dm: conv.dm,
            };
          }
        })
      );

      conversationItems.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      setXmtpConversations(conversationItems);
    } catch (err) {
      console.error("Failed to load XMTP conversations:", err);
    }
  }, [client, isSupported]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const handleXMTPChatPress = (conversation: XMTPConversationItem) => {
    navigation.navigate("Chat", { 
      chatId: conversation.id,
      name: truncateAddress(conversation.peerAddress),
      peerAddress: conversation.peerAddress,
      avatarId: undefined,
    });
  };

  const handleLegacyChatPress = (chat: Chat) => {
    const participant = chat.participants[0];
    navigation.navigate("Chat", { 
      chatId: chat.id, 
      name: chat.isGroup ? (chat.name || "Group") : participant.name,
      avatarId: participant?.avatarId,
      contactId: participant?.id,
    });
  };

  // Create unified chat item type for combined list
  type UnifiedChatItem = 
    | { type: "xmtp"; data: XMTPConversationItem }
    | { type: "legacy"; data: Chat };

  // Combine XMTP and legacy chats, sorted by time
  const combinedChats: UnifiedChatItem[] = React.useMemo(() => {
    const xmtpItems: UnifiedChatItem[] = xmtpConversations.map(conv => ({
      type: "xmtp" as const,
      data: conv,
    }));
    
    // Filter out legacy chats that might have matching XMTP conversations
    // (to avoid duplicates if a contact has both)
    const xmtpPeerAddresses = new Set(xmtpConversations.map(c => c.peerAddress.toLowerCase()));
    const filteredLegacy = legacyChats.filter(chat => {
      // Keep legacy chats that don't have a matching XMTP conversation
      const participant = chat.participants[0];
      if (!participant?.walletAddress) return true;
      return !xmtpPeerAddresses.has(participant.walletAddress.toLowerCase());
    });
    
    const legacyItems: UnifiedChatItem[] = filteredLegacy.map(chat => ({
      type: "legacy" as const,
      data: chat,
    }));
    
    // Combine and sort by time
    return [...xmtpItems, ...legacyItems].sort((a, b) => {
      const timeA = a.type === "xmtp" ? a.data.lastMessageTime : a.data.lastMessageTime;
      const timeB = b.type === "xmtp" ? b.data.lastMessageTime : b.data.lastMessageTime;
      return timeB - timeA;
    });
  }, [xmtpConversations, legacyChats]);

  const renderChatItem = ({ item }: { item: UnifiedChatItem }) => {
    if (item.type === "xmtp") {
      return <XMTPChatItem conversation={item.data} onPress={() => handleXMTPChatPress(item.data)} />;
    }
    return <LegacyChatItem chat={item.data} onPress={() => handleLegacyChatPress(item.data)} />;
  };

  const isNativeMode = Platform.OS !== "web" && isSupported;
  const showEmptyState = combinedChats.length === 0 && !isInitializing;

  return (
    <ThemedView style={styles.container}>
      <XMTPStatus isInitializing={isInitializing} error={error} />
      
      <FlatList
        data={combinedChats}
        keyExtractor={(item) => item.type === "xmtp" ? `xmtp-${item.data.id}` : `legacy-${item.data.id}`}
        renderItem={renderChatItem}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
          showEmptyState && styles.emptyListContent,
        ]}
        ListEmptyComponent={isInitializing ? null : EmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  chatContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chatName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    marginRight: Spacing.sm,
  },
  chatTime: {
    fontSize: 13,
  },
  chatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatMessage: {
    flex: 1,
    fontSize: 14,
    marginRight: Spacing.sm,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  separator: {
    height: 1,
    marginLeft: 72,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    textAlign: "center",
  },
  addressAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  addressAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  errorContainer: {
    backgroundColor: "rgba(255, 0, 0, 0.1)",
  },
  statusText: {
    fontSize: 13,
  },
});
