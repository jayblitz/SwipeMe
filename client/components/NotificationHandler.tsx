import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import { 
  addNotificationResponseListener,
  clearBadge,
} from "@/lib/notifications";

export function NotificationHandler() {
  const navigation = useNavigation<any>();
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    notificationResponseListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      
      if (!data) return;
      
      clearBadge();
      
      if (data.type === "message" && data.chatId) {
        navigation.navigate("MainTabs", {
          screen: "Chats",
          params: {
            screen: "Chat",
            params: { chatId: data.chatId },
          },
        });
      } else if (data.type === "payment") {
        navigation.navigate("MainTabs", {
          screen: "Wallet",
        });
      }
    });

    return () => {
      notificationResponseListener.current?.remove();
    };
  }, [navigation]);

  return null;
}
