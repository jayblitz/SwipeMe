import { eq, and, gt, desc, inArray, lt, or } from "drizzle-orm";
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
  passkeys,
  type User,
  type VerificationCode,
  type Wallet,
  type WaitlistSignup,
  type Passkey
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
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 900000;
  return (100000 + num).toString();
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

  async getUsersByEmails(emails: string[]): Promise<User[]> {
    if (emails.length === 0) return [];
    const normalizedEmails = emails.map(e => e.toLowerCase());
    const matchedUsers = await db.select().from(users).where(inArray(users.email, normalizedEmails));
    return matchedUsers;
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

  async updateUserPassword(id: string, newPassword: string): Promise<User | undefined> {
    const hashedPassword = await hashPassword(newPassword);
    const [user] = await db.update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
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

  async getWalletByAddress(address: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, address.toLowerCase()));
    if (wallet) return wallet;
    const [checksumWallet] = await db.select().from(wallets).where(eq(wallets.address, address));
    return checksumWallet;
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

  // Paginated query pattern for scaling (keyset pagination with composite cursor)
  // Cursor format: "timestamp|id" for tie-breaking on same-timestamp records
  async getWaitlistSignupsPaginated(limit: number = 50, cursor?: string): Promise<{
    items: WaitlistSignup[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    let results: WaitlistSignup[];
    
    if (cursor) {
      const [timestampStr, lastId] = cursor.split("|");
      const cursorTime = new Date(timestampStr);
      // Keyset pagination: (createdAt < cursor) OR (createdAt = cursor AND id < lastId)
      results = await db.select().from(waitlistSignups)
        .where(
          or(
            lt(waitlistSignups.createdAt, cursorTime),
            and(
              eq(waitlistSignups.createdAt, cursorTime),
              lt(waitlistSignups.id, lastId)
            )
          )
        )
        .orderBy(desc(waitlistSignups.createdAt), desc(waitlistSignups.id))
        .limit(limit + 1);
    } else {
      results = await db.select().from(waitlistSignups)
        .orderBy(desc(waitlistSignups.createdAt), desc(waitlistSignups.id))
        .limit(limit + 1);
    }
    
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, -1) : results;
    // Build composite cursor: "timestamp|id"
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem?.createdAt 
      ? `${lastItem.createdAt.toISOString()}|${lastItem.id}`
      : null;
    
    return { items, nextCursor, hasMore };
  },

  async createPasskey(userId: string, credentialId: string, publicKey: string, deviceName?: string): Promise<Passkey> {
    const [passkey] = await db.insert(passkeys).values({
      userId,
      credentialId,
      publicKey,
      deviceName,
    }).returning();
    return passkey;
  },

  async getPasskeyByCredentialId(credentialId: string): Promise<Passkey | undefined> {
    const [passkey] = await db.select().from(passkeys).where(eq(passkeys.credentialId, credentialId));
    return passkey;
  },

  async getPasskeysByUserId(userId: string): Promise<Passkey[]> {
    return await db.select().from(passkeys).where(eq(passkeys.userId, userId));
  },

  async updatePasskeyCounter(credentialId: string, counter: string): Promise<void> {
    await db.update(passkeys)
      .set({ counter })
      .where(eq(passkeys.credentialId, credentialId));
  },

  async deletePasskey(id: string): Promise<boolean> {
    await db.delete(passkeys).where(eq(passkeys.id, id));
    return true;
  },

  async hasPasskey(userId: string): Promise<boolean> {
    const userPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
    return userPasskeys.length > 0;
  },
};
