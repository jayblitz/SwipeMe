import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { 
  initializeXMTPClient, 
  disconnectXMTP, 
  getXMTPClient,
  isXMTPSupported,
  type XMTPClient 
} from "@/lib/xmtp";
import { useAuth } from "./AuthContext";

interface Wallet {
  address: string;
}

interface XMTPContextType {
  client: XMTPClient | null;
  isInitializing: boolean;
  isSupported: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const XMTPContext = createContext<XMTPContextType | undefined>(undefined);

export function XMTPProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [client, setClient] = useState<XMTPClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: walletData } = useQuery<{ wallet: Wallet | null }>({
    queryKey: ["/api/wallet", user?.id],
    enabled: !!user?.id,
  });

  const wallet = walletData?.wallet;
  const isSupported = isXMTPSupported();

  const initialize = useCallback(async () => {
    if (!user?.id || !wallet?.address) {
      setError("Wallet not set up");
      return;
    }

    if (!isSupported) {
      setError("XMTP is not supported on web. Please use the mobile app.");
      return;
    }

    if (client) {
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      const xmtpClient = await initializeXMTPClient(user.id, wallet.address);
      setClient(xmtpClient);
    } catch (err) {
      console.error("Failed to initialize XMTP:", err);
      setError(err instanceof Error ? err.message : "Failed to initialize messaging");
    } finally {
      setIsInitializing(false);
    }
  }, [user?.id, wallet?.address, client, isSupported]);

  const disconnect = useCallback(async () => {
    await disconnectXMTP();
    setClient(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (user?.id && wallet?.address && isSupported && !client && !isInitializing) {
      initialize();
    }
  }, [user?.id, wallet?.address, isSupported, client, isInitializing, initialize]);

  useEffect(() => {
    if (!user) {
      disconnect();
    }
  }, [user, disconnect]);

  return (
    <XMTPContext.Provider
      value={{
        client,
        isInitializing,
        isSupported,
        error,
        initialize,
        disconnect,
      }}
    >
      {children}
    </XMTPContext.Provider>
  );
}

export function useXMTP() {
  const context = useContext(XMTPContext);
  if (context === undefined) {
    throw new Error("useXMTP must be used within an XMTPProvider");
  }
  return context;
}
