import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PUSH_TOKEN_KEY = "@swipeme_push_token";
const NOTIFICATION_PREFS_KEY = "@swipeme_notification_prefs";

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") {
    console.log("Push notifications not available on web");
    return null;
  }

  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Push notification permission not granted");
      return null;
    }

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

    return token.data;
  } catch (error) {
    console.error("Failed to register for push notifications:", error);
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
  channelId: string = "default"
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

export async function getNotificationPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function hasNotificationPermission(): Promise<boolean> {
  const status = await getNotificationPermissionStatus();
  return status === "granted";
}
