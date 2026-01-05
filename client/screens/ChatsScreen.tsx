import React, { useState, useCallback, useLayoutEffect, useEffect, useRef } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, Platform, ActivityIndicator, TextInput } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getChats, Chat, saveChat, generateChatId } from "@/lib/storage";
import { useXMTP } from "@/contexts/XMTPContext";
import { getConversations, getMessages, streamAllMessages, type XMTPConversation } from "@/lib/xmtp";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";
import { NewMessageScreen } from "@/screens/NewMessageScreen";
import * as Contacts from "expo-contacts";

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
        Tap the compose button to start a new chat
      </ThemedText>
    </View>
  );
}

function XMTPStatus({ 
  isInitializing, 
  error, 
  retryCount,
  onRetry 
}: { 
  isInitializing: boolean; 
  error: string | null;
  retryCount: number;
  onRetry: () => void;
}) {
  const { theme } = useTheme();

  if (isInitializing) {
    return (
      <View style={styles.statusContainer}>
        <ActivityIndicator size="small" color={theme.primary} />
        <ThemedText style={[styles.statusText, { color: theme.textSecondary }]}>
          {retryCount > 0 
            ? `Connecting... (attempt ${retryCount}/3)` 
            : "Connecting to secure messaging..."}
        </ThemedText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.statusContainer, styles.errorContainer]}>
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={16} color={theme.error} />
          <ThemedText style={[styles.statusText, { color: theme.error }]} numberOfLines={2}>
            {error}
          </ThemedText>
        </View>
        <Pressable 
          onPress={onRetry}
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </Pressable>
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
  const { client, isInitializing, isSupported, error, retryCount, retry } = useXMTP();
  
  const [xmtpConversations, setXmtpConversations] = useState<XMTPConversationItem[]>([]);
  const [legacyChats, setLegacyChats] = useState<Chat[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<Contacts.Contact[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setShowNewMessage(true)} style={{ padding: 8 }}>
          <Feather name="edit" size={22} color={theme.text} />
        </Pressable>
      ),
    });
  }, [navigation, theme]);

  const loadContacts = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === "granted") {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.Image],
        });
        setDeviceContacts(data);
      }
    } catch (error) {
      console.error("Failed to load contacts:", error);
    }
  }, []);

  const loadConversations = useCallback(async () => {
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
      loadContacts();
    }, [loadConversations, loadContacts])
  );

  const streamCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      isCancelled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (streamCancelRef.current) {
        streamCancelRef.current();
        streamCancelRef.current = null;
      }
    };

    if (Platform.OS === "web" || !isSupported || !client) {
      cleanup();
      return cleanup;
    }

    const setupStream = async () => {
      try {
        if (streamCancelRef.current) {
          streamCancelRef.current();
          streamCancelRef.current = null;
        }

        const cancelStream = await streamAllMessages(() => {
          if (isCancelled) return;

          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          debounceTimer = setTimeout(() => {
            if (!isCancelled) {
              loadConversations();
            }
          }, 500);
        });

        if (!isCancelled) {
          streamCancelRef.current = cancelStream;
        } else {
          cancelStream();
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to setup conversation stream:", error);
        }
      }
    };

    setupStream();

    return cleanup;
  }, [client, isSupported, loadConversations]);

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
      peerAddress: participant?.walletAddress,
      avatarId: participant?.avatarId,
      contactId: participant?.id,
    });
  };

  const handleStartChat = async (user: { id: string; email: string; name?: string; walletAddress?: string }) => {
    const chatId = generateChatId();
    const displayName = user.name || user.email;
    
    const newChat: Chat = {
      id: chatId,
      participants: [{
        id: user.id,
        name: displayName,
        avatarId: undefined,
        walletAddress: user.walletAddress,
      }],
      isGroup: false,
      lastMessage: "",
      lastMessageTime: Date.now(),
      unreadCount: 0,
    };
    
    await saveChat(newChat);
    await loadConversations();
    
    navigation.navigate("Chat", {
      chatId,
      name: displayName,
      peerAddress: user.walletAddress,
      contactId: user.id,
    });
  };

  type UnifiedChatItem = 
    | { type: "xmtp"; data: XMTPConversationItem }
    | { type: "legacy"; data: Chat };

  const combinedChats: UnifiedChatItem[] = React.useMemo(() => {
    const xmtpItems: UnifiedChatItem[] = xmtpConversations.map(conv => ({
      type: "xmtp" as const,
      data: conv,
    }));
    
    const xmtpPeerAddresses = new Set(xmtpConversations.map(c => c.peerAddress.toLowerCase()));
    const filteredLegacy = legacyChats.filter(chat => {
      const participant = chat.participants[0];
      if (!participant?.walletAddress) return true;
      return !xmtpPeerAddresses.has(participant.walletAddress.toLowerCase());
    });
    
    const legacyItems: UnifiedChatItem[] = filteredLegacy.map(chat => ({
      type: "legacy" as const,
      data: chat,
    }));
    
    let combined = [...xmtpItems, ...legacyItems].sort((a, b) => {
      const timeA = a.type === "xmtp" ? a.data.lastMessageTime : a.data.lastMessageTime;
      const timeB = b.type === "xmtp" ? b.data.lastMessageTime : b.data.lastMessageTime;
      return timeB - timeA;
    });

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      combined = combined.filter((item) => {
        if (item.type === "xmtp") {
          return item.data.peerAddress.toLowerCase().includes(query);
        }
        const name = item.data.isGroup ? item.data.name : item.data.participants[0]?.name;
        return name?.toLowerCase().includes(query);
      });
    }

    return combined;
  }, [xmtpConversations, legacyChats, searchQuery]);

  const renderChatItem = ({ item }: { item: UnifiedChatItem }) => {
    if (item.type === "xmtp") {
      return <XMTPChatItem conversation={item.data} onPress={() => handleXMTPChatPress(item.data)} />;
    }
    return <LegacyChatItem chat={item.data} onPress={() => handleLegacyChatPress(item.data)} />;
  };

  const showEmptyState = combinedChats.length === 0 && !isInitializing;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.searchContainer, { paddingTop: headerHeight + Spacing.sm }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="search" size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search"
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Feather name="x-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <XMTPStatus isInitializing={isInitializing} error={error} retryCount={retryCount} onRetry={retry} />
      
      <FlatList
        data={combinedChats}
        keyExtractor={(item) => item.type === "xmtp" ? `xmtp-${item.data.id}` : `legacy-${item.data.id}`}
        renderItem={renderChatItem}
        contentContainerStyle={[
          styles.listContent,
          {
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

      <NewMessageScreen
        visible={showNewMessage}
        onClose={() => setShowNewMessage(false)}
        onStartChat={handleStartChat}
        onNewGroup={() => navigation.navigate("CreateGroup")}
        deviceContacts={deviceContacts}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.xs,
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
    flexDirection: "column",
    gap: Spacing.xs,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  retryButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignSelf: "center",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  statusText: {
    fontSize: 13,
    flex: 1,
  },
});
