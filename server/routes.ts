import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { storage, verifyPassword } from "./storage";
import { sendVerificationEmail } from "./email";
import { signupSchema, verifyCodeSchema, setPasswordSchema, loginSchema, waitlistSchema, verify2FASchema } from "@shared/schema";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { 
  generateWallet, 
  importWalletFromMnemonic, 
  importWalletFromPrivateKey,
  encryptSensitiveData,
  decryptSensitiveData,
  getBalance,
  tempoTestnet,
  createWalletClientForAccount,
  transferERC20Token,
  signMessage,
  type TransferParams
} from "./wallet";

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
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Incorrect email or password" });
      }
      
      const isValidPassword = await verifyPassword(password, user.password);
      if (!isValidPassword) {
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
      
      res.json({ 
        success: true, 
        requires2FA: false,
        user: { 
          id: user.id, 
          email: user.email,
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

  app.post("/api/auth/verify-2fa", async (req: Request, res: Response) => {
    try {
      const { userId, code } = verify2FASchema.parse(req.body);
      
      const user = await storage.getUserById(userId);
      if (!user) {
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
        return res.status(401).json({ error: "Invalid verification code" });
      }
      
      // 2FA verified - create session
      req.session.userId = user.id;
      req.session.email = user.email;
      
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
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

  app.get("/api/waitlist", requireAuth, async (req: Request, res: Response) => {
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
      const { emails, phones } = req.body;
      
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
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      const existingWallet = await storage.getWalletByUserId(userId);
      if (existingWallet) {
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
      console.error("Create wallet error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/wallet/import", requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId, seedPhrase, privateKey } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      if (!seedPhrase && !privateKey) {
        return res.status(400).json({ error: "Seed phrase or private key is required" });
      }
      
      const existingWallet = await storage.getWalletByUserId(userId);
      if (existingWallet) {
        return res.status(400).json({ error: "Wallet already exists" });
      }
      
      let address: string;
      let encryptedSeedPhrase: string | undefined = undefined;
      let encryptedPrivateKey: string | undefined = undefined;
      
      if (seedPhrase) {
        const result = importWalletFromMnemonic(seedPhrase);
        address = result.address;
        encryptedSeedPhrase = encryptSensitiveData(result.mnemonic);
      } else {
        const result = importWalletFromPrivateKey(privateKey);
        address = result.address;
        encryptedPrivateKey = encryptSensitiveData(result.privateKey);
      }
      
      const wallet = await storage.createWallet(
        userId, 
        address, 
        encryptedPrivateKey,
        encryptedSeedPhrase, 
        true
      );
      
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
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Import wallet error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/wallet/:userId", requireSameUser, async (req: Request, res: Response) => {
    try {
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      await storage.deleteWallet(req.params.userId);
      
      res.json({ 
        success: true,
        message: "Wallet deleted successfully. You can recover it by importing your seed phrase or private key.",
      });
    } catch (error) {
      console.error("Delete wallet error:", error);
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
      const { tokenAddress, toAddress, amount, decimals } = req.body;
      
      if (!tokenAddress || !toAddress || !amount || decimals === undefined) {
        return res.status(400).json({ error: "Missing required fields: tokenAddress, toAddress, amount, decimals" });
      }
      
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      // Get the private key or seed phrase to sign the transaction
      let signingKey: string;
      if (wallet.encryptedPrivateKey) {
        signingKey = decryptSensitiveData(wallet.encryptedPrivateKey);
      } else if (wallet.encryptedSeedPhrase) {
        signingKey = decryptSensitiveData(wallet.encryptedSeedPhrase);
      } else {
        return res.status(400).json({ error: "No signing key available for this wallet" });
      }
      
      // Create wallet client and send transaction
      const walletClient = createWalletClientForAccount(signingKey);
      
      const txHash = await transferERC20Token(walletClient, {
        tokenAddress,
        toAddress,
        amount,
        decimals,
      } as TransferParams);
      
      res.json({
        success: true,
        txHash,
        explorer: `${tempoTestnet.blockExplorers?.default.url || "https://explorer.testnet.tempo.xyz"}/tx/${txHash}`,
      });
    } catch (error) {
      console.error("Transfer error:", error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Transaction failed" });
    }
  });

  // Sign a message for XMTP authentication (server-side signing keeps private key secure)
  app.post("/api/wallet/:userId/sign", requireSameUser, async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }
      
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      // Get the private key or seed phrase to sign the message
      let signingKey: string;
      if (wallet.encryptedPrivateKey) {
        signingKey = decryptSensitiveData(wallet.encryptedPrivateKey);
      } else if (wallet.encryptedSeedPhrase) {
        signingKey = decryptSensitiveData(wallet.encryptedSeedPhrase);
      } else {
        return res.status(400).json({ error: "No signing key available for this wallet" });
      }
      
      const signature = await signMessage(signingKey, message);
      
      res.json({
        success: true,
        signature,
      });
    } catch (error) {
      console.error("Sign message error:", error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
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

  const httpServer = createServer(app);
  return httpServer;
}
