import { Client, Conversation, DecodedMessage, PublicIdentity, type Signer } from "@xmtp/react-native-sdk";
import { Platform } from "react-native";
import { apiRequest } from "./query-client";
import * as SecureStore from "expo-secure-store";

export type XMTPClient = Client;
export type XMTPConversation = Conversation;
export type XMTPMessage = DecodedMessage;

const XMTP_DB_KEY_STORAGE = "xmtp_db_encryption_key";

async function getOrCreateDbEncryptionKey(): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return randomBytes;
  }

  let storedKey = await SecureStore.getItemAsync(XMTP_DB_KEY_STORAGE);
  
  if (!storedKey) {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    storedKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(XMTP_DB_KEY_STORAGE, storedKey);
  }
  
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(storedKey.substr(i * 2, 2), 16);
  }
  return keyBytes;
}

export function createRemoteSigner(userId: string, walletAddress: string): Signer {
  return {
    getIdentifier: async () => new PublicIdentity(walletAddress as `0x${string}`, "ETHEREUM"),
    getChainId: () => undefined,
    getBlockNumber: () => undefined,
    signerType: () => "EOA",
    signMessage: async (message: string) => {
      const response = await apiRequest("POST", `/api/wallet/${userId}/sign`, { message });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to sign message");
      }
      return { signature: data.signature };
    },
  };
}

let xmtpClient: Client | null = null;

export async function initializeXMTPClient(
  userId: string,
  walletAddress: string
): Promise<Client> {
  if (Platform.OS === "web") {
    throw new Error("XMTP is not supported on web. Please use the mobile app.");
  }

  if (xmtpClient) {
    return xmtpClient;
  }

  const signer = createRemoteSigner(userId, walletAddress);
  const dbEncryptionKey = await getOrCreateDbEncryptionKey();
  
  xmtpClient = await Client.create(signer, {
    env: "dev",
    dbEncryptionKey,
  });

  return xmtpClient;
}

export function getXMTPClient(): Client | null {
  return xmtpClient;
}

export async function disconnectXMTP(): Promise<void> {
  xmtpClient = null;
}

export async function getConversations(): Promise<Conversation[]> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const conversations = await xmtpClient.conversations.list();
  return conversations;
}

export async function getOrCreateConversation(peerAddress: string): Promise<Conversation> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const conversation = await xmtpClient.conversations.newConversation(peerAddress);
  return conversation;
}

export async function sendXMTPMessage(conversation: Conversation, content: string): Promise<void> {
  await conversation.send(content);
}

export async function getMessages(conversation: Conversation): Promise<DecodedMessage[]> {
  const messages = await conversation.messages();
  return messages;
}

export async function canMessage(peerAddress: string): Promise<boolean> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const peerIdentity = new PublicIdentity(peerAddress as `0x${string}`, "ETHEREUM");
  const result = await xmtpClient.canMessage([peerIdentity]);
  return Object.values(result)[0] ?? false;
}

export function isXMTPSupported(): boolean {
  return Platform.OS !== "web";
}
