import { eq, and, gt, desc } from "drizzle-orm";
import { db } from "./db";
import { 
  users, 
  verificationCodes, 
  wallets, 
  contacts, 
  chats, 
  chatParticipants, 
  messages, 
  transactions,
  waitlistSignups,
  type User,
  type VerificationCode,
  type Wallet,
  type WaitlistSignup
} from "@shared/schema";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return salt + ":" + derivedKey.toString("hex");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const keyBuffer = Buffer.from(key, "hex");
  return timingSafeEqual(derivedKey, keyBuffer);
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const storage = {
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  },

  async createUser(email: string, password: string): Promise<User> {
    const hashedPassword = await hashPassword(password);
    const [user] = await db.insert(users).values({
      email: email.toLowerCase(),
      password: hashedPassword,
    }).returning();
    return user;
  },

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  },

  async createVerificationCode(email: string, type: string = "signup"): Promise<string> {
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await db.update(verificationCodes)
      .set({ used: true })
      .where(and(
        eq(verificationCodes.email, email.toLowerCase()),
        eq(verificationCodes.type, type),
        eq(verificationCodes.used, false)
      ));
    
    await db.insert(verificationCodes).values({
      email: email.toLowerCase(),
      code,
      type,
      expiresAt,
    });
    
    return code;
  },

  async verifyCode(email: string, code: string, type: string = "signup", markAsUsed: boolean = true): Promise<boolean> {
    const [verification] = await db.select()
      .from(verificationCodes)
      .where(and(
        eq(verificationCodes.email, email.toLowerCase()),
        eq(verificationCodes.code, code),
        eq(verificationCodes.type, type),
        eq(verificationCodes.used, false),
        gt(verificationCodes.expiresAt, new Date())
      ));
    
    if (!verification) return false;
    
    if (markAsUsed) {
      await db.update(verificationCodes)
        .set({ used: true })
        .where(eq(verificationCodes.id, verification.id));
    }
    
    return true;
  },

  async getWalletByUserId(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return wallet;
  },

  async createWallet(userId: string, address: string, encryptedPrivateKey?: string, encryptedSeedPhrase?: string, isImported: boolean = false): Promise<Wallet> {
    const [wallet] = await db.insert(wallets).values({
      userId,
      address,
      encryptedPrivateKey,
      encryptedSeedPhrase,
      isImported,
    }).returning();
    return wallet;
  },

  async updateWallet(id: string, data: Partial<Wallet>): Promise<Wallet | undefined> {
    const [wallet] = await db.update(wallets)
      .set(data)
      .where(eq(wallets.id, id))
      .returning();
    return wallet;
  },

  async deleteWallet(userId: string): Promise<boolean> {
    const result = await db.delete(wallets).where(eq(wallets.userId, userId));
    return true;
  },

  async createWaitlistSignup(email: string, source: string = "landing_page"): Promise<WaitlistSignup> {
    const [signup] = await db.insert(waitlistSignups).values({
      email: email.toLowerCase(),
      source,
    }).returning();
    return signup;
  },

  async getWaitlistSignupByEmail(email: string): Promise<WaitlistSignup | undefined> {
    const [signup] = await db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email.toLowerCase()));
    return signup;
  },

  async getAllWaitlistSignups(): Promise<WaitlistSignup[]> {
    return await db.select().from(waitlistSignups).orderBy(desc(waitlistSignups.createdAt));
  },
};
