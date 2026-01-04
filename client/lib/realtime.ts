import { getApiUrl } from "./query-client";

type MessageHandler = (data: RealtimeMessage) => void;

export interface RealtimeMessage {
  type: string;
  conversationId?: string;
  messageId?: string;
  messageIds?: string[];
  senderId?: string;
  content?: string;
  timestamp?: string;
  amount?: string;
  currency?: string;
  transactionHash?: string;
  isTyping?: boolean;
  userId?: string;
  status?: "sent" | "delivered" | "read";
  deliveredAt?: string;
  readAt?: string;
  [key: string]: unknown;
}

interface RealtimeConfig {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: MessageHandler;
  onNewMessage?: (data: RealtimeMessage) => void;
  onPaymentReceived?: (data: RealtimeMessage) => void;
  onTyping?: (data: RealtimeMessage) => void;
  onStatusUpdate?: (data: RealtimeMessage) => void;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private config: RealtimeConfig = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private handlers: Map<string, Set<MessageHandler>> = new Map();

  async connect(token: string, config: RealtimeConfig = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }

    if (this.isConnecting) {
      console.log("WebSocket connection in progress");
      return;
    }

    this.token = token;
    this.config = config;
    this.isConnecting = true;

    try {
      const apiUrl = getApiUrl();
      const url = new URL(apiUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/api/realtime";
      url.searchParams.set("token", token);
      
      this.ws = new WebSocket(url.toString());

      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPing();
        this.config.onConnect?.();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeMessage;
          this.handleMessage(data);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        this.isConnecting = false;
        this.stopPing();
        this.config.onDisconnect?.();
        
        if (event.code !== 1000 && event.code !== 4001) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.isConnecting = false;
        this.config.onError?.(new Error("WebSocket connection failed"));
      };

    } catch (error) {
      this.isConnecting = false;
      console.error("Failed to create WebSocket:", error);
      throw error;
    }
  }

  private handleMessage(data: RealtimeMessage) {
    this.config.onMessage?.(data);

    switch (data.type) {
      case "connected":
        console.log("Realtime connection confirmed for user:", data.userId);
        break;

      case "pong":
        break;

      case "new_message":
        this.config.onNewMessage?.(data);
        this.emit("new_message", data);
        break;

      case "payment_received":
        this.config.onPaymentReceived?.(data);
        this.emit("payment_received", data);
        break;

      case "typing":
        this.config.onTyping?.(data);
        this.emit("typing", data);
        break;

      case "status_update":
        this.config.onStatusUpdate?.(data);
        this.emit("status_update", data);
        break;

      default:
        this.emit(data.type, data);
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: "ping" });
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.token && this.ws?.readyState !== WebSocket.OPEN) {
        this.connect(this.token, this.config);
      }
    }, delay);
  }

  send(data: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected, cannot send message");
    }
  }

  sendAck(messageId: string) {
    this.send({ type: "ack", messageId });
  }

  sendDelivered(messageId: string, conversationId: string, senderId: string) {
    this.send({ 
      type: "message:delivered", 
      messageId, 
      conversationId, 
      senderId 
    });
  }

  sendRead(messageIds: string[], conversationId: string, senderId: string) {
    this.send({ 
      type: "message:read", 
      messageIds, 
      conversationId, 
      senderId 
    });
  }

  subscribe(eventType: string, handler: MessageHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  private emit(eventType: string, data: RealtimeMessage) {
    this.handlers.get(eventType)?.forEach(handler => handler(data));
  }

  disconnect() {
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.token = null;
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const realtimeClient = new RealtimeClient();
