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
  avatarId: string;
  walletAddress: string;
  phone?: string;
}

export interface Chat {
  id: string;
  participants: Contact[];
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  isGroup: boolean;
  name?: string;
}

export type MessageType = "text" | "payment" | "image" | "location" | "contact" | "document" | "audio";

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
  imageAttachment?: ImageAttachment;
  locationAttachment?: LocationAttachment;
  contactAttachment?: ContactAttachment;
  documentAttachment?: DocumentAttachment;
  audioAttachment?: AudioAttachment;
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

export async function getChats(): Promise<Chat[]> {
  try {
    const chats = await AsyncStorage.getItem(CHATS_KEY);
    return chats ? JSON.parse(chats) : [];
  } catch (error) {
    console.error("Failed to get chats:", error);
    return [];
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
  const newMessage: Message = {
    id: `m${Date.now()}`,
    chatId,
    senderId,
    content,
    timestamp: Date.now(),
    type: "text",
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(newMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    
    const chats = await getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = content;
      chats[chatIndex].lastMessageTime = Date.now();
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
  
  const newMessage: Message = {
    id: `m${Date.now()}`,
    chatId,
    senderId,
    content,
    timestamp: Date.now(),
    type,
    imageAttachment: attachment.image,
    locationAttachment: attachment.location,
    contactAttachment: attachment.contact,
    documentAttachment: attachment.document,
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(newMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    
    const chats = await getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = lastMessagePreview;
      chats[chatIndex].lastMessageTime = Date.now();
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
  const durationSeconds = Math.round(duration);
  const durationFormatted = `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, '0')}`;
  
  const newMessage: Message = {
    id: `m${Date.now()}`,
    chatId,
    senderId,
    content: `Voice message (${durationFormatted})`,
    timestamp: Date.now(),
    type: "audio",
    audioAttachment: {
      uri: audioUri,
      duration,
    },
  };
  
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : {};
    if (!allMessages[chatId]) {
      allMessages[chatId] = [];
    }
    allMessages[chatId].push(newMessage);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    
    const chats = await getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = "Sent a voice message";
      chats[chatIndex].lastMessageTime = Date.now();
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
  txHash?: string
): Promise<{ message: Message; transaction: Transaction }> {
  const paymentMessage: Message = {
    id: `m${Date.now()}`,
    chatId,
    senderId: "me",
    content: `$${amount.toFixed(2)}`,
    timestamp: Date.now(),
    type: "payment",
    paymentAmount: amount,
    paymentMemo: memo,
    paymentStatus: "completed",
  };
  
  const transaction: Transaction = {
    id: `t${Date.now()}`,
    type: "sent",
    amount,
    contactId: recipientId,
    contactName: recipientName,
    contactAvatarId: recipientAvatarId,
    memo,
    timestamp: Date.now(),
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
    
    const chats = await getChats();
    const chatIndex = chats.findIndex(c => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].lastMessage = `Payment sent - $${amount.toFixed(2)}`;
      chats[chatIndex].lastMessageTime = Date.now();
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
