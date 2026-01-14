import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { registerAndSavePushToken } from "@/lib/notifications";

const USER_STORAGE_KEY = "@swipeme_user";

async function clearUserSession() {
  try {
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear user session:", error);
  }
}

export interface User {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  profileImage?: string | null;
  status?: string | null;
  twitterLink?: string | null;
  telegramLink?: string | null;
  themePreference?: string | null;
  biometricEnabled?: boolean;
  twoFactorEnabled?: boolean;
  notificationPreferences?: {
    likes: boolean;
    comments: boolean;
    tips: boolean;
    payments: boolean;
  } | null;
}

export interface LoginResult {
  success: boolean;
  requires2FA?: boolean;
  userId?: string;
  user?: User;
}

interface AuthContextType {
  user: User | null;
  pendingUser: User | null;
  isLoading: boolean;
  isInitializing: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<LoginResult>;
  verify2FA: (userId: string, code: string) => Promise<void>;
  signInWithPasskey: (
    credentialId: string,
    rawId: string,
    authenticatorData: string,
    clientDataJSON: string,
    signature: string
  ) => Promise<void>;
  startSignUp: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  completeSignUp: (email: string, code: string, password: string) => Promise<User>;
  finalizeSignUp: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const pushRegisteredRef = useRef(false);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  useEffect(() => {
    if (user && !pushRegisteredRef.current) {
      pushRegisteredRef.current = true;
      registerAndSavePushToken(user.id).catch(err => 
        console.error("Failed to register push token:", err)
      );
    }
    if (!user) {
      pushRegisteredRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    const pingPresence = async () => {
      try {
        const baseUrl = getApiUrl();
        const response = await fetch(new URL("/api/users/presence/ping", baseUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        
        if (response.status === 401) {
          console.warn("Session expired during presence ping");
          await clearUserSession();
          setUser(null);
        }
      } catch (error) {
        // Network errors are acceptable - presence is not critical
      }
    };
    
    pingPresence();
    const interval = setInterval(pingPresence, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const loadStoredAuth = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to load stored auth:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  const signIn = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Login failed");
      }
      
      if (data.requires2FA) {
        return {
          success: true,
          requires2FA: true,
          userId: data.userId,
        };
      }
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      setUser(data.user);
      
      return {
        success: true,
        requires2FA: false,
        user: data.user,
      };
    } catch (error: any) {
      console.error("Sign in failed:", error);
      if (error.message.includes("401")) {
        throw new Error("Incorrect email or password");
      }
      throw new Error(error.message || "Sign in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verify2FA = useCallback(async (userId: string, code: string): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/verify-2fa", { userId, code });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Verification failed");
      }
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      setUser(data.user);
    } catch (error: any) {
      console.error("2FA verification failed:", error);
      throw new Error(error.message || "Invalid verification code");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithPasskey = useCallback(async (
    credentialId: string,
    rawId: string,
    authenticatorData: string,
    clientDataJSON: string,
    signature: string
  ): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/passkey/login", {
        credentialId,
        rawId,
        authenticatorData,
        clientDataJSON,
        signature,
      });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Passkey login failed");
      }
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      setUser(data.user);
    } catch (error: any) {
      console.error("Passkey login failed:", error);
      throw new Error(error.message || "Passkey login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startSignUp = useCallback(async (email: string): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/signup/start", { email });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to send verification code");
      }
    } catch (error: any) {
      console.error("Start signup failed:", error);
      if (error.message && error.message.includes("400")) {
        throw new Error("Email already registered");
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/signup/verify", { email, code });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Invalid verification code");
      }
    } catch (error: any) {
      console.error("Verify code failed:", error);
      throw new Error("Invalid or expired verification code");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const completeSignUp = useCallback(async (email: string, code: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/signup/complete", { email, code, password });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Signup failed");
      }
      
      setPendingUser(data.user);
      return data.user;
    } catch (error: any) {
      console.error("Complete signup failed:", error);
      throw new Error(error.message || "Signup failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const finalizeSignUp = useCallback(async () => {
    if (!pendingUser) {
      throw new Error("No pending user to finalize");
    }
    
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/user/${pendingUser.id}`, baseUrl), {
        credentials: "include",
      });
      const data = await response.json();
      
      const finalUser = data.user || pendingUser;
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(finalUser));
      setUser(finalUser);
      setPendingUser(null);
    } catch (error) {
      console.error("Failed to fetch latest user data, using pending user:", error);
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(pendingUser));
      setUser(pendingUser);
      setPendingUser(null);
    }
  }, [pendingUser]);

  const signOut = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
      setUser(null);
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  }, []);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!user) return;
    
    try {
      const response = await apiRequest("PUT", `/api/user/${user.id}`, updates);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Update failed");
      }
      
      const updatedUser = { ...user, ...data.user };
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error: any) {
      console.error("Update user failed:", error);
      throw new Error(error.message || "Failed to update profile");
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/user/${user.id}`, baseUrl), {
        credentials: "include",
      });
      
      if (response.status === 401) {
        console.warn("Session expired during user refresh");
        await clearUserSession();
        setUser(null);
        return;
      }
      
      if (!response.ok) {
        console.error(`Refresh user failed with status ${response.status}`);
        return;
      }
      
      const data = await response.json();
      
      if (data.user) {
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
        setUser(data.user);
      }
    } catch (error) {
      console.error("Refresh user failed:", error);
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        pendingUser,
        isLoading,
        isInitializing,
        isAuthenticated: !!user,
        signIn,
        verify2FA,
        signInWithPasskey,
        startSignUp,
        verifyCode,
        completeSignUp,
        finalizeSignUp,
        signOut,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
