import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { parse as parseUrl } from "url";
import { parse as parseCookie } from "cookie";
import jwt from "jsonwebtoken";
import { sendMessageNotification, sendPaymentNotification } from "./pushNotifications";
import { db } from "./db";
import { users } from "@shared/schema";
import { inArray } from "drizzle-orm";

interface Connection {
  ws: WebSocket;
  userId: string;
  lastActivity: number;
}

interface MessagePayload {
  type: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  content?: string;
  timestamp?: string;
  [key: string]: unknown;
}

class RealtimeService {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, Connection[]> = new Map();
  private connectionsBySocket: Map<WebSocket, Connection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: "/api/realtime"
    });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.heartbeatInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 30000);

    console.log("WebSocket realtime service initialized on /api/realtime");
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    try {
      const userId = await this.authenticateConnection(req);
      
      if (!userId) {
        ws.close(4001, "Authentication required");
        return;
      }

      const connection: Connection = {
        ws,
        userId,
        lastActivity: Date.now()
      };

      this.addConnection(userId, connection);

      ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(connection, data);
      });

      ws.on("close", () => {
        this.removeConnection(connection);
      });

      ws.on("error", (error: Error) => {
        console.error(`WebSocket error for user ${userId}:`, error.message);
        this.removeConnection(connection);
      });

      ws.send(JSON.stringify({
        type: "connected",
        userId,
        timestamp: new Date().toISOString()
      }));

      console.log(`User ${userId} connected via WebSocket`);

    } catch (error) {
      console.error("WebSocket connection error:", error);
      ws.close(4000, "Connection error");
    }
  }

  private async authenticateConnection(req: IncomingMessage): Promise<string | null> {
    try {
      const url = parseUrl(req.url || "", true);
      const token = url.query.token as string;
      
      if (token) {
        const sessionSecret = process.env.SESSION_SECRET;
        if (!sessionSecret) return null;
        
        try {
          const decoded = jwt.verify(token, sessionSecret) as { userId: string };
          return decoded.userId;
        } catch {
          return null;
        }
      }

      const cookies = req.headers.cookie;
      if (cookies) {
        const parsed = parseCookie(cookies);
        const sessionCookie = parsed["swipeme.sid"];
        if (sessionCookie) {
          return null;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private addConnection(userId: string, connection: Connection) {
    const existing = this.connections.get(userId) || [];
    existing.push(connection);
    this.connections.set(userId, existing);
    this.connectionsBySocket.set(connection.ws, connection);
  }

  private removeConnection(connection: Connection) {
    const userConnections = this.connections.get(connection.userId);
    if (userConnections) {
      const filtered = userConnections.filter(c => c.ws !== connection.ws);
      if (filtered.length > 0) {
        this.connections.set(connection.userId, filtered);
      } else {
        this.connections.delete(connection.userId);
      }
    }
    this.connectionsBySocket.delete(connection.ws);
    console.log(`User ${connection.userId} disconnected`);
  }

  private handleMessage(connection: Connection, data: WebSocket.Data) {
    try {
      connection.lastActivity = Date.now();
      const message = JSON.parse(data.toString()) as MessagePayload;

      switch (message.type) {
        case "ping":
          connection.ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          break;
        
        case "ack":
          break;
        
        case "subscribe":
          break;
        
        case "message:delivered":
          this.handleMessageDelivered(connection, message);
          break;
        
        case "message:read":
          this.handleMessageRead(connection, message);
          break;
        
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  }

  private handleMessageDelivered(_connection: Connection, message: MessagePayload) {
    const { messageId, conversationId, senderId } = message;
    if (!messageId || !senderId) return;
    
    const payload: MessagePayload = {
      type: "status_update",
      messageId,
      conversationId,
      status: "delivered",
      deliveredAt: new Date().toISOString(),
    };
    
    this.sendToUser(senderId, payload);
  }

  private handleMessageRead(_connection: Connection, message: MessagePayload) {
    const { messageIds, conversationId, senderId } = message;
    if (!messageIds || !senderId) return;
    
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];
    
    for (const messageId of ids) {
      const payload: MessagePayload = {
        type: "status_update",
        messageId: messageId as string,
        conversationId,
        status: "read",
        readAt: new Date().toISOString(),
      };
      
      this.sendToUser(senderId, payload);
    }
  }

  private cleanupStaleConnections() {
    const staleThreshold = 60000;
    const now = Date.now();

    for (const [, connection] of this.connectionsBySocket) {
      if (now - connection.lastActivity > staleThreshold) {
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.ping();
        }
      }
    }
  }

  sendToUser(userId: string, payload: MessagePayload) {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.length === 0) {
      return false;
    }

    const message = JSON.stringify(payload);
    let sent = false;

    for (const connection of userConnections) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(message);
        sent = true;
      }
    }

    return sent;
  }

  sendToConversation(conversationId: string, userIds: string[], payload: MessagePayload) {
    const enrichedPayload = { ...payload, conversationId };
    
    for (const userId of userIds) {
      this.sendToUser(userId, enrichedPayload);
    }
  }

  async broadcastNewMessage(data: {
    conversationId: string;
    messageId: string;
    senderId: string;
    senderName?: string;
    recipientIds: string[];
    content?: string;
    timestamp: string;
  }) {
    const payload: MessagePayload = {
      type: "new_message",
      conversationId: data.conversationId,
      messageId: data.messageId,
      senderId: data.senderId,
      timestamp: data.timestamp,
    };

    const offlineUserIds: string[] = [];

    for (const recipientId of data.recipientIds) {
      const wasSent = this.sendToUser(recipientId, payload);
      if (!wasSent) {
        offlineUserIds.push(recipientId);
      }
    }

    if (offlineUserIds.length > 0) {
      await this.sendPushToOfflineUsers(offlineUserIds, {
        type: "message",
        senderName: data.senderName || "New message",
        content: data.content || "You have a new message",
        chatId: data.conversationId,
      });
    }
  }

  private async sendPushToOfflineUsers(
    userIds: string[],
    data: {
      type: "message" | "payment";
      senderName: string;
      content?: string;
      chatId?: string;
      amount?: string;
      currency?: string;
      txHash?: string;
    }
  ) {
    try {
      const offlineUsers = await db
        .select({ id: users.id, pushToken: users.pushToken })
        .from(users)
        .where(inArray(users.id, userIds));

      for (const user of offlineUsers) {
        if (!user.pushToken) continue;

        if (data.type === "message") {
          await sendMessageNotification(
            user.pushToken,
            data.senderName,
            data.content || "New message",
            data.chatId || ""
          );
        } else if (data.type === "payment") {
          await sendPaymentNotification(
            user.pushToken,
            data.senderName,
            data.amount || "0",
            data.currency || "pathUSD",
            data.txHash
          );
        }
      }
    } catch (error) {
      console.error("Failed to send push notifications:", error);
    }
  }

  async broadcastPayment(data: {
    senderId: string;
    senderName?: string;
    recipientId: string;
    amount: string;
    currency: string;
    transactionHash?: string;
    timestamp: string;
  }) {
    const payload: MessagePayload = {
      type: "payment_received",
      senderId: data.senderId,
      amount: data.amount,
      currency: data.currency,
      transactionHash: data.transactionHash,
      timestamp: data.timestamp,
    };

    const wasSent = this.sendToUser(data.recipientId, payload);
    
    if (!wasSent) {
      await this.sendPushToOfflineUsers([data.recipientId], {
        type: "payment",
        senderName: data.senderName || "SwipeMe",
        amount: data.amount,
        currency: data.currency,
        txHash: data.transactionHash,
      });
    }
  }

  broadcastTyping(data: {
    conversationId: string;
    userId: string;
    recipientIds: string[];
    isTyping: boolean;
  }) {
    const payload: MessagePayload = {
      type: "typing",
      conversationId: data.conversationId,
      userId: data.userId,
      isTyping: data.isTyping,
    };

    for (const recipientId of data.recipientIds) {
      if (recipientId !== data.userId) {
        this.sendToUser(recipientId, payload);
      }
    }
  }

  async broadcastGroupMessage(data: {
    groupId: string;
    messageId: string;
    senderId: string;
    senderName?: string;
    memberIds: string[];
    content?: string;
    timestamp: string;
  }) {
    const payload: MessagePayload = {
      type: "group_message",
      conversationId: data.groupId,
      messageId: data.messageId,
      senderId: data.senderId,
      timestamp: data.timestamp,
    };

    const offlineUserIds: string[] = [];

    for (const memberId of data.memberIds) {
      if (memberId !== data.senderId) {
        const wasSent = this.sendToUser(memberId, payload);
        if (!wasSent) {
          offlineUserIds.push(memberId);
        }
      }
    }

    if (offlineUserIds.length > 0) {
      await this.sendPushToOfflineUsers(offlineUserIds, {
        type: "message",
        senderName: data.senderName || "Group message",
        content: data.content || "New message in group",
        chatId: data.groupId,
      });
    }
  }

  broadcastGroupStatusUpdate(data: {
    groupId: string;
    messageId: string;
    senderId: string;
    status: "sent" | "delivered" | "read";
    updatedBy: string;
    memberIds: string[];
    timestamp: string;
  }) {
    const payload: MessagePayload = {
      type: "group_status_update",
      conversationId: data.groupId,
      messageId: data.messageId,
      status: data.status,
      updatedBy: data.updatedBy,
      timestamp: data.timestamp,
    };

    this.sendToUser(data.senderId, payload);
  }

  broadcastGroupMemberChange(data: {
    groupId: string;
    action: "added" | "removed" | "left" | "admin_transferred";
    memberId: string;
    memberName?: string;
    memberIds: string[];
    newAdminId?: string;
    timestamp: string;
  }) {
    const payload: MessagePayload = {
      type: "group_member_change",
      conversationId: data.groupId,
      action: data.action,
      memberId: data.memberId,
      memberName: data.memberName,
      newAdminId: data.newAdminId,
      timestamp: data.timestamp,
    };

    for (const memberId of data.memberIds) {
      this.sendToUser(memberId, payload);
    }
  }

  isUserOnline(userId: string): boolean {
    const connections = this.connections.get(userId);
    if (!connections || connections.length === 0) return false;
    
    return connections.some(c => c.ws.readyState === WebSocket.OPEN);
  }

  getOnlineUsers(): string[] {
    const online: string[] = [];
    for (const [userId, connections] of this.connections) {
      if (connections.some(c => c.ws.readyState === WebSocket.OPEN)) {
        online.push(userId);
      }
    }
    return online;
  }

  generateAuthToken(userId: string): string {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      throw new Error("SESSION_SECRET not configured");
    }
    
    return jwt.sign(
      { userId, type: "websocket" },
      sessionSecret,
      { expiresIn: "24h" }
    );
  }

  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    for (const [, connection] of this.connectionsBySocket) {
      connection.ws.close(1001, "Server shutting down");
    }
    
    this.connections.clear();
    this.connectionsBySocket.clear();
    
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const realtimeService = new RealtimeService();
