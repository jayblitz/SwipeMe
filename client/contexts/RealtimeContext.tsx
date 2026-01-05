import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { realtimeClient, RealtimeMessage } from "@/lib/realtime";
import { useAuth } from "./AuthContext";
import { apiRequest } from "@/lib/query-client";

interface RealtimeContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnect: () => Promise<void>;
  subscribe: (eventType: string, handler: (data: RealtimeMessage) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!isAuthenticated || !user) {
      return;
    }

    if (realtimeClient.isConnected()) {
      setIsConnected(true);
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const response = await apiRequest("GET", "/api/realtime/token");
      const data = await response.json();
      
      if (!data.token) {
        throw new Error("Failed to get realtime token");
      }

      await realtimeClient.connect(data.token, {
        onConnect: () => {
          setIsConnected(true);
          setIsConnecting(false);
          setError(null);
          console.log("Realtime connected");
        },
        onDisconnect: () => {
          setIsConnected(false);
          console.log("Realtime disconnected");
        },
        onError: (err) => {
          setError(err.message);
          setIsConnecting(false);
          console.error("Realtime error:", err);
        },
      });
    } catch (err) {
      console.error("Failed to connect realtime:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnecting(false);
    }
  }, [isAuthenticated, user]);

  const reconnect = useCallback(async () => {
    realtimeClient.disconnect();
    setIsConnected(false);
    await connect();
  }, [connect]);

  const subscribe = useCallback((eventType: string, handler: (data: RealtimeMessage) => void) => {
    return realtimeClient.subscribe(eventType, handler);
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      connect();
    } else {
      realtimeClient.disconnect();
      setIsConnected(false);
      setError(null);
    }

    return () => {
      realtimeClient.disconnect();
    };
  }, [isAuthenticated, user, connect]);

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        isConnecting,
        error,
        reconnect,
        subscribe,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
}
