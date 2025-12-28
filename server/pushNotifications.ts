
interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
}

interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: {
    error?: string;
  };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId: string = "default"
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    console.log("Invalid push token:", pushToken?.slice(0, 20));
    return false;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    title,
    body,
    data,
    sound: "default",
    channelId,
    priority: "high",
  };

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json() as { data: ExpoPushReceipt };
    
    if (result.data?.status === "error") {
      console.error("Push notification error:", result.data.message);
      return false;
    }

    console.log("Push notification sent successfully to:", pushToken.slice(0, 30));
    return true;
  } catch (error) {
    console.error("Failed to send push notification:", error);
    return false;
  }
}

export async function sendMessageNotification(
  pushToken: string,
  senderName: string,
  messagePreview: string,
  chatId: string
): Promise<boolean> {
  const truncatedMessage = messagePreview.length > 100 
    ? messagePreview.slice(0, 97) + "..." 
    : messagePreview;

  return sendPushNotification(
    pushToken,
    senderName,
    truncatedMessage,
    { type: "message", chatId },
    "messages"
  );
}

export async function sendPaymentNotification(
  pushToken: string,
  senderName: string,
  amount: string,
  currency: string,
  txHash?: string
): Promise<boolean> {
  const title = "Payment Received";
  const body = `${senderName} sent you $${amount} ${currency}`;

  return sendPushNotification(
    pushToken,
    title,
    body,
    { type: "payment", amount, currency, txHash },
    "payments"
  );
}
