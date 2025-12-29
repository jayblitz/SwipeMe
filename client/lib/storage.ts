import AsyncStorage from "@react-native-async-storage/async-storage";

const CHATS_KEY = "@swipeme_chats";
const MESSAGES_KEY = "@swipeme_messages";
const TRANSACTIONS_KEY = "@swipeme_transactions";
const BALANCE_KEY = "@swipeme_balance";
const CONTACTS_KEY = "@swipeme_contacts";
const STORAGE_VERSION_KEY = "@swipeme_storage_version";
const CURRENT_STORAGE_VERSION = "2";

export interface Contact {
  id: string;
  name: string;
  username?: string;
  avatarId?: string;
  walletAddress?: string;
  phone?: string;
}

export type DisappearingTimer = "24h" | "7d" | "30d" | null;

export interface Chat {
  id: string;
  participants: Contact[];
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  isGroup: boolean;
  name?: string;
  disappearingMessagesTimer?: DisappearingTimer; // null = off, "24h" = 24 hours, "7d" = 7 days, "30d" = 30 days
}

export type MessageType = "text" | "payment" | "image" | "location" | "contact" | "document" | "audio" | "system";

export interface ImageAttachment {
  uri: string;
  width?: number;
  height?: number;
}

export interface LocationAttachment {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface ContactAttachment {
  name: string;
  phoneNumber?: string;
  email?: string;
}

export interface DocumentAttachment {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface AudioAttachment {
  uri: string;
  duration: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  timestamp: number;
  type: MessageType;
  paymentAmount?: number;
  paymentMemo?: string;
  paymentStatus?: "pending" | "completed" | "failed";
  paymentTxHash?: string;
  paymentExplorerUrl?: string;
  imageAttachment?: ImageAttachment;
  locationAttachment?: LocationAttachment;
  contactAttachment?: ContactAttachment;
  documentAttachment?: DocumentAttachment;
  audioAttachment?: AudioAttachment;
  expiresAt?: number; // Timestamp when message should be deleted (for disappearing messages)
}

export interface Transaction {
  id: string;
  type: "sent" | "received" | "deposit";
  amount: number;
  contactId?: string;
  contactName?: string;
  contactAvatarId?: string;
  memo: string;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  txHash?: string;
}

export function getContactWalletAddress(contactId: string): string | null {
  return null;
}

export async function initializeStorage(): Promise<void> {
  try {
    const storedVersion = await AsyncStorage.getItem(STORAGE_VERSION_KEY);
    
    if (storedVersion !== CURRENT_STORAGE_VERSION) {
      await AsyncStorage.multiRemove([
        CHATS_KEY,
        MESSAGES_KEY,
        TRANSACTIONS_KEY,
        BALANCE_KEY,
        CONTACTS_KEY,
      ]);
      await AsyncStorage.setItem(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
    }
  } catch (error) {
    console.error("Failed to initialize storage:", error);
  }
}

export function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function getChats(): Promise<Chat[]> {
  try {
    const chats = await AsyncStorage.getItem(CHATS_KEY);
    return chats ? JSON.parse(chats) : [];
  } catch (error) {
    console.error("Failed to get chats:", error);
    return [];
  }
}

export async function saveChat(chat: Chat): Promise<void> {
  try {
    const chats = await getChats();
    const existingIndex = chats.findIndex(c => c.id === chat.id);
    if (existingIndex !== -1) {
      chats[existingIndex] = chat;
    } else {
      chats.push(chat);
    }
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch (error) {
    console.error("Failed to save chat:", error);
  }
}

export async function getMessages(chatId: string): Promise<Message[]> {
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    return allMessages[chatId] || [];
  } catch (error) {
    console.error("Failed to get messages:", error);
    return [];
  }
}

export async function sendMessage(chatId: string, content: string, senderId: string = "me"): Promise<Message> {
  // Get the chat's disappearing messages timer
  const chats = await getChats();
  const chat = chats.find(c => c.id === chatId);
  const timer = chat?.disappearingMessagesTimer;
  
  const now = Date.now();
  const newMessage: Message = {
    id: `m${now}`,
    chatId,
    senderId,
    content,
    timestamp: now,
    type: "text",
    expiresAt: timer ? now + getTimerDuration(timer) : undefined,
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(newMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = content;
      chats[chatIndex].lastMessageTime = now;
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    }
  } catch (error) {
    console.error("Failed to send message:", error);
  }
  
  return newMessage;
}

export interface AttachmentOptions {
  image?: ImageAttachment;
  location?: LocationAttachment;
  contact?: ContactAttachment;
  document?: DocumentAttachment;
}

export async function sendAttachmentMessage(
  chatId: string,
  type: "image" | "location" | "contact" | "document",
  attachment: AttachmentOptions,
  senderId: string = "me"
): Promise<Message> {
  // Get chat timer for disappearing messages
  const chats = await getChats();
  const chat = chats.find(c => c.id === chatId);
  const timer = chat?.disappearingMessagesTimer;
  
  let content = "";
  let lastMessagePreview = "";
  
  switch (type) {
    case "image":
      content = "Photo";
      lastMessagePreview = "Sent a photo";
      break;
    case "location":
      content = attachment.location?.address || "Shared location";
      lastMessagePreview = "Shared a location";
      break;
    case "contact":
      content = attachment.contact?.name || "Shared contact";
      lastMessagePreview = `Shared contact: ${attachment.contact?.name}`;
      break;
    case "document":
      content = attachment.document?.name || "Document";
      lastMessagePreview = `Sent a document: ${attachment.document?.name}`;
      break;
  }
  
  const now = Date.now();
  const newMessage: Message = {
    id: `m${now}`,
    chatId,
    senderId,
    content,
    timestamp: now,
    type,
    imageAttachment: attachment.image,
    locationAttachment: attachment.location,
    contactAttachment: attachment.contact,
    documentAttachment: attachment.document,
    expiresAt: timer ? now + getTimerDuration(timer) : undefined,
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(newMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = lastMessagePreview;
      chats[chatIndex].lastMessageTime = now;
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    }
  } catch (error) {
    console.error("Failed to send attachment message:", error);
  }
  
  return newMessage;
}

export async function sendAudioMessage(
  chatId: string,
  audioUri: string,
  duration: number,
  senderId: string = "me"
): Promise<Message> {
  // Get chat timer for disappearing messages
  const chats = await getChats();
  const chat = chats.find(c => c.id === chatId);
  const timer = chat?.disappearingMessagesTimer;
  
  const durationSeconds = Math.round(duration);
  const durationFormatted = `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, '0')}`;
  
  const now = Date.now();
  const newMessage: Message = {
    id: `m${now}`,
    chatId,
    senderId,
    content: `Voice message (${durationFormatted})`,
    timestamp: now,
    type: "audio",
    audioAttachment: {
      uri: audioUri,
      duration,
    },
    expiresAt: timer ? now + getTimerDuration(timer) : undefined,
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(newMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = "Sent a voice message";
      chats[chatIndex].lastMessageTime = now;
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    }
  } catch (error) {
    console.error("Failed to send audio message:", error);
  }
  
  return newMessage;
}

export async function sendPayment(
  chatId: string,
  amount: number,
  memo: string,
  recipientId: string,
  recipientName: string,
  recipientAvatarId: string,
  txHash?: string,
  explorerUrl?: string
): Promise<{ message: Message; transaction: Transaction }> {
  // Get chat timer for disappearing messages
  const chats = await getChats();
  const chat = chats.find(c => c.id === chatId);
  const timer = chat?.disappearingMessagesTimer;
  
  const now = Date.now();
  const paymentMessage: Message = {
    id: `m${now}`,
    chatId,
    senderId: "me",
    content: `$${amount.toFixed(2)}`,
    timestamp: now,
    type: "payment",
    paymentAmount: amount,
    paymentMemo: memo,
    paymentStatus: "completed",
    paymentTxHash: txHash,
    paymentExplorerUrl: explorerUrl,
    expiresAt: timer ? now + getTimerDuration(timer) : undefined,
  };
  
  const transaction: Transaction = {
    id: `t${now}`,
    type: "sent",
    amount,
    contactId: recipientId,
    contactName: recipientName,
    contactAvatarId: recipientAvatarId,
    memo,
    timestamp: now,
    status: "completed",
    txHash,
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(paymentMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    
    const transactions = await getTransactions();
    transactions.unshift(transaction);
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    
    const balance = await getBalance();
    await AsyncStorage.setItem(BALANCE_KEY, JSON.stringify(balance - amount));
    
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = `Swiped $${amount.toFixed(2)}`;
      chats[chatIndex].lastMessageTime = now;
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    }
  } catch (error) {
    console.error("Failed to send payment:", error);
  }
  
  return { message: paymentMessage, transaction };
}

export async function getTransactions(): Promise<Transaction[]> {
  try {
    const transactions = await AsyncStorage.getItem(TRANSACTIONS_KEY);
    return transactions ? JSON.parse(transactions) : [];
  } catch (error) {
    console.error("Failed to get transactions:", error);
    return [];
  }
}

export async function getBalance(): Promise<number> {
  try {
    const balance = await AsyncStorage.getItem(BALANCE_KEY);
    return balance ? JSON.parse(balance) : 0;
  } catch (error) {
    console.error("Failed to get balance:", error);
    return 0;
  }
}

export async function addFunds(amount: number): Promise<void> {
  try {
    const currentBalance = await getBalance();
    await AsyncStorage.setItem(BALANCE_KEY, JSON.stringify(currentBalance + amount));
    
    const transaction: Transaction = {
      id: `t${Date.now()}`,
      type: "deposit",
      amount,
      memo: "Added funds via card",
      timestamp: Date.now(),
      status: "completed",
    };
    
    const transactions = await getTransactions();
    transactions.unshift(transaction);
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  } catch (error) {
    console.error("Failed to add funds:", error);
  }
}

export async function getContacts(): Promise<Contact[]> {
  try {
    const contacts = await AsyncStorage.getItem(CONTACTS_KEY);
    return contacts ? JSON.parse(contacts) : [];
  } catch (error) {
    console.error("Failed to get contacts:", error);
    return [];
  }
}

export async function createChat(contact: Contact): Promise<Chat> {
  const newChat: Chat = {
    id: `chat${Date.now()}`,
    participants: [contact],
    lastMessage: "",
    lastMessageTime: Date.now(),
    unreadCount: 0,
    isGroup: false,
  };
  
  try {
    const chats = await getChats();
    const existingChat = chats.find(c => 
      !c.isGroup && c.participants.some(p => p.id === contact.id)
    );
    
    if (existingChat) {
      return existingChat;
    }
    
    chats.unshift(newChat);
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch (error) {
    console.error("Failed to create chat:", error);
  }
  
  return newChat;
}

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      CHATS_KEY,
      MESSAGES_KEY,
      TRANSACTIONS_KEY,
      BALANCE_KEY,
      CONTACTS_KEY,
    ]);
  } catch (error) {
    console.error("Failed to clear data:", error);
  }
}

const CHAT_BACKGROUNDS_KEY = "@swipeme_chat_backgrounds";

export interface ChatBackground {
  type: "color" | "image" | "preset";
  value: string;
}

export const PRESET_BACKGROUNDS = [
  { id: "default", type: "color" as const, value: "transparent", label: "Default" },
  { id: "dark-gradient", type: "color" as const, value: "#0B141A", label: "Dark" },
  { id: "light-pattern", type: "color" as const, value: "#ECE5DD", label: "Light" },
  { id: "teal", type: "color" as const, value: "#075E54", label: "Teal" },
  { id: "navy", type: "color" as const, value: "#1A2238", label: "Navy" },
  { id: "forest", type: "color" as const, value: "#1D3C34", label: "Forest" },
  { id: "burgundy", type: "color" as const, value: "#3D1C2A", label: "Burgundy" },
  { id: "slate", type: "color" as const, value: "#2F3640", label: "Slate" },
];

export async function getChatBackground(chatId: string): Promise<ChatBackground | null> {
  try {
    const data = await AsyncStorage.getItem(CHAT_BACKGROUNDS_KEY);
    if (data) {
      const backgrounds: Record<string, ChatBackground> = JSON.parse(data);
      return backgrounds[chatId] || null;
    }
  } catch (error) {
    console.error("Failed to get chat background:", error);
  }
  return null;
}

export async function setChatBackground(chatId: string, background: ChatBackground | null): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(CHAT_BACKGROUNDS_KEY);
    const backgrounds: Record<string, ChatBackground> = data ? JSON.parse(data) : {};
    
    if (background === null || background.value === "transparent") {
      delete backgrounds[chatId];
    } else {
      backgrounds[chatId] = background;
    }
    
    await AsyncStorage.setItem(CHAT_BACKGROUNDS_KEY, JSON.stringify(backgrounds));
  } catch (error) {
    console.error("Failed to set chat background:", error);
  }
}

// Disappearing Messages Functions

export function getTimerDuration(timer: DisappearingTimer): number {
  switch (timer) {
    case "24h":
      return 24 * 60 * 60 * 1000; // 24 hours in ms
    case "7d":
      return 7 * 24 * 60 * 60 * 1000; // 7 days in ms
    case "30d":
      return 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    default:
      return 0;
  }
}

export function getTimerLabel(timer: DisappearingTimer): string {
  switch (timer) {
    case "24h":
      return "24 hours";
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
    default:
      return "Off";
  }
}

export async function setChatDisappearingTimer(chatId: string, timer: DisappearingTimer): Promise<void> {
  try {
    const chats = await getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      const oldTimer = chats[chatIndex].disappearingMessagesTimer;
      chats[chatIndex].disappearingMessagesTimer = timer;
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
      
      if (oldTimer !== timer) {
        const content = timer 
          ? `You turned on disappearing messages. New messages will disappear from this chat ${getTimerLabel(timer).toLowerCase()} after they're sent.`
          : "You turned off disappearing messages.";
        await sendSystemMessage(chatId, content);
      }
    }
  } catch (error) {
    console.error("Failed to set disappearing timer:", error);
  }
}

export async function sendSystemMessage(chatId: string, content: string): Promise<Message> {
  const now = Date.now();
  const newMessage: Message = {
    id: `sys${now}`,
    chatId,
    senderId: "system",
    content,
    timestamp: now,
    type: "system",
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(newMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
  } catch (error) {
    console.error("Failed to send system message:", error);
  }
  
  return newMessage;
}

export async function getChatDisappearingTimer(chatId: string): Promise<DisappearingTimer> {
  try {
    const chats = await getChats();
    const chat = chats.find(c => c.id === chatId);
    return chat?.disappearingMessagesTimer || null;
  } catch (error) {
    console.error("Failed to get disappearing timer:", error);
    return null;
  }
}

export async function cleanupExpiredMessages(): Promise<number> {
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages: Record<string, Message[]> = messages ? JSON.parse(messages) : {};
    const now = Date.now();
    let deletedCount = 0;
    const affectedChatIds: string[] = [];
    
    for (const chatId in allMessages) {
      const originalLength = allMessages[chatId].length;
      allMessages[chatId] = allMessages[chatId].filter(msg => {
        if (msg.expiresAt && msg.expiresAt <= now) {
          return false; // Remove expired message
        }
        return true;
      });
      const deleted = originalLength - allMessages[chatId].length;
      if (deleted > 0) {
        affectedChatIds.push(chatId);
        deletedCount += deleted;
      }
    }
    
    if (deletedCount > 0) {
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
      
      // Update chat metadata for affected chats
      const chats = await getChats();
      let chatsUpdated = false;
      
      for (const chatId of affectedChatIds) {
        const chatIndex = chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          const chatMessages = allMessages[chatId] || [];
          if (chatMessages.length > 0) {
            // Get the most recent message for last message preview
            const sortedMessages = [...chatMessages].sort((a, b) => b.timestamp - a.timestamp);
            const latestMessage = sortedMessages[0];
            chats[chatIndex].lastMessage = getMessagePreview(latestMessage);
            chats[chatIndex].lastMessageTime = latestMessage.timestamp;
          } else {
            // No messages left - use 0 to sort to bottom
            chats[chatIndex].lastMessage = "";
            chats[chatIndex].lastMessageTime = 0;
          }
          chatsUpdated = true;
        }
      }
      
      if (chatsUpdated) {
        await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(chats));
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error("Failed to cleanup expired messages:", error);
    return 0;
  }
}

function getMessagePreview(message: Message): string {
  switch (message.type) {
    case "image":
      return "Sent a photo";
    case "location":
      return "Shared a location";
    case "contact":
      return `Shared contact: ${message.contactAttachment?.name || "Contact"}`;
    case "document":
      return `Sent a document: ${message.documentAttachment?.name || "Document"}`;
    case "audio":
      return "Sent a voice message";
    case "payment":
      return `Swiped $${message.paymentAmount?.toFixed(2) || "0.00"}`;
    default:
      return message.content || "";
  }
}
