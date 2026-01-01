import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { parse as parseUrl } from "url";
import { parse as parseCookie } from "cookie";
import jwt from "jsonwebtoken";

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
        
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
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

  broadcastNewMessage(data: {
    conversationId: string;
    messageId: string;
    senderId: string;
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

    for (const recipientId of data.recipientIds) {
      const wasSent = this.sendToUser(recipientId, payload);
      if (!wasSent) {
        console.log(`User ${recipientId} offline, push notification needed`);
      }
    }
  }

  broadcastPayment(data: {
    senderId: string;
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

    this.sendToUser(data.recipientId, payload);
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
