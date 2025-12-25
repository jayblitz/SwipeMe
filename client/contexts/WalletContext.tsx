import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
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

interface WalletContextType {
  wallet: Wallet | null;
  isLoading: boolean;
  hasWallet: boolean;
  refreshWallet: () => Promise<Wallet | null>;
  setWallet: (wallet: Wallet | null) => void;
  clearWallet: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const WALLET_STORAGE_KEY = "@swipeme_wallet";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [wallet, setWalletState] = useState<Wallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadStoredWallet = useCallback(async () => {
    try {
      const storedWallet = await AsyncStorage.getItem(WALLET_STORAGE_KEY);
      if (storedWallet) {
        const parsed = JSON.parse(storedWallet);
        if (user && parsed.userId === user.id) {
          setWalletState(parsed);
        } else {
          await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load stored wallet:", error);
    }
  }, [user]);

  const fetchWalletFromServer = useCallback(async (): Promise<Wallet | null> => {
    if (!user) return null;

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/wallet/${user.id}`, baseUrl), {
        credentials: "include",
      });
      const data = await response.json();

      if (data.wallet) {
        await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(data.wallet));
        setWalletState(data.wallet);
        return data.wallet;
      } else {
        await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
        setWalletState(null);
        return null;
      }
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
      return null;
    }
  }, [user]);

  const refreshWallet = useCallback(async (): Promise<Wallet | null> => {
    setIsLoading(true);
    try {
      return await fetchWalletFromServer();
    } finally {
      setIsLoading(false);
    }
  }, [fetchWalletFromServer]);

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
        await loadStoredWallet();
        await fetchWalletFromServer();
        setIsLoading(false);
      } else {
        setWalletState(null);
        setIsLoading(false);
      }
    };

    initWallet();
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearWallet();
    }
  }, [isAuthenticated, clearWallet]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        isLoading,
        hasWallet: !!wallet,
        refreshWallet,
        setWallet,
        clearWallet,
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
