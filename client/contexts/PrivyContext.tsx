import React, { createContext, useContext, ReactNode, useMemo } from "react";
import { Platform } from "react-native";

interface PrivyContextType {
  isNative: boolean;
  privyAvailable: boolean;
}

const PrivyContext = createContext<PrivyContextType>({
  isNative: Platform.OS !== "web",
  privyAvailable: false,
});

export function usePrivyContext() {
  return useContext(PrivyContext);
}

interface PrivyProviderProps {
  children: ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  const isNative = Platform.OS !== "web";
  const privyAvailable = isNative;

  const contextValue = useMemo(() => ({
    isNative,
    privyAvailable,
  }), [isNative, privyAvailable]);

  if (isNative) {
    try {
      const { PrivyProvider: NativePrivyProvider } = require("@privy-io/expo");
      const appId = process.env.EXPO_PUBLIC_PRIVY_APP_ID || "";
      const clientId = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID_MOBILE || "";

      if (!appId) {
        console.warn("Privy: EXPO_PUBLIC_PRIVY_APP_ID not set, falling back to non-Privy mode");
        return (
          <PrivyContext.Provider value={{ ...contextValue, privyAvailable: false }}>
            {children}
          </PrivyContext.Provider>
        );
      }

      return (
        <NativePrivyProvider appId={appId} clientId={clientId}>
          <PrivyContext.Provider value={contextValue}>
            {children}
          </PrivyContext.Provider>
        </NativePrivyProvider>
      );
    } catch (error) {
      console.warn("Privy SDK not available on this platform:", error);
      return (
        <PrivyContext.Provider value={{ ...contextValue, privyAvailable: false }}>
          {children}
        </PrivyContext.Provider>
      );
    }
  }

  return (
    <PrivyContext.Provider value={contextValue}>
      {children}
    </PrivyContext.Provider>
  );
}
