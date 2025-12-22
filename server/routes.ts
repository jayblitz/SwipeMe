import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { storage, verifyPassword } from "./storage";
import { sendVerificationEmail } from "./email";
import { signupSchema, verifyCodeSchema, setPasswordSchema, loginSchema } from "@shared/schema";
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
  tempoTestnet
} from "./wallet";

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
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/user/:id", async (req: Request, res: Response) => {
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

  app.put("/api/user/:id", async (req: Request, res: Response) => {
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

  app.get("/api/wallet/:userId", async (req: Request, res: Response) => {
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

  app.post("/api/wallet/create", async (req: Request, res: Response) => {
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

  app.post("/api/wallet/privy", async (req: Request, res: Response) => {
    try {
      const { userId, privyUserId, walletAddress, accessToken } = req.body;
      
      if (!userId || !walletAddress) {
        return res.status(400).json({ error: "User ID and wallet address are required" });
      }
      
      const existingWallet = await storage.getWalletByUserId(userId);
      if (existingWallet) {
        return res.status(400).json({ error: "Wallet already exists" });
      }
      
      const wallet = await storage.createWallet(
        userId, 
        walletAddress, 
        undefined,
        undefined, 
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
      console.error("Privy wallet link error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/wallet/import", async (req: Request, res: Response) => {
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

  app.get("/api/wallet/:userId/recovery", async (req: Request, res: Response) => {
    try {
      const wallet = await storage.getWalletByUserId(req.params.userId);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      if (!wallet.encryptedSeedPhrase) {
        return res.status(404).json({ error: "Recovery phrase not available for imported wallets" });
      }
      
      res.json({ 
        success: true,
        encryptedSeedPhrase: wallet.encryptedSeedPhrase,
      });
    } catch (error) {
      console.error("Get recovery phrase error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/2fa/setup", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const secret = new OTPAuth.Secret({ size: 20 });
      
      const totp = new OTPAuth.TOTP({
        issuer: "TempoChat",
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

  app.post("/api/2fa/verify", async (req: Request, res: Response) => {
    try {
      const { userId, secret, code } = req.body;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const totp = new OTPAuth.TOTP({
        issuer: "TempoChat",
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

  app.post("/api/2fa/disable", async (req: Request, res: Response) => {
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
        issuer: "TempoChat",
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
