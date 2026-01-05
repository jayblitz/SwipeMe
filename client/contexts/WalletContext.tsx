import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "./AuthContext";

export interface Wallet {
  id: number;
  userId: string;
  address: string;
  isImported: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WalletErrorType = "network" | "server" | "storage" | null;

interface WalletContextType {
  wallet: Wallet | null;
  isLoading: boolean;
  hasWallet: boolean;
  error: WalletErrorType;
  errorMessage: string | null;
  retryCount: number;
  refreshWallet: () => Promise<Wallet | null>;
  setWallet: (wallet: Wallet | null) => void;
  clearWallet: () => Promise<void>;
  retry: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const WALLET_STORAGE_KEY = "@swipeme_wallet";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [wallet, setWalletState] = useState<Wallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<WalletErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentUserIdRef.current = user?.id || null;
    if (retryTimeoutRef.current && !user) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, [user]);

  const loadStoredWallet = useCallback(async (): Promise<Wallet | null> => {
    try {
      const storedWallet = await AsyncStorage.getItem(WALLET_STORAGE_KEY);
      if (storedWallet) {
        const parsed = JSON.parse(storedWallet);
        if (user && parsed.userId === user.id) {
          setWalletState(parsed);
          return parsed;
        } else {
          await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
        }
      }
      return null;
    } catch (err) {
      console.error("Failed to load stored wallet:", err);
      setError("storage");
      setErrorMessage("Failed to load wallet from device storage");
      return null;
    }
  }, [user]);

  const fetchWalletFromServer = useCallback(async (_isRetry = false, currentRetryCount = 0): Promise<Wallet | null> => {
    if (!user) return null;

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/wallet/${user.id}`, baseUrl), {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError("server");
          setErrorMessage("Session expired. Please sign in again.");
          return wallet;
        }
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.wallet) {
        await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(data.wallet));
        setWalletState(data.wallet);
        setError(null);
        setErrorMessage(null);
        setRetryCount(0);
        return data.wallet;
      } else {
        await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
        setWalletState(null);
        setError(null);
        setErrorMessage(null);
        return null;
      }
    } catch (err) {
      console.error("Failed to fetch wallet:", err);
      
      if (currentRetryCount < MAX_RETRIES) {
        const nextRetryCount = currentRetryCount + 1;
        setRetryCount(nextRetryCount);
        setError("network");
        setErrorMessage(`Connection issue. Retrying... (${nextRetryCount}/${MAX_RETRIES})`);
        
        return new Promise((resolve) => {
          const capturedUserId = user.id;
          retryTimeoutRef.current = setTimeout(async () => {
            if (!isMountedRef.current || currentUserIdRef.current !== capturedUserId) {
              resolve(null);
              return;
            }
            const result = await fetchWalletFromServer(true, nextRetryCount);
            resolve(result);
          }, RETRY_DELAY_MS * nextRetryCount);
        });
      }
      
      setError("network");
      setErrorMessage("Unable to connect to server. Please check your connection.");
      return wallet;
    }
  }, [user, wallet]);

  const refreshWallet = useCallback(async (): Promise<Wallet | null> => {
    setIsLoading(true);
    setRetryCount(0);
    try {
      return await fetchWalletFromServer(false);
    } finally {
      setIsLoading(false);
    }
  }, [fetchWalletFromServer]);

  const retry = useCallback(async () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setError(null);
    setErrorMessage(null);
    setRetryCount(0);
    await refreshWallet();
  }, [refreshWallet]);

  const setWallet = useCallback((newWallet: Wallet | null) => {
    setWalletState(newWallet);
    if (newWallet) {
      AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(newWallet)).catch(
        (error) => console.error("Failed to persist wallet:", error)
      );
    } else {
      AsyncStorage.removeItem(WALLET_STORAGE_KEY).catch(
        (error) => console.error("Failed to clear wallet:", error)
      );
    }
  }, []);

  const clearWallet = useCallback(async () => {
    setWalletState(null);
    await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
  }, []);

  useEffect(() => {
    const initWallet = async () => {
      if (isAuthenticated && user) {
        setIsLoading(true);
        setError(null);
        setErrorMessage(null);
        const storedWallet = await loadStoredWallet();
        if (!storedWallet) {
          await fetchWalletFromServer(false);
        }
        setIsLoading(false);
      } else {
        setWalletState(null);
        setError(null);
        setErrorMessage(null);
        setIsLoading(false);
      }
    };

    initWallet();
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearWallet();
      setError(null);
      setErrorMessage(null);
      setRetryCount(0);
    }
  }, [isAuthenticated, clearWallet]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        isLoading,
        hasWallet: !!wallet,
        error,
        errorMessage,
        retryCount,
        refreshWallet,
        setWallet,
        clearWallet,
        retry,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
