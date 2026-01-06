import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PUSH_TOKEN_KEY = "@swipeme_push_token";
const NOTIFICATION_PREFS_KEY = "@swipeme_notification_prefs";
const PERMISSION_DENIED_KEY = "@swipeme_notification_denied";

export interface NotificationPreferences {
  messages: boolean;
  payments: boolean;
  marketing: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  messages: true,
  payments: true,
  marketing: false,
};

export type NotificationRegistrationStatus = 
  | "granted"
  | "denied"
  | "denied_permanently"
  | "not_device"
  | "web_unsupported"
  | "error";

export interface NotificationRegistrationResult {
  status: NotificationRegistrationStatus;
  token: string | null;
  message: string;
  canAskAgain: boolean;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsWithDetails(): Promise<NotificationRegistrationResult> {
  if (Platform.OS === "web") {
    return {
      status: "web_unsupported",
      token: null,
      message: "Push notifications are not available on web. Use the mobile app for notifications.",
      canAskAgain: false,
    };
  }

  if (!Device.isDevice) {
    return {
      status: "not_device",
      token: null,
      message: "Push notifications require a physical device. Try using Expo Go on your phone.",
      canAskAgain: false,
    };
  }

  try {
    const { status: existingStatus, canAskAgain } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    let canRequestAgain = canAskAgain;

    if (existingStatus !== "granted") {
      const result = await Notifications.requestPermissionsAsync();
      finalStatus = result.status;
      canRequestAgain = result.canAskAgain;
    }

    if (finalStatus !== "granted") {
      await AsyncStorage.setItem(PERMISSION_DENIED_KEY, "true");
      
      if (!canRequestAgain) {
        return {
          status: "denied_permanently",
          token: null,
          message: "Notifications are disabled. Go to Settings to enable them for SwipeMe.",
          canAskAgain: false,
        };
      }
      
      return {
        status: "denied",
        token: null,
        message: "Enable notifications to get alerts for new messages and payments.",
        canAskAgain: true,
      };
    }

    await AsyncStorage.removeItem(PERMISSION_DENIED_KEY);
    const token = await Notifications.getExpoPushTokenAsync();
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0066FF",
      });

      await Notifications.setNotificationChannelAsync("messages", {
        name: "Messages",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0066FF",
      });

      await Notifications.setNotificationChannelAsync("payments", {
        name: "Payments",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 200, 300],
        lightColor: "#00CC66",
      });
    }

    return {
      status: "granted",
      token: token.data,
      message: "Notifications enabled successfully.",
      canAskAgain: false,
    };
  } catch (error) {
    console.error("Failed to register for push notifications:", error);
    return {
      status: "error",
      token: null,
      message: "Something went wrong enabling notifications. Please try again.",
      canAskAgain: true,
    };
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  const result = await registerForPushNotificationsWithDetails();
  return result.token;
}

export async function getNotificationPermissionStatus(): Promise<NotificationRegistrationStatus> {
  if (Platform.OS === "web") return "web_unsupported";
  if (!Device.isDevice) return "not_device";
  
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    if (!canAskAgain) return "denied_permanently";
    return "denied";
  } catch {
    return "error";
  }
}

export async function wasNotificationPermissionDenied(): Promise<boolean> {
  try {
    const denied = await AsyncStorage.getItem(PERMISSION_DENIED_KEY);
    return denied === "true";
  } catch {
    return false;
  }
}

export async function registerAndSavePushToken(userId: string): Promise<string | null> {
  if (!userId) {
    return null;
  }
  
  try {
    const token = await registerForPushNotifications();
    if (!token) {
      return null;
    }
    
    const { getApiUrl } = await import("@/lib/query-client");
    const response = await fetch(new URL(`/api/users/${userId}/push-token`, getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pushToken: token }),
    });
    
    if (!response.ok) {
      console.error("Failed to save push token to server:", await response.text());
    }
    
    return token;
  } catch (error) {
    console.error("Error registering push token:", error);
    return null;
  }
}

export async function getSavedPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch (error) {
    console.error("Failed to get saved push token:", error);
    return null;
  }
}

export async function clearPushToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch (error) {
    console.error("Failed to clear push token:", error);
  }
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const prefs = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
    return prefs ? JSON.parse(prefs) : DEFAULT_PREFS;
  } catch (error) {
    console.error("Failed to get notification preferences:", error);
    return DEFAULT_PREFS;
  }
}

export async function setNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error("Failed to save notification preferences:", error);
  }
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  _channelId: string = "default"
): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null,
    });
    return id;
  } catch (error) {
    console.error("Failed to schedule notification:", error);
    return null;
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error("Failed to cancel notifications:", error);
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error("Failed to set badge count:", error);
  }
}

export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function hasNotificationPermission(): Promise<boolean> {
  const status = await getNotificationPermissionStatus();
  return status === "granted";
}

const MAX_NOTIFY_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_NOTIFY_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) {
        return response;
      }
      lastError = new Error(`Server error: ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
  
  throw lastError || new Error("Request failed after retries");
}

export async function sendMessageNotification(
  recipientId: string,
  message: string,
  chatId: string,
  messageId?: string
): Promise<void> {
  const { getApiUrl } = await import("@/lib/query-client");
  try {
    await fetchWithRetry(
      new URL("/api/notify/message", getApiUrl()).toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientId, message, chatId, messageId }),
      }
    );
  } catch (error) {
    console.error("Failed to send message notification after retries:", error);
  }
}

export async function sendGroupMessageNotification(
  groupId: string,
  message: string
): Promise<void> {
  const { getApiUrl } = await import("@/lib/query-client");
  try {
    await fetchWithRetry(
      new URL("/api/notify/group-message", getApiUrl()).toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groupId, message }),
      }
    );
  } catch (error) {
    console.error("Failed to send group notification after retries:", error);
  }
}
