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

export function registerChatRoutes(app: Express): void {
  // Get all AI conversations
  app.get("/api/ai/conversations", async (_req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching AI conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single AI conversation with messages
  app.get("/api/ai/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching AI conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new AI conversation
  app.post("/api/ai/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating AI conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete AI conversation
  app.delete("/api/ai/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
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

  // Simple chat endpoint for one-off messages (non-streaming)
  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const systemPrompt = `You are SwipeMe AI, a helpful assistant in a crypto payment and messaging app. Be concise and helpful.`;

      const openrouter = await getOpenRouterClient();
      const response = await openrouter.chat.completions.create({
        model: "x-ai/grok-beta",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 1024,
      });

      const reply = response.choices[0]?.message?.content || "I couldn't generate a response.";
      res.json({ reply });
    } catch (error) {
      console.error("Error in AI chat:", error);
      res.status(500).json({ error: "Failed to get AI response" });
    }
  });
}
