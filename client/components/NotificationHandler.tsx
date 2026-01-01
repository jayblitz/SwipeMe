import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { 
  addNotificationResponseListener,
  addNotificationReceivedListener,
  clearBadge,
} from "@/lib/notifications";

export function NotificationHandler() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);
  const notificationReceivedListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    notificationReceivedListener.current = addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown>;
      
      if (!data) return;
      
      if (data.type === "xmtp_wakeup" && data.action === "fetch_messages") {
        queryClient.invalidateQueries({ queryKey: ["/api/xmtp/conversations"] });
        if (data.conversationId) {
          queryClient.invalidateQueries({ 
            queryKey: ["/api/xmtp/conversations", data.conversationId, "messages"] 
          });
        }
      }
    });

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
      } else if (data.type === "xmtp_wakeup" && data.conversationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/xmtp/conversations"] });
        navigation.navigate("MainTabs", {
          screen: "Chats",
          params: {
            screen: "Chat",
            params: { chatId: data.conversationId },
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
      notificationReceivedListener.current?.remove();
    };
  }, [navigation, queryClient]);

  return null;
}
