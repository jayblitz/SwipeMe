import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Platform, AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "./AuthContext";
import {
  registerAndSavePushToken,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  clearBadge,
} from "@/lib/notifications";

interface NotificationContextType {
  pushToken: string | null;
  hasPermission: boolean;
  requestPermission: () => Promise<void>;
  lastNotification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
  onNotificationTap?: (data: Record<string, unknown>) => void;
}

export function NotificationProvider({ children, onNotificationTap }: NotificationProviderProps) {
  const { user, isAuthenticated } = useAuth();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [lastNotification, setLastNotification] = useState<Notifications.Notification | null>(null);
  const notificationReceivedListener = useRef<Notifications.EventSubscription | null>(null);
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);

  const registerToken = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const token = await registerAndSavePushToken(user.id);
      if (token) {
        setPushToken(token);
        setHasPermission(true);
      }
    } catch (error) {
      console.error("Failed to register push token:", error);
    }
  }, [user?.id]);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      return;
    }
    await registerToken();
  }, [registerToken]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      registerToken();
    }
  }, [isAuthenticated, user?.id, registerToken]);

  useEffect(() => {
    notificationReceivedListener.current = addNotificationReceivedListener((notification) => {
      setLastNotification(notification);
    });

    notificationResponseListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data && onNotificationTap) {
        onNotificationTap(data as Record<string, unknown>);
      }
    });

    return () => {
      notificationReceivedListener.current?.remove();
      notificationResponseListener.current?.remove();
    };
  }, [onNotificationTap]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        clearBadge();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        pushToken,
        hasPermission,
        requestPermission,
        lastNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
