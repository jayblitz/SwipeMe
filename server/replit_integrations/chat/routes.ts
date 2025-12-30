import type { Express, Request, Response } from "express";
import { chatStorage } from "./storage";

// This is using Replit's AI Integrations service with OpenRouter, which provides access to xAI Grok models
// without requiring your own API key. Charges are billed to your Replit credits.
const getOpenRouterClient = async () => {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  });
};

// Helper to get user ID from session (optional auth - works with or without session)
function getUserId(req: Request): string | null {
  return (req.session as any)?.userId || null;
}

// Helper to check conversation ownership
function hasAccess(conversation: { userId: string | null; accessKey: string | null }, userId: string | null, accessKey: string | null): boolean {
  if (conversation.userId) {
    return conversation.userId === userId;
  }
  if (conversation.accessKey) {
    return conversation.accessKey === accessKey;
  }
  return false;
}

// Get accessKey from request headers or body
function getAccessKey(req: Request): string | null {
  return (req.headers["x-access-key"] as string) || req.body?.accessKey || null;
}

// Strip accessKey from conversation objects to prevent leaking
function sanitizeConversation(conversation: any): any {
  const { accessKey, ...safe } = conversation;
  return safe;
}

export function registerChatRoutes(app: Express): void {
  // Get all AI conversations for the current user (only returns user-owned conversations)
  app.get("/api/ai/conversations", async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const conversations = await chatStorage.getConversationsByUser(userId);
      // Strip accessKey from all conversations to prevent leaking
      res.json(conversations.map(sanitizeConversation));
    } catch (error) {
      console.error("Error fetching AI conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single AI conversation with messages (scoped by user or accessKey)
  app.get("/api/ai/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const accessKey = getAccessKey(req);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (!hasAccess(conversation, userId, accessKey)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      // Strip accessKey from response
      res.json({ ...sanitizeConversation(conversation), messages });
    } catch (error) {
      console.error("Error fetching AI conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Get messages for a conversation (scoped by user or accessKey)
  app.get("/api/ai/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const accessKey = getAccessKey(req);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (!hasAccess(conversation, userId, accessKey)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching AI messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Create new AI conversation (tied to current user or generates accessKey for anonymous)
  app.post("/api/ai/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const userId = getUserId(req);
      const conversation = await chatStorage.createConversation(title || "New Chat", userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating AI conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete AI conversation (scoped by user or accessKey)
  app.delete("/api/ai/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = getUserId(req);
      const accessKey = getAccessKey(req);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (!hasAccess(conversation, userId, accessKey)) {
        return res.status(403).json({ error: "Access denied" });
      }
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting AI conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming) using Grok
  app.post("/api/ai/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;
      const userId = getUserId(req);
      const accessKey = getAccessKey(req);
      
      // Verify conversation ownership
      const conversation = await chatStorage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (!hasAccess(conversation, userId, accessKey)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Use xAI Grok model via OpenRouter
      const model = "x-ai/grok-beta";

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      
      // Build chat messages with system prompt for SwipeMe AI assistant
      const systemPrompt = `You are SwipeMe AI, a helpful assistant integrated into the SwipeMe super app. SwipeMe is a WeChat-inspired app that combines encrypted messaging with blockchain-based P2P payments on the Tempo testnet.

You can help users with:
- Understanding how to use their crypto wallet (balances, sending/receiving tokens)
- Explaining blockchain concepts and transactions
- Navigating the app's features (Chats, Wallet, Discover, Moments, Profile)
- General questions and conversations

Be friendly, concise, and helpful. When discussing crypto, emphasize security best practices.`;

      const chatMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from Grok via OpenRouter
      const openrouter = await getOpenRouterClient();
      const stream = await openrouter.chat.completions.create({
        model,
        messages: chatMessages,
        stream: true,
        max_tokens: 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || "";
        if (chunkContent) {
          fullResponse += chunkContent;
          res.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
        }
      }

      // Save assistant message
      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending AI message:", error);
      // Check if headers already sent (SSE streaming started)
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });

  // Streaming chat endpoint with automatic conversation management
  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    try {
      const { message, conversationId } = req.body;
      const userId = getUserId(req);
      const accessKey = getAccessKey(req);
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Create or get conversation
      let convId = conversationId;
      let newAccessKey: string | null = null;
      
      if (!convId) {
        const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
        const conversation = await chatStorage.createConversation(title, userId);
        convId = conversation.id;
        newAccessKey = conversation.accessKey;
      } else {
        const conversation = await chatStorage.getConversation(convId);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }
        if (!hasAccess(conversation, userId, accessKey)) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Save user message
      await chatStorage.createMessage(convId, "user", message);

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(convId);

      const systemPrompt = `You are SwipeMe AI, a helpful assistant integrated into the SwipeMe super app. SwipeMe is a WeChat-inspired app that combines encrypted messaging with blockchain-based P2P payments on the Tempo testnet.

You can help users with:
- Understanding how to use their crypto wallet (balances, sending/receiving tokens)
- Explaining blockchain concepts and transactions
- Navigating the app's features (Chats, Wallet, Discover, Moments, Profile)
- General questions and conversations

Be friendly, concise, and helpful. When discussing crypto, emphasize security best practices.`;

      const chatMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // Set up SSE for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send conversation ID and accessKey (for anonymous users) first
      const initData: { conversationId: number; accessKey?: string } = { conversationId: convId };
      if (newAccessKey) {
        initData.accessKey = newAccessKey;
      }
      res.write(`data: ${JSON.stringify(initData)}\n\n`);

      // Stream response from Grok via OpenRouter
      const openrouter = await getOpenRouterClient();
      const stream = await openrouter.chat.completions.create({
        model: "x-ai/grok-beta",
        messages: chatMessages,
        stream: true,
        max_tokens: 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || "";
        if (chunkContent) {
          fullResponse += chunkContent;
          res.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
        }
      }

      // Save assistant message
      await chatStorage.createMessage(convId, "assistant", fullResponse);

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in AI chat:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get AI response" });
      }
    }
  });
}
