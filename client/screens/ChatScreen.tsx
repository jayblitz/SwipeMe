import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { View, StyleSheet, FlatList, TextInput, Pressable, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import { useHeaderHeight, HeaderButton } from "@react-navigation/elements";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getMessages, sendMessage, sendPayment, getChats, getBalance, Message, Chat } from "@/lib/storage";
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
            styles.attachmentSheet, 
            { 
              backgroundColor: theme.backgroundRoot,
              paddingBottom: insets.bottom + Spacing.lg,
            }
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.attachmentHandle} />
          <View style={styles.attachmentGrid}>
            {attachmentOptions.map((option) => (
              <Pressable
                key={option.id}
                style={styles.attachmentItem}
                onPress={() => {
                  onSelectOption(option.id);
                  onClose();
                }}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
}

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
  onSend: (amount: number, memo: string) => void;
  recipientName: string;
  recipientAvatar: string;
  balance: number;
  sending: boolean;
}

function PaymentModal({ visible, onClose, onSend, recipientName, recipientAvatar, balance, sending }: PaymentModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  const handleSend = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }
    if (numAmount > balance) {
      Alert.alert("Error", "Insufficient balance");
      return;
    }
    onSend(numAmount, memo);
    setAmount("");
    setMemo("");
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

          <View style={styles.balanceRow}>
            <ThemedText style={{ color: theme.textSecondary }}>Available balance:</ThemedText>
            <ThemedText style={{ fontWeight: "600" }}>${balance.toFixed(2)}</ThemedText>
          </View>

          <Button 
            onPress={handleSend} 
            disabled={sending || !amount}
            style={styles.sendButton}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              `Send ${amount ? `$${parseFloat(amount || "0").toFixed(2)}` : ""}`
            )}
          </Button>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<RouteProp<ChatsStackParamList, "Chat">>();
  const navigation = useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const { chatId, name } = route.params;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const [balance, setBalance] = useState(0);
  const [chat, setChat] = useState<Chat | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton onPress={() => setShowPayment(true)}>
          <Feather name="dollar-sign" size={20} color={theme.primary} />
        </HeaderButton>
      ),
    });
  }, [navigation, theme]);

  const loadData = useCallback(async () => {
    const [loadedMessages, loadedBalance, loadedChats] = await Promise.all([
      getMessages(chatId),
      getBalance(),
      getChats(),
    ]);
    setMessages(loadedMessages.sort((a, b) => b.timestamp - a.timestamp));
    setBalance(loadedBalance);
    const currentChat = loadedChats.find(c => c.id === chatId);
    if (currentChat) setChat(currentChat);
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const newMessage = await sendMessage(chatId, inputText.trim());
    setMessages(prev => [newMessage, ...prev]);
    setInputText("");
  };

  const handleSendPayment = async (amount: number, memo: string) => {
    if (!chat) return;
    setSending(true);
    
    try {
      const participant = chat.participants[0];
      const { message } = await sendPayment(
        chatId,
        amount,
        memo || "Payment",
        participant.id,
        participant.name,
        participant.avatarId
      );
      setMessages(prev => [message, ...prev]);
      setBalance(prev => prev - amount);
      setShowPayment(false);
    } catch (error) {
      Alert.alert("Error", "Failed to send payment");
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
    }
    return false;
  };

  const handleAttachmentOption = async (optionId: string) => {
    switch (optionId) {
      case "photos":
        const hasMediaPermission = await requestMediaLibraryPermission();
        if (!hasMediaPermission) return;
        
        const photoResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
        });
        if (!photoResult.canceled) {
          Alert.alert("Photo Selected", "Photo sharing coming soon!");
        }
        break;
      case "camera":
        const hasCameraPermission = await requestCameraPermission();
        if (!hasCameraPermission) return;
        
        const cameraResult = await ImagePicker.launchCameraAsync({
          quality: 0.8,
        });
        if (!cameraResult.canceled) {
          Alert.alert("Photo Captured", "Photo sharing coming soon!");
        }
        break;
      case "location":
        Alert.alert("Location", "Location sharing coming soon!");
        break;
      case "contact":
        Alert.alert("Contact", "Contact sharing coming soon!");
        break;
      case "document":
        Alert.alert("Document", "Document sharing coming soon!");
        break;
    }
  };

  const participant = chat?.participants[0];

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwnMessage={item.senderId === "me"} />
          )}
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

      {participant ? (
        <PaymentModal
          visible={showPayment}
          onClose={() => setShowPayment(false)}
          onSend={handleSendPayment}
          recipientName={participant.name}
          recipientAvatar={participant.avatarId}
          balance={balance}
          sending={sending}
        />
      ) : null}

      <AttachmentsModal
        visible={showAttachments}
        onClose={() => setShowAttachments(false)}
        onSelectOption={handleAttachmentOption}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
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
});
