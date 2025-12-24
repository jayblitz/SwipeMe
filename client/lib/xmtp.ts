import { Client, Dm, DecodedMessage, PublicIdentity, type Signer } from "@xmtp/react-native-sdk";
import { Platform } from "react-native";
import { apiRequest } from "./query-client";
import * as SecureStore from "expo-secure-store";

export type XMTPClient = Client;
export type XMTPConversation = Dm;
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

export interface ConversationInfo {
  id: string;
  peerInboxId: string;
  peerAddress: string;
  dm: Dm;
}

export async function getConversations(): Promise<ConversationInfo[]> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const dms = await xmtpClient.conversations.listDms();
  const conversationInfos: ConversationInfo[] = [];
  
  for (const dm of dms) {
    const members = await dm.members();
    const peerMember = members.find(m => m.inboxId !== xmtpClient?.inboxId);
    const peerAddress = peerMember?.identities?.[0]?.identifier || "";
    
    conversationInfos.push({
      id: dm.id,
      peerInboxId: peerMember?.inboxId || "",
      peerAddress,
      dm,
    });
  }
  
  return conversationInfos;
}

export async function findOrCreateDm(peerAddress: string): Promise<ConversationInfo> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const peerIdentity = new PublicIdentity(peerAddress as `0x${string}`, "ETHEREUM");
  const peerInboxId = await xmtpClient.findInboxIdFromIdentity(peerIdentity);
  
  if (!peerInboxId) {
    throw new Error("This address is not registered with XMTP");
  }

  const dm = await xmtpClient.conversations.findOrCreateDm(peerInboxId);
  
  return {
    id: dm.id,
    peerInboxId,
    peerAddress,
    dm,
  };
}

export async function sendXMTPMessage(dm: Dm, content: string): Promise<void> {
  await dm.send(content);
}

export async function getMessages(dm: Dm): Promise<DecodedMessage[]> {
  const messages = await dm.messages();
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
