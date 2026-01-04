import { Client, Dm, Group, DecodedMessage, PublicIdentity, type Signer } from "@xmtp/react-native-sdk";
import { Platform } from "react-native";
import { apiRequest } from "./query-client";
import * as SecureStore from "expo-secure-store";

export type XMTPClient = Client;
export type XMTPConversation = Dm;
export type XMTPGroup = Group;
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

export async function streamMessages(
  dm: Dm,
  onMessage: (message: DecodedMessage) => void | Promise<void>
): Promise<() => void> {
  const cancelStream = await dm.streamMessages(async (message) => {
    await Promise.resolve(onMessage(message));
  });
  return cancelStream;
}

export async function syncConversations(): Promise<void> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }
  await xmtpClient.conversations.sync();
}

export async function streamAllMessages(
  onMessage: (message: DecodedMessage) => void | Promise<void>
): Promise<() => void> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  await xmtpClient.conversations.streamAllMessages(async (message: DecodedMessage) => {
    await Promise.resolve(onMessage(message));
  });
  
  const client = xmtpClient;
  return () => {
    try {
      client.conversations.cancelStream();
    } catch (e) {
      // Ignore cancellation errors
    }
  };
}

export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  memberAddresses: string[];
  group: Group;
  isAdmin: boolean;
}

export interface CreateGroupOptions {
  name: string;
  description?: string;
  imageUrl?: string;
}

export async function createGroup(
  memberAddresses: string[],
  options: CreateGroupOptions
): Promise<GroupInfo> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const memberInboxIds: string[] = [];
  for (const address of memberAddresses) {
    const peerIdentity = new PublicIdentity(address as `0x${string}`, "ETHEREUM");
    const inboxId = await xmtpClient.findInboxIdFromIdentity(peerIdentity);
    if (inboxId) {
      memberInboxIds.push(inboxId);
    }
  }

  const group = await xmtpClient.conversations.newGroup(memberInboxIds, {
    name: options.name,
    description: options.description,
    imageUrl: options.imageUrl,
    permissionLevel: "admin_only",
  });

  return {
    id: group.id,
    name: options.name,
    description: options.description,
    imageUrl: options.imageUrl,
    memberAddresses,
    group,
    isAdmin: true,
  };
}

export async function getGroups(): Promise<GroupInfo[]> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const groups = await xmtpClient.conversations.listGroups();
  const groupInfos: GroupInfo[] = [];

  for (const group of groups) {
    const members = await group.members();
    const memberAddresses = members
      .map(m => m.identities?.[0]?.identifier || "")
      .filter(Boolean);
    
    const isAdmin = members.some(
      m => m.inboxId === xmtpClient?.inboxId && m.permissionLevel === "admin"
    );

    const groupName = await group.name();
    const groupDescription = await group.description();
    const groupImageUrl = await group.imageUrl();

    groupInfos.push({
      id: group.id,
      name: groupName || "Group Chat",
      description: groupDescription,
      imageUrl: groupImageUrl,
      memberAddresses,
      group,
      isAdmin,
    });
  }

  return groupInfos;
}

export async function getGroupById(groupId: string): Promise<GroupInfo | null> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const groups = await xmtpClient.conversations.listGroups();
  const group = groups.find(g => g.id === groupId);
  
  if (!group) {
    return null;
  }

  const members = await group.members();
  const memberAddresses = members
    .map(m => m.identities?.[0]?.identifier || "")
    .filter(Boolean);

  const isAdmin = members.some(
    m => m.inboxId === xmtpClient?.inboxId && m.permissionLevel === "admin"
  );

  const groupName = await group.name();
  const groupDescription = await group.description();
  const groupImageUrl = await group.imageUrl();

  return {
    id: group.id,
    name: groupName || "Group Chat",
    description: groupDescription,
    imageUrl: groupImageUrl,
    memberAddresses,
    group,
    isAdmin,
  };
}

export async function addGroupMembers(
  group: Group,
  memberAddresses: string[]
): Promise<void> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const memberInboxIds: string[] = [];
  for (const address of memberAddresses) {
    const peerIdentity = new PublicIdentity(address as `0x${string}`, "ETHEREUM");
    const inboxId = await xmtpClient.findInboxIdFromIdentity(peerIdentity);
    if (inboxId) {
      memberInboxIds.push(inboxId);
    }
  }

  await group.addMembers(memberInboxIds);
}

export async function removeGroupMembers(
  group: Group,
  memberAddresses: string[]
): Promise<void> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }

  const memberInboxIds: string[] = [];
  for (const address of memberAddresses) {
    const peerIdentity = new PublicIdentity(address as `0x${string}`, "ETHEREUM");
    const inboxId = await xmtpClient.findInboxIdFromIdentity(peerIdentity);
    if (inboxId) {
      memberInboxIds.push(inboxId);
    }
  }

  await group.removeMembers(memberInboxIds);
}

export async function updateGroupName(group: Group, name: string): Promise<void> {
  await group.updateName(name);
}

export async function updateGroupDescription(group: Group, description: string): Promise<void> {
  await group.updateDescription(description);
}

export async function updateGroupImage(group: Group, imageUrl: string): Promise<void> {
  await group.updateImageUrl(imageUrl);
}

export async function sendGroupMessage(group: Group, content: string): Promise<void> {
  await group.send(content);
}

export async function getGroupMessages(group: Group): Promise<DecodedMessage[]> {
  const messages = await group.messages();
  return messages;
}

export async function streamGroupMessages(
  group: Group,
  onMessage: (message: DecodedMessage) => void | Promise<void>
): Promise<() => void> {
  const cancelStream = await group.streamMessages(async (message) => {
    await Promise.resolve(onMessage(message));
  });
  return cancelStream;
}

export async function leaveGroup(group: Group): Promise<void> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }
  
  await group.removeMembers([xmtpClient.inboxId]);
}

export async function syncGroups(): Promise<void> {
  if (!xmtpClient) {
    throw new Error("XMTP client not initialized");
  }
  await xmtpClient.conversations.sync();
}
