import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  profileImage?: string | null;
  status?: string | null;
  twitterLink?: string | null;
  telegramLink?: string | null;
  themePreference?: string | null;
  biometricEnabled?: boolean;
  twoFactorEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  startSignUp: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  completeSignUp: (email: string, code: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@tempochat_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to load stored auth:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/login", { email, password });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Login failed");
      }
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      setUser(data.user);
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

  const completeSignUp = useCallback(async (email: string, code: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/signup/complete", { email, code, password });
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Signup failed");
      }
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      setUser(data.user);
    } catch (error: any) {
      console.error("Complete signup failed:", error);
      throw new Error(error.message || "Signup failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        isLoading,
        isAuthenticated: !!user,
        signIn,
        startSignUp,
        verifyCode,
        completeSignUp,
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
