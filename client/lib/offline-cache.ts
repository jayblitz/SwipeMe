import AsyncStorage from "@react-native-async-storage/async-storage";
import { Message, Chat, getMessages, getChats } from "./storage";

const PENDING_MESSAGES_KEY = "@swipeme_pending_messages";
const LAST_SYNC_KEY = "@swipeme_last_sync";
const CACHE_VERSION_KEY = "@swipeme_cache_version";

export interface PendingMessage {
  id: string;
  chatId: string;
  content: string;
  type: "text" | "payment";
  createdAt: number;
  retryCount: number;
  paymentData?: {
    amount: number;
    token: string;
    recipientAddress: string;
  };
}

export interface SyncStatus {
  isOnline: boolean;
  lastSyncTime: number | null;
  pendingCount: number;
  isSyncing: boolean;
}

let currentSyncStatus: SyncStatus = {
  isOnline: true,
  lastSyncTime: null,
  pendingCount: 0,
  isSyncing: false,
};

const syncListeners: Set<(status: SyncStatus) => void> = new Set();

export function subscribeSyncStatus(callback: (status: SyncStatus) => void): () => void {
  syncListeners.add(callback);
  callback(currentSyncStatus);
  return () => syncListeners.delete(callback);
}

function notifySyncListeners() {
  syncListeners.forEach(cb => cb(currentSyncStatus));
}

export function updateOnlineStatus(isOnline: boolean) {
  if (currentSyncStatus.isOnline !== isOnline) {
    currentSyncStatus = { ...currentSyncStatus, isOnline };
    notifySyncListeners();
  }
}

export async function addPendingMessage(message: PendingMessage): Promise<void> {
  try {
    const pending = await getPendingMessages();
    pending.push(message);
    await AsyncStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(pending));
    currentSyncStatus = { ...currentSyncStatus, pendingCount: pending.length };
    notifySyncListeners();
  } catch (error) {
    console.error("Failed to add pending message:", error);
  }
}

export async function getPendingMessages(): Promise<PendingMessage[]> {
  try {
    const data = await AsyncStorage.getItem(PENDING_MESSAGES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to get pending messages:", error);
    return [];
  }
}

export async function removePendingMessage(messageId: string): Promise<void> {
  try {
    const pending = await getPendingMessages();
    const filtered = pending.filter(m => m.id !== messageId);
    await AsyncStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(filtered));
    currentSyncStatus = { ...currentSyncStatus, pendingCount: filtered.length };
    notifySyncListeners();
  } catch (error) {
    console.error("Failed to remove pending message:", error);
  }
}

export async function clearPendingMessages(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_MESSAGES_KEY);
    currentSyncStatus = { ...currentSyncStatus, pendingCount: 0 };
    notifySyncListeners();
  } catch (error) {
    console.error("Failed to clear pending messages:", error);
  }
}

export async function updateLastSyncTime(): Promise<void> {
  const now = Date.now();
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
    currentSyncStatus = { ...currentSyncStatus, lastSyncTime: now };
    notifySyncListeners();
  } catch (error) {
    console.error("Failed to update last sync time:", error);
  }
}

export async function getLastSyncTime(): Promise<number | null> {
  try {
    const time = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return time ? parseInt(time, 10) : null;
  } catch (error) {
    console.error("Failed to get last sync time:", error);
    return null;
  }
}

export async function initializeOfflineCache(): Promise<void> {
  try {
    const pending = await getPendingMessages();
    const lastSync = await getLastSyncTime();
    currentSyncStatus = {
      ...currentSyncStatus,
      pendingCount: pending.length,
      lastSyncTime: lastSync,
    };
    notifySyncListeners();
  } catch (error) {
    console.error("Failed to initialize offline cache:", error);
  }
}

export async function cacheMessages(chatId: string, messages: Message[]): Promise<void> {
  try {
    const existingMessages = await getMessages(chatId);
    const messageMap = new Map<string, Message>();
    
    existingMessages.forEach(m => messageMap.set(m.id, m));
    messages.forEach(m => messageMap.set(m.id, m));
    
    const merged = Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    const allMessagesData = await AsyncStorage.getItem("@swipeme_messages");
    const allMessages = allMessagesData ? JSON.parse(allMessagesData) : {};
    allMessages[chatId] = merged;
    await AsyncStorage.setItem("@swipeme_messages", JSON.stringify(allMessages));
  } catch (error) {
    console.error("Failed to cache messages:", error);
  }
}

export async function getCachedMessages(chatId: string): Promise<Message[]> {
  return getMessages(chatId);
}

export async function cacheChat(chat: Chat): Promise<void> {
  try {
    const chats = await getChats();
    const index = chats.findIndex(c => c.id === chat.id);
    
    if (index >= 0) {
      chats[index] = chat;
    } else {
      chats.push(chat);
    }
    
    await AsyncStorage.setItem("@swipeme_chats", JSON.stringify(chats));
  } catch (error) {
    console.error("Failed to cache chat:", error);
  }
}

export async function getCachedChats(): Promise<Chat[]> {
  return getChats();
}

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function setSyncing(isSyncing: boolean) {
  if (currentSyncStatus.isSyncing !== isSyncing) {
    currentSyncStatus = { ...currentSyncStatus, isSyncing };
    notifySyncListeners();
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      PENDING_MESSAGES_KEY,
      LAST_SYNC_KEY,
    ]);
    currentSyncStatus = {
      isOnline: true,
      lastSyncTime: null,
      pendingCount: 0,
      isSyncing: false,
    };
    notifySyncListeners();
  } catch (error) {
    console.error("Failed to clear cache:", error);
  }
}
