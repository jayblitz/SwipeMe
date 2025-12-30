import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AIConversation {
  id: number;
  userId: string | null;
  title: string;
  createdAt: string;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface MessageBubbleProps {
  message: AIMessage;
  isUser: boolean;
}

function MessageBubble({ message, isUser }: MessageBubbleProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
      {!isUser ? (
        <View style={[styles.aiAvatar, { backgroundColor: theme.primary }]}>
          <Feather name="cpu" size={16} color="#FFFFFF" />
        </View>
      ) : null}
      <View
        style={[
          styles.messageBubble,
          isUser
            ? [styles.userBubble, { backgroundColor: theme.sentMessage }]
            : [styles.assistantBubble, { backgroundColor: theme.receivedMessage }],
        ]}
      >
        <ThemedText
          style={[
            styles.messageText,
            { color: isUser ? "#FFFFFF" : theme.text },
          ]}
        >
          {message.content}
        </ThemedText>
        <ThemedText
          style={[
            styles.messageTime,
            { color: isUser ? "rgba(255,255,255,0.7)" : theme.textSecondary },
          ]}
        >
          {formatTime(message.createdAt)}
        </ThemedText>
      </View>
    </View>
  );
}

function TypingIndicator() {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.messageRow, styles.messageRowAssistant]}>
      <View style={[styles.aiAvatar, { backgroundColor: theme.primary }]}>
        <Feather name="cpu" size={16} color="#FFFFFF" />
      </View>
      <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: theme.receivedMessage }]}>
        <View style={styles.typingDots}>
          <View style={[styles.typingDot, { backgroundColor: theme.textSecondary }]} />
          <View style={[styles.typingDot, styles.typingDotMiddle, { backgroundColor: theme.textSecondary }]} />
          <View style={[styles.typingDot, { backgroundColor: theme.textSecondary }]} />
        </View>
      </View>
    </View>
  );
}

function WelcomeMessage() {
  const { theme } = useTheme();

  return (
    <View style={styles.welcomeContainer}>
      <View style={[styles.welcomeAvatar, { backgroundColor: theme.primary }]}>
        <Feather name="cpu" size={40} color="#FFFFFF" />
      </View>
      <ThemedText style={[styles.welcomeTitle, { color: theme.text }]}>
        SwipeMe AI Assistant
      </ThemedText>
      <ThemedText style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
        Powered by Grok
      </ThemedText>
      <ThemedText style={[styles.welcomeDescription, { color: theme.textSecondary }]}>
        Ask me anything about crypto, blockchain, DeFi, or get help with your SwipeMe wallet and payments.
      </ThemedText>
    </View>
  );
}

export function AIAssistantScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    loadOrCreateConversation();
  }, []);

  const loadOrCreateConversation = async () => {
    setIsLoading(true);
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL("/api/ai/conversations", baseUrl).toString(), {
        credentials: "include",
      });
      
      if (response.ok) {
        const conversations: AIConversation[] = await response.json();
        if (conversations.length > 0) {
          const latestConversation = conversations[0];
          setConversationId(latestConversation.id);
          if (latestConversation.accessKey) {
            setAccessKey(latestConversation.accessKey);
          }
          await loadMessages(latestConversation.id, latestConversation.accessKey);
        }
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (convId: number, key?: string) => {
    try {
      const baseUrl = getApiUrl();
      const headers: Record<string, string> = {};
      if (key) {
        headers["x-access-key"] = key;
      }
      
      const response = await fetch(
        new URL(`/api/ai/conversations/${convId}/messages`, baseUrl).toString(),
        { credentials: "include", headers }
      );
      
      if (response.ok) {
        const data: AIMessage[] = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const sendMessage = async () => {
    const messageContent = inputText.trim();
    if (!messageContent || isSending) return;

    setInputText("");
    setIsSending(true);

    const tempUserMessage: AIMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: messageContent,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const baseUrl = getApiUrl();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessKey) {
        headers["x-access-key"] = accessKey;
      }
      
      const response = await fetch(new URL("/api/ai/chat", baseUrl).toString(), {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          message: messageContent,
          conversationId: conversationId,
          accessKey: accessKey,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      let assistantContent = "";
      const tempAssistantId = `temp-assistant-${Date.now()}`;
      
      setMessages((prev) => [
        ...prev,
        {
          id: tempAssistantId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        },
      ]);

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.conversationId && !conversationId) {
                setConversationId(parsed.conversationId);
              }
              
              if (parsed.accessKey && !accessKey) {
                setAccessKey(parsed.accessKey);
              }
              
              if (parsed.content) {
                assistantContent += parsed.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempAssistantId
                      ? { ...msg, content: assistantContent }
                      : msg
                  )
                );
                flatListRef.current?.scrollToEnd({ animated: false });
              }
              
              if (parsed.error) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempAssistantId
                      ? { ...msg, content: parsed.error }
                      : msg
                  )
                );
              }
            } catch {
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setAccessKey(null);
    setMessages([]);
    setInputText("");
  }, []);

  const renderMessage = useCallback(
    ({ item }: { item: AIMessage }) => (
      <MessageBubble message={item} isUser={item.role === "user"} />
    ),
    []
  );

  const keyExtractor = useCallback((item: AIMessage) => item.id, []);

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ThemedView style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.messageList,
            { paddingTop: headerHeight + Spacing.md },
          ]}
          ListEmptyComponent={<WelcomeMessage />}
          ListFooterComponent={isSending ? <TypingIndicator /> : null}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.backgroundRoot,
              paddingBottom: insets.bottom + Spacing.sm,
              borderTopColor: theme.border,
            },
          ]}
        >
          <Pressable
            style={[styles.newChatButton, { backgroundColor: theme.backgroundSecondary }]}
            onPress={startNewConversation}
          >
            <Feather name="plus" size={20} color={theme.primary} />
          </Pressable>
          
          <View style={[styles.inputWrapper, { backgroundColor: theme.backgroundSecondary }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Ask anything..."
              placeholderTextColor={theme.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
              editable={!isSending}
            />
          </View>
          
          <Pressable
            style={[
              styles.sendButton,
              {
                backgroundColor: inputText.trim() && !isSending ? theme.primary : theme.backgroundSecondary,
              },
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isSending}
          >
            <Feather
              name="send"
              size={20}
              color={inputText.trim() && !isSending ? "#FFFFFF" : theme.textSecondary}
            />
          </Pressable>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
    alignItems: "flex-end",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.xs,
  },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.messageBubble,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: 11,
    marginTop: Spacing.xs,
    textAlign: "right",
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 2,
    opacity: 0.6,
  },
  typingDotMiddle: {
    opacity: 0.8,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: 100,
  },
  welcomeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  welcomeSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: Spacing.md,
  },
  welcomeDescription: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  newChatButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    maxHeight: 120,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 24,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: Spacing.sm,
  },
});

export default AIAssistantScreen;
