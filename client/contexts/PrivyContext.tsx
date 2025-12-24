import React, { createContext, useContext, ReactNode } from "react";
import { Platform } from "react-native";
import { PrivyProvider as PrivyProviderSDK } from "@privy-io/expo";

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || "";
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || "";

interface PrivyContextType {
  isNative: boolean;
}

const PrivyContext = createContext<PrivyContextType>({
  isNative: Platform.OS !== "web",
});

export function usePrivyContext() {
  return useContext(PrivyContext);
}

interface PrivyProviderProps {
  children: ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  const isNative = Platform.OS !== "web";

  if (!isNative) {
    return (
      <PrivyContext.Provider value={{ isNative: false }}>
        {children}
      </PrivyContext.Provider>
    );
  }

  if (!PRIVY_APP_ID || !PRIVY_CLIENT_ID) {
    console.warn("Privy credentials not configured");
    return (
      <PrivyContext.Provider value={{ isNative: true }}>
        {children}
      </PrivyContext.Provider>
    );
  }

  return (
    <PrivyProviderSDK appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID}>
      <PrivyContext.Provider value={{ isNative: true }}>
        {children}
      </PrivyContext.Provider>
    </PrivyProviderSDK>
  );
}
