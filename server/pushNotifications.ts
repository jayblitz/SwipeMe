
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
  senderUsername: string,
  amount: string,
  currency: string,
  txHash?: string
): Promise<boolean> {
  const title = "You just got swiped!";
  const displayName = senderUsername.startsWith("@") ? senderUsername : `@${senderUsername}`;
  const body = `${displayName} swiped you $${amount} ${currency}`;

  return sendPushNotification(
    pushToken,
    title,
    body,
    { type: "payment", amount, currency, txHash },
    "payments"
  );
}

export async function sendXMTPWakeupNotification(
  pushToken: string,
  senderName: string,
  conversationId: string
): Promise<boolean> {
  return sendPushNotification(
    pushToken,
    senderName,
    "New encrypted message",
    { 
      type: "xmtp_wakeup", 
      conversationId,
      action: "fetch_messages"
    },
    "messages"
  );
}

export async function sendSilentWakeup(
  pushToken: string,
  data: Record<string, unknown>
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    return false;
  }

  const message = {
    to: pushToken,
    data: { ...data, _contentAvailable: true },
    priority: "high" as const,
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
    return result.data?.status !== "error";
  } catch (error) {
    console.error("Failed to send silent wakeup:", error);
    return false;
  }
}

export async function sendLikeNotification(
  pushToken: string,
  likerUsername: string,
  postId: string
): Promise<boolean> {
  const displayName = likerUsername.startsWith("@") ? likerUsername : `@${likerUsername}`;
  
  return sendPushNotification(
    pushToken,
    "New Like",
    `${displayName} liked your moment`,
    { type: "post_like", postId },
    "moments"
  );
}

export async function sendCommentNotification(
  pushToken: string,
  commenterUsername: string,
  commentPreview: string,
  postId: string
): Promise<boolean> {
  const displayName = commenterUsername.startsWith("@") ? commenterUsername : `@${commenterUsername}`;
  const truncatedComment = commentPreview.length > 50 
    ? commentPreview.slice(0, 47) + "..." 
    : commentPreview;
  
  return sendPushNotification(
    pushToken,
    "New Comment",
    `${displayName}: ${truncatedComment}`,
    { type: "post_comment", postId },
    "moments"
  );
}

export async function sendTipNotification(
  pushToken: string,
  tipperUsername: string,
  amount: string,
  postId: string
): Promise<boolean> {
  const displayName = tipperUsername.startsWith("@") ? tipperUsername : `@${tipperUsername}`;
  
  return sendPushNotification(
    pushToken,
    "You got tipped!",
    `${displayName} tipped you $${amount} on your moment`,
    { type: "post_tip", postId, amount },
    "moments"
  );
}
