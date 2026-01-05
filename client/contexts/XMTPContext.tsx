import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  initializeXMTPClient, 
  disconnectXMTP, 
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
  retryCount: number;
  initialize: () => Promise<void>;
  disconnect: () => Promise<void>;
  retry: () => Promise<void>;
}

const XMTPContext = createContext<XMTPContextType | undefined>(undefined);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export function XMTPProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [client, setClient] = useState<XMTPClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializingRef = useRef(false);

  const { data: walletData } = useQuery<{ wallet: Wallet | null }>({
    queryKey: ["/api/wallet", user?.id],
    enabled: !!user?.id,
  });

  const wallet = walletData?.wallet;
  const isSupported = isXMTPSupported();

  const initialize = useCallback(async (isRetry = false) => {
    if (!user?.id || !wallet?.address) {
      if (!isRetry) {
        setError(null);
      }
      return;
    }

    if (!isSupported) {
      setError("Secure messaging requires the mobile app");
      return;
    }

    if (client) {
      return;
    }

    if (isInitializingRef.current) {
      return;
    }

    isInitializingRef.current = true;
    setIsInitializing(true);
    if (!isRetry) {
      setError(null);
      setRetryCount(0);
    }

    try {
      const xmtpClient = await initializeXMTPClient(user.id, wallet.address);
      setClient(xmtpClient);
      setError(null);
      setRetryCount(0);
    } catch (err) {
      console.error("Failed to initialize XMTP:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to initialize messaging";
      setError(errorMessage);
      
      const currentRetry = isRetry ? retryCount : 0;
      if (currentRetry < MAX_RETRIES) {
        setRetryCount(currentRetry + 1);
        console.log(`XMTP init retry ${currentRetry + 1}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
        retryTimeoutRef.current = setTimeout(() => {
          isInitializingRef.current = false;
          initialize(true);
        }, RETRY_DELAY_MS * (currentRetry + 1));
      }
    } finally {
      if (!retryTimeoutRef.current || retryCount >= MAX_RETRIES) {
        setIsInitializing(false);
        isInitializingRef.current = false;
      }
    }
  }, [user?.id, wallet?.address, client, isSupported, retryCount]);

  const retry = useCallback(async () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setError(null);
    setRetryCount(0);
    isInitializingRef.current = false;
    await initialize(false);
  }, [initialize]);

  const disconnect = useCallback(async () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    await disconnectXMTP();
    setClient(null);
    setError(null);
    setRetryCount(0);
    isInitializingRef.current = false;
  }, []);

  useEffect(() => {
    if (user?.id && wallet?.address && isSupported && !client && !isInitializingRef.current) {
      initialize(false);
    }
  }, [user?.id, wallet?.address, isSupported, client, initialize]);

  useEffect(() => {
    if (!user) {
      disconnect();
    }
  }, [user, disconnect]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <XMTPContext.Provider
      value={{
        client,
        isInitializing,
        isSupported,
        error,
        retryCount,
        initialize: () => initialize(false),
        disconnect,
        retry,
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
