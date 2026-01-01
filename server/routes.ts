import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { randomBytes } from "crypto";
import { storage, verifyPassword } from "./storage";
import { sendVerificationEmail } from "./email";
import { 
  signupSchema, 
  verifyCodeSchema, 
  setPasswordSchema, 
  loginSchema, 
  waitlistSchema, 
  verify2FASchema,
  walletCreateSchema,
  walletImportSchema,
  transferSchema,
  signMessageSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  setUsernameSchema,
  usernameSchema
} from "@shared/schema";
import { z } from "zod";
import { logFailedLogin, logSuccessfulLogin, log2FAAttempt, logWalletAction } from "./logger";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { 
  generateWallet, 
  importWalletFromMnemonic, 
  importWalletFromPrivateKey,
  encryptSensitiveData,
  decryptSensitiveData,
  tempoTestnet,
  createWalletClientForAccount,
  transferERC20Token,
  signMessage,
  type TransferParams
} from "./wallet";
import { sendPaymentNotification, sendMessageNotification } from "./pushNotifications";
import { pool } from "./db";
import { realtimeService } from "./websocket";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

function requireSameUser(req: Request, res: Response, next: NextFunction) {
  const paramUserId = req.params.userId || req.params.id;
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.session.userId !== paramUserId) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Digital Asset Links for Android passkey association with swipeme.org
  // This file proves the app is authorized to create passkeys for this domain
  app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.json([{
      "relation": [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds"
      ],
      "target": {
        "namespace": "android_app",
        "package_name": "com.swipeme.app",
        "sha256_cert_fingerprints": [
          "58:53:7D:CA:D7:0C:9E:E5:A8:CE:23:D5:B4:77:3B:BB:8F:47:EA:5E:3A:4E:71:05:B0:B3:1C:A5:61:43:94:3E"
        ]
      }
    }]);
  });

  // Health check endpoint for monitoring and load balancer
  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      const start = Date.now();
      await pool.query("SELECT 1");
      const dbLatency = Date.now() - start;
      
      const poolStatus = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      };
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          latencyMs: dbLatency,
          pool: poolStatus,
        },
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: { connected: false },
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/auth/signup/start", async (req: Request, res: Response) => {
    try {
      const { email } = signupSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      const code = await storage.createVerificationCode(email, "signup");
      const sent = await sendVerificationEmail(email, code);
      
      if (!sent) {
        return res.status(500).json({ error: "Failed to send verification email" });
      }
      
      res.json({ success: true, message: "Verification code sent to your email" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Signup start error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/signup/verify", async (req: Request, res: Response) => {
    try {
      const { email, code } = verifyCodeSchema.parse(req.body);
      
      // Don't mark as used yet - just validate the code
      const isValid = await storage.verifyCode(email, code, "signup", false);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid or expired verification code" });
      }
      
      res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Verify code error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/signup/complete", async (req: Request, res: Response) => {
    try {
      const { email, code, password } = setPasswordSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      const isValid = await storage.verifyCode(email, code, "signup");
      if (!isValid) {
        return res.status(400).json({ error: "Invalid or expired verification code" });
      }
      
      const user = await storage.createUser(email, password);
      
      req.session.userId = user.id;
      req.session.email = user.email;
      
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          profileImage: user.profileImage,
          themePreference: user.themePreference,
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Signup complete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        logFailedLogin(email, clientIp, "User not found");
        return res.status(401).json({ error: "Incorrect email or password" });
      }
      
      const isValidPassword = await verifyPassword(password, user.password);
      if (!isValidPassword) {
        logFailedLogin(email, clientIp, "Invalid password");
        return res.status(401).json({ error: "Incorrect email or password" });
      }
      
      // Check if 2FA is enabled - require verification before creating session
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        return res.json({
          success: true,
          requires2FA: true,
          userId: user.id,
          message: "Please verify with your authenticator app"
        });
      }
      
      // No 2FA - create session immediately
      req.session.userId = user.id;
      req.session.email = user.email;
      logSuccessfulLogin(email, user.id, clientIp);
      
      res.json({ 
        success: true, 
        requires2FA: false,
        user: { 
          id: user.id, 
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          profileImage: user.profileImage,
          themePreference: user.themePreference,
          biometricEnabled: user.biometricEnabled,
          twoFactorEnabled: user.twoFactorEnabled,
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Password reset - request reset code
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(email);
      
      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({ 
          success: true, 
          message: "If an account exists with this email, a reset code has been sent" 
        });
      }
      
      // Create verification code for password reset
      const code = await storage.createVerificationCode(email, "password_reset");
      
      await sendVerificationEmail(email, code, "password_reset");
      
      res.json({ 
        success: true, 
        message: "If an account exists with this email, a reset code has been sent" 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Failed to send reset code" });
    }
  });

  // Password reset - verify code and set new password
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = resetPasswordSchema.parse(req.body);
      
      // Get user first - but don't reveal if they don't exist
      const user = await storage.getUserByEmail(email);
      
      // Verify the reset code - this marks it as used if valid
      const isValid = await storage.verifyCode(email, code, "password_reset", true);
      
      // Return same error message regardless of which check failed to prevent enumeration
      if (!isValid || !user) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }
      
      // Update the user's password
      await storage.updateUserPassword(user.id, newPassword);
      
      res.json({ 
        success: true, 
        message: "Password reset successfully. You can now log in with your new password." 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/auth/verify-2fa", async (req: Request, res: Response) => {
    try {
      const { userId, code } = verify2FASchema.parse(req.body);
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      
      const user = await storage.getUserById(userId);
      if (!user) {
        log2FAAttempt(userId, clientIp, false);
        return res.status(404).json({ error: "User not found" });
      }
      
      if (!user.twoFactorSecret) {
        return res.status(400).json({ error: "2FA not set up for this account" });
      }
      
      // Verify TOTP code
      const totp = new OTPAuth.TOTP({
        issuer: "SwipeMe",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: user.twoFactorSecret,
      });
      
      const delta = totp.validate({ token: code, window: 1 });
      if (delta === null) {
        log2FAAttempt(userId, clientIp, false);
        return res.status(401).json({ error: "Invalid verification code" });
      }
      
      // 2FA verified - create session
      req.session.userId = user.id;
      req.session.email = user.email;
      log2FAAttempt(userId, clientIp, true);
      logSuccessfulLogin(user.email, user.id, clientIp);
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          profileImage: user.profileImage,
          themePreference: user.themePreference,
          biometricEnabled: user.biometricEnabled,
          twoFactorEnabled: user.twoFactorEnabled,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("2FA verification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie("swipeme.sid");
      res.json({ success: true, message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/session", (req: Request, res: Response) => {
    if (req.session?.userId) {
      res.json({ 
        authenticated: true, 
        userId: req.session.userId,
        email: req.session.email 
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  app.get("/api/username/check", async (req: Request, res: Response) => {
    try {
      const username = req.query.username as string;
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      const normalizedUsername = username.toLowerCase().trim();
      const validation = usernameSchema.safeParse(normalizedUsername);
      if (!validation.success) {
        return res.json({ 
          available: false, 
          error: validation.error.errors[0].message 
        });
      }
      
      const existingUser = await storage.getUserByUsername(normalizedUsername);
      res.json({ available: !existingUser });
    } catch (error) {
      console.error("Username check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user/username", requireAuth, async (req: Request, res: Response) => {
    try {
      const { username } = setUsernameSchema.parse(req.body);
      const userId = req.session.userId!;
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({ error: "Username is already taken" });
      }
      
      const user = await storage.getUserById(userId);
      if (user?.username) {
        return res.status(400).json({ error: "Username cannot be changed once set" });
      }
      
      await storage.updateUserUsername(userId, username);
      res.json({ success: true, username });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Set username error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/waitlist", async (req: Request, res: Response) => {
    try {
      const { email } = waitlistSchema.parse(req.body);
      
      const existing = await storage.getWaitlistSignupByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "You're already on our waitlist!" });
      }
      
      await storage.createWaitlistSignup(email, "landing_page");
      res.json({ success: true, message: "You've been added to the waitlist!" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Waitlist signup error:", error);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/waitlist", requireAuth, async (_req: Request, res: Response) => {
    try {
      const signups = await storage.getAllWaitlistSignups();
      res.json({ signups });
    } catch (error) {
      console.error("Get waitlist error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/contacts/match", async (req: Request, res: Response) => {
    try {
      const { emails } = req.body;
      
      if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ error: "emails array is required" });
      }
      
      const matchedUsers = await storage.getUsersByEmails(emails);
      
      const usersWithWallets = await Promise.all(
        matchedUsers.map(async (user) => {
          const wallet = await storage.getWalletByUserId(user.id);
          return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            profileImage: user.profileImage,
            walletAddress: wallet?.address || null,
          };
        })
      );
      
      res.json(usersWithWallets);
    } catch (error) {
      console.error("Contact match error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/contacts/check", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email);
      
      if (user) {
        const wallet = await storage.getWalletByUserId(user.id);
        return res.json({
          exists: true,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            profileImage: user.profileImage,
            walletAddress: wallet?.address || null,
          },
        });
      }
      
      res.json({ exists: false });
    } catch (error) {
      console.error("Contact check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/:userId/public", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const wallet = await storage.getWalletByUserId(userId);
      
      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        profileImage: user.profileImage,
        walletAddress: wallet?.address || null,
        lastSeenAt: user.lastSeenAt,
      });
    } catch (error) {
      console.error("Get user public profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/users/:userId/push-token", requireSameUser, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { pushToken } = req.body;
      
      if (!pushToken || typeof pushToken !== "string") {
        return res.status(400).json({ error: "Push token is required" });
      }
      
      await storage.updateUser(userId, { pushToken });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Save push token error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/users/presence/ping", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      await storage.updateUserPresence(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Presence ping error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chats/:chatId/mute", requireAuth, async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;
      const { duration } = req.body;
      const userId = req.session.userId!;
      
      let mutedUntil: Date | null = null;
      
      if (duration === "forever") {
        mutedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
      } else if (duration === "1h") {
        mutedUntil = new Date(Date.now() + 60 * 60 * 1000);
      } else if (duration === "8h") {
        mutedUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);
      } else if (duration === "1d") {
        mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      } else if (duration === "1w") {
        mutedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else {
        return res.status(400).json({ error: "Invalid duration. Use: 1h, 8h, 1d, 1w, or forever" });
      }
      
      await storage.getOrCreateChatParticipant(chatId, userId);
      const success = await storage.setChatMute(chatId, userId, mutedUntil);
      
      res.json({ success, mutedUntil });
    } catch (error) {
      console.error("Mute chat error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/chats/:chatId/unmute", requireAuth, async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;
      const userId = req.session.userId!;
      
      const success = await storage.setChatMute(chatId, userId, null);
      res.json({ success });
    } catch (error) {
      console.error("Unmute chat error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/chats/:chatId/mute-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;
      const userId = req.session.userId!;
      
      const mutedUntil = await storage.getChatMuteStatus(chatId, userId);
      const isMuted = mutedUntil ? new Date(mutedUntil) > new Date() : false;
      
      res.json({ isMuted, mutedUntil });
    } catch (error) {
      console.error("Get mute status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Moments (Social Feed) endpoints
  app.get("/api/moments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const mode = req.query.mode as string || "chronological";
      
      if (mode === "recommended") {
        const { recommenderService } = await import("./recommender");
        const recommendations = await recommenderService.getRecommendedFeed(userId, limit);
        const postIds = recommendations.map(r => r.postId);
        
        if (postIds.length === 0) {
          return res.json([]);
        }
        
        const orderedPosts = await storage.getPostsByIds(postIds, userId);
        return res.json(orderedPosts);
      }
      
      const posts = await storage.getPosts(userId, limit, offset);
      res.json(posts);
    } catch (error) {
      console.error("Get moments error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { content, mediaUrls, mediaType, visibility } = req.body;
      
      if (!content && (!mediaUrls || mediaUrls.length === 0)) {
        return res.status(400).json({ error: "Content or media is required" });
      }
      
      const post = await storage.createPost(userId, content, mediaUrls, mediaType, visibility);
      res.json(post);
    } catch (error) {
      console.error("Create moment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/moments/:postId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { postId } = req.params;
      
      const post = await storage.getPostById(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      if (post.authorId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }
      
      await storage.deletePost(postId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete moment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moments/:postId/like", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { postId } = req.params;
      
      const post = await storage.getPostById(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      const isLiked = await storage.likePost(postId, userId);
      res.json({ isLiked });
    } catch (error) {
      console.error("Like moment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/moments/:postId/comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const { postId } = req.params;
      
      const comments = await storage.getPostComments(postId);
      res.json(comments);
    } catch (error) {
      console.error("Get comments error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moments/:postId/comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { postId } = req.params;
      const { content } = req.body;
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "Comment content is required" });
      }
      
      const post = await storage.getPostById(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      const comment = await storage.addPostComment(postId, userId, content.trim());
      const author = await storage.getUserById(userId);
      res.json({ ...comment, author });
    } catch (error) {
      console.error("Add comment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/moments/:postId/tip", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { postId } = req.params;
      const { amount, currency, tokenAddress } = req.body;
      
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid tip amount is required" });
      }
      
      const post = await storage.getPostById(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      // Get tipper's wallet
      const tipperWallet = await storage.getWalletByUserId(userId);
      if (!tipperWallet) {
        return res.status(400).json({ error: "You need a wallet to send tips" });
      }
      
      // Get post author's wallet
      const authorWallet = await storage.getWalletByUserId(post.authorId);
      if (!authorWallet) {
        return res.status(400).json({ error: "Post author does not have a wallet to receive tips" });
      }
      
      // TREASURY-FIRST MODEL: 100% of tips go to treasury
      // Creators can only withdraw once per week on Mondays
      const tipAmount = parseFloat(amount);
      
      // Use pathUSD by default (decimals: 6 for Tempo stablecoins)
      const tipTokenAddress = tokenAddress || "0x20c0000000000000000000000000000000000000";
      const decimals = 6;
      
      // Get platform treasury address
      const treasuryAddress = process.env.PLATFORM_TREASURY_ADDRESS;
      if (!treasuryAddress) {
        return res.status(500).json({ error: "Platform treasury not configured" });
      }
      
      // Get signing key for tipper
      let signingKey: string;
      if (tipperWallet.encryptedPrivateKey) {
        signingKey = decryptSensitiveData(tipperWallet.encryptedPrivateKey);
      } else if (tipperWallet.encryptedSeedPhrase) {
        signingKey = decryptSensitiveData(tipperWallet.encryptedSeedPhrase);
      } else {
        return res.status(400).json({ error: "No signing key available for your wallet" });
      }
      
      const walletClient = createWalletClientForAccount(signingKey);
      
      // Send 100% of tip to platform treasury (creators withdraw weekly on Mondays)
      const txHash = await transferERC20Token(walletClient, {
        tokenAddress: tipTokenAddress,
        toAddress: treasuryAddress,
        amount: tipAmount.toFixed(6),
        decimals,
      } as TransferParams);
      
      // Record the tip in database
      const tip = await storage.addPostTip(postId, userId, amount, currency || "pathUSD", txHash);
      
      // Record revenue in ledger (full amount held in treasury for creator)
      await storage.recordRevenueEntry({
        tipId: tip.id,
        revenueSource: 'tip_fee',
        grossAmount: tipAmount.toFixed(6),
        feeAmount: tipAmount.toFixed(6),
        feePercentage: "100",
        netToRecipient: "0",
        currency: currency || "pathUSD",
        tempoTxHash: txHash,
        feeTxHash: txHash,
        feeCollected: true,
      });
      
      // Update creator balance - full amount is tracked as pending (held in treasury)
      await storage.updateCreatorBalance(post.authorId, tipAmount.toFixed(6), "0");
      
      // Send notification to author
      const author = await storage.getUserById(post.authorId);
      if (author?.pushToken) {
        const tipper = await storage.getUserById(userId);
        const tipperUsername = tipper?.username || tipper?.displayName || "Someone";
        sendPaymentNotification(
          author.pushToken,
          tipperUsername,
          amount,
          currency || "pathUSD",
          txHash
        ).catch(err => console.error("Tip notification error:", err));
      }
      
      const explorerUrl = `${tempoTestnet.blockExplorers?.default.url || "https://explorer.testnet.tempo.xyz"}/tx/${txHash}`;
      
      res.json({ 
        ...tip, 
        txHash,
        explorer: explorerUrl,
        tipAmount: tipAmount.toFixed(6),
        heldInTreasury: true,
        withdrawableOn: "Monday",
        success: true 
      });
    } catch (error) {
      console.error("Tip moment error:", error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Tip transaction failed" });
    }
  });

  app.post("/api/moments/:postId/engagement", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { postId } = req.params;
      const { eventType, durationMs, wasSkipped } = req.body;
      
      if (!eventType) {
        return res.status(400).json({ error: "Event type is required" });
      }
      
      console.log(`Engagement: ${eventType} on post ${postId} by user ${userId}`, {
        durationMs,
        wasSkipped
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Engagement tracking error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Follow/Unfollow routes
  app.post("/api/users/:userId/follow", requireAuth, async (req: Request, res: Response) => {
    try {
      const followerId = req.session.userId!;
      const followingId = req.params.userId;
      
      if (followerId === followingId) {
        return res.status(400).json({ error: "You cannot follow yourself" });
      }
      
      const targetUser = await storage.getUserById(followingId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      await storage.followUser(followerId, followingId);
      res.json({ success: true, following: true });
    } catch (error) {
      console.error("Follow error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/users/:userId/follow", requireAuth, async (req: Request, res: Response) => {
    try {
      const followerId = req.session.userId!;
      const followingId = req.params.userId;
      
      await storage.unfollowUser(followerId, followingId);
      res.json({ success: true, following: false });
    } catch (error) {
      console.error("Unfollow error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/:userId/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const viewerId = req.session.userId!;
      const userId = req.params.userId;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const [followersCount, followingCount, isFollowing, posts] = await Promise.all([
        storage.getFollowersCount(userId),
        storage.getFollowingCount(userId),
        storage.isFollowing(viewerId, userId),
        storage.getPostsByUser(userId, viewerId, 20, 0)
      ]);
      
      res.json({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        profileImage: user.profileImage,
        status: user.status,
        followersCount,
        followingCount,
        isFollowing,
        posts
      });
    } catch (error) {
      console.error("Get user profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/:userId/posts", requireAuth, async (req: Request, res: Response) => {
    try {
      const viewerId = req.session.userId!;
      const userId = req.params.userId;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const posts = await storage.getPostsByUser(userId, viewerId, limit, offset);
      res.json(posts);
    } catch (error) {
      console.error("Get user posts error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/:userId/followers", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const followers = await storage.getFollowers(userId);
      res.json(followers.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        profileImage: u.profileImage
      })));
    } catch (error) {
      console.error("Get followers error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/:userId/following", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const following = await storage.getFollowing(userId);
      res.json(following.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        profileImage: u.profileImage
      })));
    } catch (error) {
      console.error("Get following error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/notify/message", requireAuth, async (req: Request, res: Response) => {
    try {
      const { recipientId, message, chatId } = req.body;
      const senderId = req.session.userId;
      
      if (!recipientId || !message || !chatId) {
        return res.status(400).json({ error: "Recipient ID, message, and chat ID are required" });
      }
      
      // Verify sender is a participant in this chat
      const isParticipant = await storage.isChatParticipant(chatId, senderId!);
      if (!isParticipant) {
        return res.status(403).json({ error: "You are not a participant in this chat" });
      }
      
      // Verify recipient is also a participant
      const recipientIsParticipant = await storage.isChatParticipant(chatId, recipientId);
      if (!recipientIsParticipant) {
        return res.status(400).json({ error: "Recipient is not in this chat" });
      }
      
      const recipient = await storage.getUserById(recipientId);
      if (!recipient?.pushToken) {
        return res.json({ success: false, reason: "Recipient has no push token" });
      }
      
      const sender = await storage.getUserById(senderId!);
      const senderUsername = sender?.username || sender?.displayName || sender?.email?.split("@")[0] || "Someone";
      
      // Truncate message for security
      const truncatedMessage = message.length > 100 ? message.slice(0, 97) + "..." : message;
      
      const sent = await sendMessageNotification(
        recipient.pushToken,
        senderUsername,
        truncatedMessage,
        chatId
      );
      
      res.json({ success: sent });
    } catch (error) {
      console.error("Send notification error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/contacts/invite", requireAuth, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const userId = req.session.userId;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const inviter = await storage.getUserById(userId!);
      const inviterName = inviter?.displayName || inviter?.email?.split("@")[0] || "A friend";
      
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "This person is already on SwipeMe" });
      }
      
      const { getResendClient } = await import("./email");
      const { client } = await getResendClient();
      
      const result = await client.emails.send({
        from: "SwipeMe <noreply@swipeme.org>",
        to: email,
        subject: `${inviterName} invited you to SwipeMe`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 32px;">
              <img src="https://swipeme.org/assets/images/icon.png" alt="SwipeMe" style="width: 80px; height: 80px; border-radius: 20px;" />
            </div>
            
            <h1 style="color: #000000; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
              ${inviterName} wants to chat on SwipeMe
            </h1>
            
            <p style="color: #536471; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
              SwipeMe is a fast, simple, and secure way to chat and send money to your friends. Join now and start chatting with ${inviterName}!
            </p>
            
            <div style="text-align: center; margin-bottom: 24px;">
              <a href="https://swipeme.org" style="display: inline-block; background-color: #0066FF; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Join SwipeMe
              </a>
            </div>
            
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.5; margin: 0; text-align: center;">
              This invitation was sent by ${inviterName} via SwipeMe.
            </p>
          </div>
        `
      });
      
      if (result.error) {
        console.error("Failed to send invite:", result.error);
        return res.status(500).json({ error: "Failed to send invitation" });
      }
      
      res.json({ success: true, message: "Invitation sent successfully" });
    } catch (error) {
      console.error("Invite error:", error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  app.get("/api/user/:id", requireSameUser, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          profileImage: user.profileImage,
          status: user.status,
          twitterLink: user.twitterLink,
          telegramLink: user.telegramLink,
          themePreference: user.themePreference,
          biometricEnabled: user.biometricEnabled,
          twoFactorEnabled: user.twoFactorEnabled,
        } 
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/user/:id", requireSameUser, async (req: Request, res: Response) => {
    try {
      const { displayName, profileImage, status, twitterLink, telegramLink, themePreference, biometricEnabled, twoFactorEnabled, twoFactorSecret } = req.body;
      
      const user = await storage.updateUser(req.params.id, {
        displayName,
        profileImage,
        status,
        twitterLink,
        telegramLink,
        themePreference,
        biometricEnabled,
        twoFactorEnabled,
        twoFactorSecret,
      });
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ 
        success: true,
        user: { 
          id: user.id, 
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          profileImage: user.profileImage,
          status: user.status,
          twitterLink: user.twitterLink,
          telegramLink: user.telegramLink,
          themePreference: user.themePreference,
          biometricEnabled: user.biometricEnabled,
          twoFactorEnabled: user.twoFactorEnabled,
        } 
      });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const email = req.query.email as string;
      
      if (!email || email.trim().length === 0) {
        return res.json({ users: [] });
      }
      
      const searchEmail = email.trim().toLowerCase();
      const currentUserId = req.session?.userId;
      
      const user = await storage.getUserByEmail(searchEmail);
      
      if (!user || user.id === currentUserId) {
        return res.json({ users: [] });
      }
      
      const wallet = await storage.getWalletByUserId(user.id);
      
      res.json({
        users: [{
          id: user.id,
          email: user.email,
          name: user.displayName || undefined,
          walletAddress: wallet?.address,
        }]
      });
    } catch (error) {
      console.error("Search users error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/users/search-username", requireAuth, async (req: Request, res: Response) => {
    try {
      const username = req.query.username as string;
      
      if (!username || username.trim().length === 0) {
        return res.json({ users: [] });
      }
      
      const searchQuery = username.trim().toLowerCase().replace(/^@/, "");
      const currentUserId = req.session?.userId;
      
      const matchedUsers = await storage.searchUsersByUsername(searchQuery, currentUserId, 20);
      
      const usersWithWallets = await Promise.all(
        matchedUsers.map(async user => {
          const wallet = await storage.getWalletByUserId(user.id);
          return {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.displayName || undefined,
            walletAddress: wallet?.address,
          };
        })
      );
      
      res.json({ users: usersWithWallets });
    } catch (error) {
      console.error("Search users by username error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/users/check-batch", requireAuth, async (req: Request, res: Response) => {
    try {
      const { emails } = req.body;
      
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.json({ users: [] });
      }
      
      const validEmails = emails
        .filter((e: unknown) => typeof e === "string" && e.trim().length > 0)
        .map((e: string) => e.trim().toLowerCase())
        .slice(0, 500);
      
      if (validEmails.length === 0) {
        return res.json({ users: [] });
      }
      
      const currentUserId = req.session?.userId;
      
      const matchedUsers = await storage.getUsersByEmails(validEmails);
      
      const filteredUsers = matchedUsers.filter(user => user.id !== currentUserId);
      
      const foundUsers = await Promise.all(
        filteredUsers.map(async user => {
          const wallet = await storage.getWalletByUserId(user.id);
          return {
            id: user.id,
            email: user.email,
            name: user.displayName || undefined,
            walletAddress: wallet?.address,
          };
        })
      );
      
      res.json({ users: foundUsers });
    } catch (error) {
      console.error("Check batch users error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/wallet/:userId", requireSameUser, async (req: Request, res: Response) => {
    try {
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) {
        return res.json({ wallet: null });
      }
      
      res.json({ 
        wallet: { 
          id: wallet.id, 
          address: wallet.address,
          isImported: wallet.isImported,
          createdAt: wallet.createdAt,
        } 
      });
    } catch (error) {
      console.error("Get wallet error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/wallet/create", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = walletCreateSchema.parse(req.body);
      
      const existingWallet = await storage.getWalletByUserId(userId);
      if (existingWallet) {
        logWalletAction("CREATE", userId, false, "Wallet already exists");
        return res.status(400).json({ error: "Wallet already exists" });
      }
      
      const { address, mnemonic } = generateWallet();
      
      const encryptedSeedPhrase = encryptSensitiveData(mnemonic);
      
      const wallet = await storage.createWallet(
        userId, 
        address, 
        undefined,
        encryptedSeedPhrase, 
        false
      );
      
      logWalletAction("CREATE", userId, true, `Address: ${address.slice(0, 10)}...`);
      
      res.json({ 
        success: true,
        wallet: { 
          id: wallet.id, 
          address: wallet.address,
          isImported: wallet.isImported,
          createdAt: wallet.createdAt,
        },
        network: {
          name: tempoTestnet.name,
          chainId: tempoTestnet.id,
        }
      });
    } catch (error) {
      const userId = req.body?.userId || "unknown";
      if (error instanceof z.ZodError) {
        logWalletAction("CREATE", userId, false, "Validation failed");
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Create wallet error:", error);
      logWalletAction("CREATE", userId, false, error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/wallet/import", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId, seedPhrase, privateKey } = walletImportSchema.parse(req.body);
      
      const existingWallet = await storage.getWalletByUserId(userId);
      if (existingWallet) {
        logWalletAction("IMPORT", userId, false, "Wallet already exists");
        return res.status(400).json({ error: "Wallet already exists" });
      }
      
      let address: string;
      let encryptedSeedPhrase: string | undefined = undefined;
      let encryptedPrivateKey: string | undefined = undefined;
      
      if (seedPhrase) {
        const result = importWalletFromMnemonic(seedPhrase);
        address = result.address;
        encryptedSeedPhrase = encryptSensitiveData(result.mnemonic);
      } else if (privateKey) {
        const result = importWalletFromPrivateKey(privateKey);
        address = result.address;
        encryptedPrivateKey = encryptSensitiveData(result.privateKey);
      } else {
        return res.status(400).json({ error: "Seed phrase or private key is required" });
      }
      
      const wallet = await storage.createWallet(
        userId, 
        address, 
        encryptedPrivateKey,
        encryptedSeedPhrase, 
        true
      );
      
      logWalletAction("IMPORT", userId, true, `Address: ${address.slice(0, 10)}...`);
      
      res.json({ 
        success: true,
        wallet: { 
          id: wallet.id, 
          address: wallet.address,
          isImported: wallet.isImported,
          createdAt: wallet.createdAt,
        },
        network: {
          name: tempoTestnet.name,
          chainId: tempoTestnet.id,
        }
      });
    } catch (error) {
      const userId = req.body?.userId || "unknown";
      if (error instanceof z.ZodError) {
        logWalletAction("IMPORT", userId, false, "Validation failed");
        return res.status(400).json({ error: error.errors[0].message });
      }
      if (error instanceof Error) {
        logWalletAction("IMPORT", userId, false, error.message);
        return res.status(400).json({ error: error.message });
      }
      console.error("Import wallet error:", error);
      logWalletAction("IMPORT", userId, false, "Unknown error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/wallet/:userId", requireSameUser, async (req: Request, res: Response) => {
    try {
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) {
        logWalletAction("DELETE", req.params.userId, false, "Wallet not found");
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      await storage.deleteWallet(req.params.userId);
      
      logWalletAction("DELETE", req.params.userId, true, "Wallet deleted");
      
      res.json({ 
        success: true,
        message: "Wallet deleted successfully. You can recover it by importing your seed phrase or private key.",
      });
    } catch (error) {
      console.error("Delete wallet error:", error);
      logWalletAction("DELETE", req.params.userId, false, error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/wallet/:userId/recovery", requireSameUser, async (req: Request, res: Response) => {
    try {
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      if (!wallet.encryptedSeedPhrase) {
        return res.status(404).json({ error: "Recovery phrase not available for imported wallets" });
      }
      
      // Decrypt the seed phrase on the server before returning
      const decryptedSeedPhrase = decryptSensitiveData(wallet.encryptedSeedPhrase);
      
      res.json({ 
        success: true,
        seedPhrase: decryptedSeedPhrase,
      });
    } catch (error) {
      console.error("Get recovery phrase error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/wallet/:userId/transfer", requireSameUser, async (req: Request, res: Response) => {
    try {
      const { tokenAddress, toAddress, amount, decimals } = transferSchema.parse(req.body);
      const userId = req.params.userId;
      
      const wallet = await storage.getWalletByUserId(userId);
      if (!wallet) {
        logWalletAction("TRANSFER", userId, false, "Wallet not found");
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      // Get the private key or seed phrase to sign the transaction
      let signingKey: string;
      if (wallet.encryptedPrivateKey) {
        signingKey = decryptSensitiveData(wallet.encryptedPrivateKey);
      } else if (wallet.encryptedSeedPhrase) {
        signingKey = decryptSensitiveData(wallet.encryptedSeedPhrase);
      } else {
        logWalletAction("TRANSFER", userId, false, "No signing key");
        return res.status(400).json({ error: "No signing key available for this wallet" });
      }
      
      // Create wallet client
      const walletClient = createWalletClientForAccount(signingKey);
      
      // Check if recipient is a platform user (P2P payment with fee)
      const recipientWallet = await storage.getWalletByAddress(toAddress);
      let platformFee = "0";
      let netToRecipient = amount;
      let txHash: string;
      let feeTxHash = "";
      
      if (recipientWallet) {
        // P2P payment with 1% fee - ON-CHAIN FEE COLLECTION
        const P2P_FEE_PERCENTAGE = 1;
        const grossAmount = parseFloat(amount);
        const feeAmount = grossAmount * (P2P_FEE_PERCENTAGE / 100);
        platformFee = feeAmount.toFixed(6);
        netToRecipient = (grossAmount - feeAmount).toFixed(6);
        
        // Get platform treasury address
        const treasuryAddress = process.env.PLATFORM_TREASURY_ADDRESS;
        if (!treasuryAddress) {
          return res.status(500).json({ error: "Platform treasury not configured" });
        }
        
        // Transaction 1: Send net amount to recipient
        txHash = await transferERC20Token(walletClient, {
          tokenAddress,
          toAddress,
          amount: netToRecipient,
          decimals,
        } as TransferParams);
        
        // Transaction 2: Send fee to platform treasury
        if (feeAmount > 0) {
          try {
            feeTxHash = await transferERC20Token(walletClient, {
              tokenAddress,
              toAddress: treasuryAddress,
              amount: platformFee,
              decimals,
            } as TransferParams);
          } catch (feeError) {
            console.error("Fee transfer failed (recipient still received funds):", feeError);
          }
        }
        
        // Record P2P fee in revenue ledger (fee collected on-chain)
        await storage.recordRevenueEntry({
          revenueSource: 'p2p_fee',
          grossAmount: grossAmount.toFixed(6),
          feeAmount: platformFee,
          feePercentage: P2P_FEE_PERCENTAGE.toString(),
          netToRecipient,
          currency: "pathUSD",
          tempoTxHash: txHash,
          feeTxHash: feeTxHash || undefined,
          feeCollected: feeTxHash ? true : false,
        });
        
        // Send notification
        const recipient = await storage.getUserById(recipientWallet.userId);
        if (recipient?.pushToken) {
          const sender = await storage.getUserById(userId);
          const senderUsername = sender?.username || sender?.displayName || sender?.email?.split("@")[0] || "Someone";
          sendPaymentNotification(
            recipient.pushToken,
            senderUsername,
            netToRecipient,
            "USD",
            txHash
          ).catch(err => console.error("Push notification error:", err));
        }
      } else {
        // External transfer - no platform fee
        txHash = await transferERC20Token(walletClient, {
          tokenAddress,
          toAddress,
          amount,
          decimals,
        } as TransferParams);
      }
      
      logWalletAction("TRANSFER", userId, true, `To: ${toAddress.slice(0, 10)}... Amount: ${amount}`);
      
      const explorerUrl = `${tempoTestnet.blockExplorers?.default.url || "https://explorer.testnet.tempo.xyz"}/tx/${txHash}`;
      
      res.json({
        success: true,
        txHash,
        explorer: explorerUrl,
        platformFee,
        netToRecipient,
        feeCollected: feeTxHash ? true : false,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Transfer error:", error);
      if (error instanceof Error) {
        logWalletAction("TRANSFER", req.params.userId, false, error.message);
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Transaction failed" });
    }
  });

  // Sign a message for XMTP authentication (server-side signing keeps private key secure)
  app.post("/api/wallet/:userId/sign", requireSameUser, async (req: Request, res: Response) => {
    try {
      const { message } = signMessageSchema.parse(req.body);
      const userId = req.params.userId;
      
      const wallet = await storage.getWalletByUserId(userId);
      if (!wallet) {
        logWalletAction("SIGN", userId, false, "Wallet not found");
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      // Get the private key or seed phrase to sign the message
      let signingKey: string;
      if (wallet.encryptedPrivateKey) {
        signingKey = decryptSensitiveData(wallet.encryptedPrivateKey);
      } else if (wallet.encryptedSeedPhrase) {
        signingKey = decryptSensitiveData(wallet.encryptedSeedPhrase);
      } else {
        logWalletAction("SIGN", userId, false, "No signing key");
        return res.status(400).json({ error: "No signing key available for this wallet" });
      }
      
      const signature = await signMessage(signingKey, message);
      
      logWalletAction("SIGN", userId, true, "Message signed");
      
      res.json({
        success: true,
        signature,
      });
    } catch (error) {
      const userId = req.params.userId;
      if (error instanceof z.ZodError) {
        logWalletAction("SIGN", userId, false, "Validation failed");
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Sign message error:", error);
      if (error instanceof Error) {
        logWalletAction("SIGN", userId, false, error.message);
        return res.status(400).json({ error: error.message });
      }
      logWalletAction("SIGN", userId, false, "Unknown error");
      res.status(500).json({ error: "Failed to sign message" });
    }
  });

  app.get("/api/qrcode/:address", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      
      if (!address || !address.startsWith("0x") || address.length !== 42) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      const qrCodeDataUrl = await QRCode.toDataURL(address, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      
      res.json({ qrCode: qrCodeDataUrl });
    } catch (error) {
      console.error("QR code generation error:", error);
      res.status(500).json({ error: "Failed to generate QR code" });
    }
  });

  app.post("/api/2fa/setup", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const secret = new OTPAuth.Secret({ size: 20 });
      
      const totp = new OTPAuth.TOTP({
        issuer: "SwipeMe",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: secret,
      });
      
      const otpauthUrl = totp.toString();
      
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
      
      res.json({ 
        success: true,
        secret: secret.base32,
        qrCode: qrCodeDataUrl,
        otpauthUrl: otpauthUrl,
      });
    } catch (error) {
      console.error("2FA setup error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/2fa/verify", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId, secret, code } = req.body;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const totp = new OTPAuth.TOTP({
        issuer: "SwipeMe",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      
      const delta = totp.validate({ token: code, window: 1 });
      
      if (delta === null) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      await storage.updateUser(userId, { 
        twoFactorEnabled: true,
        twoFactorSecret: secret,
      });
      
      res.json({ success: true, message: "2FA enabled successfully" });
    } catch (error) {
      console.error("2FA verify error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/2fa/disable", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId, code } = req.body;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (!user.twoFactorSecret) {
        return res.status(400).json({ error: "2FA is not enabled" });
      }
      
      const totp = new OTPAuth.TOTP({
        issuer: "SwipeMe",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
      });
      
      const delta = totp.validate({ token: code, window: 1 });
      
      if (delta === null) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      await storage.updateUser(userId, { 
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });
      
      res.json({ success: true, message: "2FA disabled successfully" });
    } catch (error) {
      console.error("2FA disable error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Passkey endpoints
  app.post("/api/auth/passkey/check", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ hasPasskey: false });
      }
      
      const hasPasskey = await storage.hasPasskey(user.id);
      res.json({ hasPasskey, userId: hasPasskey ? user.id : null });
    } catch (error) {
      console.error("Passkey check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/passkey/register/options", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUserById(userId!);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Generate challenge for WebAuthn
      const challenge = Buffer.from(randomBytes(32)).toString("base64url");
      
      // Store challenge in session for verification
      req.session.passkeyChallenge = challenge;
      
      // Use swipeme.org as the RP ID for passkeys (requires assetlinks.json on that domain)
      const rpId = "swipeme.org";
      
      res.json({
        success: true,
        options: {
          challenge,
          rp: {
            name: "SwipeMe",
            id: rpId,
          },
          user: {
            // Android Credential Manager requires user.id to be base64url-encoded binary
            // Convert UUID hex to binary bytes, then encode as base64url
            id: Buffer.from(user.id.replace(/-/g, ""), "hex").toString("base64url"),
            name: user.email,
            displayName: user.displayName || user.email,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },   // ES256
            { type: "public-key", alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "required",
          },
          timeout: 60000,
        }
      });
    } catch (error) {
      console.error("Passkey register options error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/passkey/register/complete", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const { credentialId, publicKey, deviceName } = req.body;
      
      if (!credentialId || !publicKey) {
        return res.status(400).json({ error: "Missing credential data" });
      }
      
      // Store the passkey
      const passkey = await storage.createPasskey(
        userId!,
        credentialId,
        publicKey,
        deviceName || "Device"
      );
      
      // Clear the challenge
      delete req.session.passkeyChallenge;
      
      res.json({
        success: true,
        message: "Passkey registered successfully",
        passkey: {
          id: passkey.id,
          deviceName: passkey.deviceName,
          createdAt: passkey.createdAt,
        }
      });
    } catch (error) {
      console.error("Passkey register complete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/passkey/login/options", async (req: Request, res: Response) => {
    try {
      const challenge = Buffer.from(randomBytes(32)).toString("base64url");
      
      // Store challenge in session for verification (with expiration)
      req.session.passkeyLoginChallenge = challenge;
      req.session.passkeyLoginChallengeExpiry = Date.now() + 60000; // 60 seconds
      
      // Use swipeme.org as the RP ID for passkeys (requires assetlinks.json on that domain)
      const rpId = "swipeme.org";
      
      res.json({
        success: true,
        options: {
          challenge,
          timeout: 60000,
          rpId,
          userVerification: "required",
        }
      });
    } catch (error) {
      console.error("Passkey login options error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/passkey/login", async (req: Request, res: Response) => {
    try {
      const { credentialId, rawId, authenticatorData, clientDataJSON, signature } = req.body;
      
      if (!credentialId || !rawId || !authenticatorData || !clientDataJSON || !signature) {
        return res.status(400).json({ error: "Missing required assertion data" });
      }
      
      // Verify server-stored challenge exists and hasn't expired
      const storedChallenge = req.session.passkeyLoginChallenge;
      const challengeExpiry = req.session.passkeyLoginChallengeExpiry;
      
      if (!storedChallenge || !challengeExpiry) {
        return res.status(401).json({ error: "No pending passkey authentication. Please try again." });
      }
      
      if (Date.now() > challengeExpiry) {
        delete req.session.passkeyLoginChallenge;
        delete req.session.passkeyLoginChallengeExpiry;
        return res.status(401).json({ error: "Authentication expired. Please try again." });
      }
      
      // Immediately invalidate the challenge (one-time use)
      const expectedChallenge = storedChallenge;
      delete req.session.passkeyLoginChallenge;
      delete req.session.passkeyLoginChallengeExpiry;
      
      // Find the passkey
      const passkey = await storage.getPasskeyByCredentialId(credentialId);
      if (!passkey) {
        return res.status(401).json({ error: "Passkey not recognized" });
      }
      
      // Get the user
      const user = await storage.getUserById(passkey.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Build the authentication response for verification
      const authenticationResponse: AuthenticationResponseJSON = {
        id: credentialId,
        rawId: rawId,
        type: "public-key",
        response: {
          authenticatorData,
          clientDataJSON,
          signature,
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
      
      // Use swipeme.org as the RP ID for passkeys (must match registration options)
      const rpID = "swipeme.org";
      // Origin must match the app's associated domain
      const origin = "https://swipeme.org";
      
      // Verify the authentication response cryptographically
      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: authenticationResponse,
          expectedChallenge: expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: passkey.credentialId,
            publicKey: Buffer.from(passkey.publicKey, "base64url"),
            counter: 0, // We're not tracking counters in MVP
          },
        });
      } catch (verifyError: any) {
        console.error("Passkey verification error:", verifyError.message);
        return res.status(401).json({ error: "Passkey verification failed: " + verifyError.message });
      }
      
      if (!verification.verified) {
        console.error("Passkey verification failed - signature invalid");
        return res.status(401).json({ error: "Passkey verification failed" });
      }
      
      // Create session - passkey login bypasses 2FA (passkey is already strong auth)
      req.session.userId = user.id;
      req.session.email = user.email;
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          profileImage: user.profileImage,
          themePreference: user.themePreference,
          biometricEnabled: user.biometricEnabled,
          twoFactorEnabled: user.twoFactorEnabled,
        }
      });
    } catch (error) {
      console.error("Passkey login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/auth/passkeys", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const passkeys = await storage.getPasskeysByUserId(userId!);
      
      res.json({
        passkeys: passkeys.map(p => ({
          id: p.id,
          deviceName: p.deviceName,
          createdAt: p.createdAt,
        }))
      });
    } catch (error) {
      console.error("Get passkeys error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/auth/passkey/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const passkeyId = req.params.id;
      await storage.deletePasskey(passkeyId);
      res.json({ success: true, message: "Passkey deleted successfully" });
    } catch (error) {
      console.error("Delete passkey error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Creator earnings endpoints
  app.get("/api/creators/me/earnings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      const balance = await storage.getCreatorBalance(userId);
      const withdrawals = await storage.getCreatorWithdrawals(userId, 10);
      const wallet = await storage.getWalletByUserId(userId);
      
      // Calculate withdrawal window info (Monday-only withdrawals)
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
      const isMonday = dayOfWeek === 1;
      const daysUntilMonday = isMonday ? 0 : (dayOfWeek === 0 ? 1 : 8 - dayOfWeek);
      const nextMonday = new Date(now);
      if (!isMonday) {
        nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
      }
      nextMonday.setUTCHours(0, 0, 0, 0);
      
      const withdrawalWindow = {
        canWithdrawNow: isMonday,
        nextWithdrawalDate: nextMonday.toISOString(),
        daysUntilWithdrawal: daysUntilMonday,
        withdrawalDay: "Monday",
      };
      
      if (!balance) {
        return res.json({
          creatorId: userId,
          totalEarned: "0",
          totalWithdrawn: "0",
          pendingBalance: "0",
          totalTipsReceived: "0",
          totalFeesPaid: "0",
          walletAddress: wallet?.address || null,
          recentWithdrawals: [],
          withdrawalWindow,
        });
      }
      
      res.json({
        creatorId: userId,
        totalEarned: balance.totalEarned,
        totalWithdrawn: balance.totalWithdrawn,
        pendingBalance: balance.pendingBalance,
        totalTipsReceived: balance.totalTipsReceived,
        totalFeesPaid: balance.totalFeesPaid,
        lastWithdrawalAt: balance.lastWithdrawalAt,
        walletAddress: wallet?.address || null,
        recentWithdrawals: withdrawals.map(w => ({
          id: w.id,
          amount: w.amount,
          currency: w.currency,
          status: w.status,
          tempoTxHash: w.tempoTxHash,
          createdAt: w.createdAt,
          completedAt: w.completedAt,
        })),
        withdrawalWindow,
      });
    } catch (error) {
      console.error("Get creator earnings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/creators/me/withdraw", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { amount, currency = "pathUSD" } = req.body;
      
      // MONDAY-ONLY WITHDRAWALS: Check if today is Monday (UTC)
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
      const isMonday = dayOfWeek === 1;
      
      if (!isMonday) {
        // Calculate next Monday
        const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        const nextMonday = new Date(now);
        nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
        nextMonday.setUTCHours(0, 0, 0, 0);
        
        return res.status(400).json({ 
          error: "Withdrawals are only available on Mondays",
          nextWithdrawalDate: nextMonday.toISOString(),
          daysUntilWithdrawal: daysUntilMonday
        });
      }
      
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Valid withdrawal amount is required" });
      }
      
      const balance = await storage.getCreatorBalance(userId);
      if (!balance) {
        return res.status(400).json({ error: "No earnings to withdraw" });
      }
      
      const pendingBalance = parseFloat(balance.pendingBalance);
      const withdrawAmount = parseFloat(amount);
      
      if (withdrawAmount > pendingBalance) {
        return res.status(400).json({ 
          error: "Insufficient balance", 
          pendingBalance: balance.pendingBalance 
        });
      }
      
      const wallet = await storage.getWalletByUserId(userId);
      if (!wallet) {
        return res.status(400).json({ error: "No wallet found for withdrawal" });
      }
      
      // Create withdrawal record
      const withdrawal = await storage.createWithdrawal({
        creatorId: userId,
        amount: amount,
        currency,
        destinationWallet: wallet.address,
      });
      
      // Process the withdrawal (deduct from pending balance)
      await storage.processWithdrawal(userId, amount);
      
      // Mark as completed (in production, this would involve actual blockchain transfer)
      const completedWithdrawal = await storage.updateWithdrawalStatus(
        withdrawal.id, 
        'completed'
      );
      
      res.json({
        success: true,
        withdrawal: {
          id: completedWithdrawal.id,
          amount: completedWithdrawal.amount,
          currency: completedWithdrawal.currency,
          status: completedWithdrawal.status,
          destinationWallet: completedWithdrawal.destinationWallet,
          createdAt: completedWithdrawal.createdAt,
          completedAt: completedWithdrawal.completedAt,
        },
      });
    } catch (error) {
      console.error("Creator withdrawal error:", error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Withdrawal failed" });
    }
  });

  // Revenue dashboard endpoints (admin/analytics)
  app.get("/api/revenue/stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getRevenueStats();
      res.json(stats);
    } catch (error) {
      console.error("Get revenue stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/revenue/ledger", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const entries = await storage.getRecentRevenueLedger(limit);
      res.json({ entries });
    } catch (error) {
      console.error("Get revenue ledger error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/realtime/token", requireAuth, (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const token = realtimeService.generateAuthToken(userId);
      res.json({ token });
    } catch (error) {
      console.error("Generate realtime token error:", error);
      res.status(500).json({ error: "Failed to generate realtime token" });
    }
  });

  app.get("/api/realtime/status/:userId", requireAuth, (req: Request, res: Response) => {
    const { userId } = req.params;
    const isOnline = realtimeService.isUserOnline(userId);
    res.json({ userId, isOnline });
  });

  const httpServer = createServer(app);
  
  realtimeService.initialize(httpServer);
  
  return httpServer;
}
