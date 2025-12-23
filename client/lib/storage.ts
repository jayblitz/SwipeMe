import AsyncStorage from "@react-native-async-storage/async-storage";

const CHATS_KEY = "@tempochat_chats";
const MESSAGES_KEY = "@tempochat_messages";
const TRANSACTIONS_KEY = "@tempochat_transactions";
const BALANCE_KEY = "@tempochat_balance";
const CONTACTS_KEY = "@tempochat_contacts";
const STORAGE_VERSION_KEY = "@tempochat_storage_version";
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

const defaultContacts: Contact[] = [
  { id: "c1", name: "Alex Chen", avatarId: "teal", walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f5bE21", phone: "+1 555-0101" },
  { id: "c2", name: "Sarah Kim", avatarId: "coral", walletAddress: "0x7Af7924ff5f418DB293A4452062757BB4510A9dc", phone: "+1 555-0102" },
  { id: "c3", name: "Mike Johnson", avatarId: "purple", walletAddress: "0x2932b7A2355D6fecc4b5c0B6BD44cC31df247a2e", phone: "+1 555-0103" },
  { id: "c4", name: "Emma Davis", avatarId: "amber", walletAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", phone: "+1 555-0104" },
  { id: "c5", name: "James Wilson", avatarId: "ocean", walletAddress: "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a", phone: "+1 555-0105" },
];

const defaultChats: Chat[] = [
  {
    id: "chat1",
    participants: [defaultContacts[0]],
    lastMessage: "Thanks for the payment!",
    lastMessageTime: Date.now() - 1000 * 60 * 5,
    unreadCount: 2,
    isGroup: false,
  },
  {
    id: "chat2",
    participants: [defaultContacts[1]],
    lastMessage: "Let me know when you're free",
    lastMessageTime: Date.now() - 1000 * 60 * 30,
    unreadCount: 0,
    isGroup: false,
  },
  {
    id: "chat3",
    participants: [defaultContacts[2]],
    lastMessage: "Payment received - $25.00",
    lastMessageTime: Date.now() - 1000 * 60 * 60 * 2,
    unreadCount: 1,
    isGroup: false,
  },
];

const defaultMessages: Record<string, Message[]> = {
  chat1: [
    { id: "m1", chatId: "chat1", senderId: "c1", content: "Hey! Can you send me the money for lunch?", timestamp: Date.now() - 1000 * 60 * 10, type: "text" },
    { id: "m2", chatId: "chat1", senderId: "me", content: "Sure, sending now!", timestamp: Date.now() - 1000 * 60 * 8, type: "text" },
    { id: "m3", chatId: "chat1", senderId: "me", content: "$15.00", timestamp: Date.now() - 1000 * 60 * 7, type: "payment", paymentAmount: 15.00, paymentMemo: "Lunch", paymentStatus: "completed" },
    { id: "m4", chatId: "chat1", senderId: "c1", content: "Thanks for the payment!", timestamp: Date.now() - 1000 * 60 * 5, type: "text" },
  ],
  chat2: [
    { id: "m5", chatId: "chat2", senderId: "me", content: "Hi Sarah!", timestamp: Date.now() - 1000 * 60 * 60, type: "text" },
    { id: "m6", chatId: "chat2", senderId: "c2", content: "Hey! How are you?", timestamp: Date.now() - 1000 * 60 * 45, type: "text" },
    { id: "m7", chatId: "chat2", senderId: "me", content: "Good! Want to grab coffee?", timestamp: Date.now() - 1000 * 60 * 35, type: "text" },
    { id: "m8", chatId: "chat2", senderId: "c2", content: "Let me know when you're free", timestamp: Date.now() - 1000 * 60 * 30, type: "text" },
  ],
  chat3: [
    { id: "m9", chatId: "chat3", senderId: "c3", content: "Here's the money I owe you", timestamp: Date.now() - 1000 * 60 * 60 * 2.5, type: "text" },
    { id: "m10", chatId: "chat3", senderId: "c3", content: "$25.00", timestamp: Date.now() - 1000 * 60 * 60 * 2, type: "payment", paymentAmount: 25.00, paymentMemo: "Dinner split", paymentStatus: "completed" },
  ],
};

const defaultTransactions: Transaction[] = [
  { id: "t1", type: "received", amount: 25.00, contactId: "c3", contactName: "Mike Johnson", contactAvatarId: "purple", memo: "Dinner split", timestamp: Date.now() - 1000 * 60 * 60 * 2, status: "completed" },
  { id: "t2", type: "sent", amount: 15.00, contactId: "c1", contactName: "Alex Chen", contactAvatarId: "teal", memo: "Lunch", timestamp: Date.now() - 1000 * 60 * 7, status: "completed" },
  { id: "t3", type: "deposit", amount: 100.00, memo: "Added funds via card", timestamp: Date.now() - 1000 * 60 * 60 * 24, status: "completed" },
];

export function getContactWalletAddress(contactId: string): string | null {
  const contact = defaultContacts.find(c => c.id === contactId);
  return contact?.walletAddress || null;
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
    
    const existingChats = await AsyncStorage.getItem(CHATS_KEY);
    if (!existingChats) {
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(defaultChats));
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(defaultMessages));
      await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(defaultTransactions));
      await AsyncStorage.setItem(BALANCE_KEY, JSON.stringify(110.00));
      await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(defaultContacts));
    }
  } catch (error) {
    console.error("Failed to initialize storage:", error);
  }
}

export async function getChats(): Promise<Chat[]> {
  try {
    const chats = await AsyncStorage.getItem(CHATS_KEY);
    return chats ? JSON.parse(chats) : defaultChats;
  } catch (error) {
    console.error("Failed to get chats:", error);
    return defaultChats;
  }
}

export async function getMessages(chatId: string): Promise<Message[]> {
  try {
    const messages = await AsyncStorage.getItem(MESSAGES_KEY);
    const allMessages = messages ? JSON.parse(messages) : defaultMessages;
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
    return transactions ? JSON.parse(transactions) : defaultTransactions;
  } catch (error) {
    console.error("Failed to get transactions:", error);
    return defaultTransactions;
  }
}

export async function getBalance(): Promise<number> {
  try {
    const balance = await AsyncStorage.getItem(BALANCE_KEY);
    return balance ? JSON.parse(balance) : 110.00;
  } catch (error) {
    console.error("Failed to get balance:", error);
    return 110.00;
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
    return contacts ? JSON.parse(contacts) : defaultContacts;
  } catch (error) {
    console.error("Failed to get contacts:", error);
    return defaultContacts;
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
