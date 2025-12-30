import { eq, and, gt, desc, inArray, lt, or, ilike, ne } from "drizzle-orm";
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
  posts,
  postLikes,
  postComments,
  postTips,
  type User,
  type VerificationCode,
  type Wallet,
  type WaitlistSignup,
  type Passkey,
  type ChatParticipant,
  type Post,
  type PostComment,
  type PostTip
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

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
    return user;
  },

  async searchUsersByUsername(query: string, excludeUserId?: string, limit: number = 20): Promise<User[]> {
    if (!query || query.trim().length === 0) return [];
    const searchPattern = `${query.toLowerCase()}%`;
    const conditions = [ilike(users.username, searchPattern)];
    if (excludeUserId) {
      conditions.push(ne(users.id, excludeUserId));
    }
    const matchedUsers = await db.select()
      .from(users)
      .where(and(...conditions))
      .limit(limit);
    return matchedUsers;
  },

  async updateUserUsername(id: string, username: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ username: username.toLowerCase(), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
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

  async isChatParticipant(chatId: string, userId: string): Promise<boolean> {
    const [participant] = await db.select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );
    return !!participant;
  },

  async updateUserPresence(userId: string): Promise<void> {
    await db.update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, userId));
  },

  async setChatMute(chatId: string, userId: string, mutedUntil: Date | null): Promise<boolean> {
    const result = await db.update(chatParticipants)
      .set({ mutedUntil })
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      )
      .returning();
    return result.length > 0;
  },

  async getChatMuteStatus(chatId: string, userId: string): Promise<Date | null> {
    const [participant] = await db.select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );
    return participant?.mutedUntil || null;
  },

  async getOrCreateChatParticipant(chatId: string, userId: string): Promise<ChatParticipant> {
    const [existing] = await db.select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );
    
    if (existing) return existing;
    
    const [newParticipant] = await db.insert(chatParticipants)
      .values({ chatId, userId })
      .returning();
    return newParticipant;
  },

  // Moments (Social Feed) methods
  async createPost(authorId: string, content?: string, mediaUrls?: string[], visibility?: string): Promise<Post> {
    const [post] = await db.insert(posts)
      .values({
        authorId,
        content: content || null,
        mediaUrls: mediaUrls || null,
        visibility: visibility || "public",
      })
      .returning();
    return post;
  },

  async getPosts(userId: string, limit: number = 50, offset: number = 0): Promise<(Post & { author: User; isLiked: boolean })[]> {
    const allPosts = await db.select()
      .from(posts)
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    const postsWithAuthors = await Promise.all(
      allPosts.map(async (post) => {
        const author = await this.getUserById(post.authorId);
        const [like] = await db.select()
          .from(postLikes)
          .where(and(eq(postLikes.postId, post.id), eq(postLikes.userId, userId)));
        return {
          ...post,
          author: author!,
          isLiked: !!like,
        };
      })
    );
    return postsWithAuthors;
  },

  async getPostById(postId: string): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    return post;
  },

  async deletePost(postId: string): Promise<boolean> {
    const result = await db.delete(posts).where(eq(posts.id, postId)).returning();
    return result.length > 0;
  },

  async likePost(postId: string, userId: string): Promise<boolean> {
    const [existing] = await db.select()
      .from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    
    if (existing) {
      await db.delete(postLikes)
        .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
      const post = await this.getPostById(postId);
      if (post) {
        const newCount = Math.max(0, parseInt(post.likesCount || "0") - 1);
        await db.update(posts).set({ likesCount: newCount.toString() }).where(eq(posts.id, postId));
      }
      return false;
    } else {
      await db.insert(postLikes).values({ postId, userId });
      const post = await this.getPostById(postId);
      if (post) {
        const newCount = parseInt(post.likesCount || "0") + 1;
        await db.update(posts).set({ likesCount: newCount.toString() }).where(eq(posts.id, postId));
      }
      return true;
    }
  },

  async getPostComments(postId: string): Promise<(PostComment & { author: User })[]> {
    const allComments = await db.select()
      .from(postComments)
      .where(eq(postComments.postId, postId))
      .orderBy(desc(postComments.createdAt));

    const commentsWithAuthors = await Promise.all(
      allComments.map(async (comment) => {
        const author = await this.getUserById(comment.authorId);
        return { ...comment, author: author! };
      })
    );
    return commentsWithAuthors;
  },

  async addPostComment(postId: string, authorId: string, content: string): Promise<PostComment> {
    const [comment] = await db.insert(postComments)
      .values({ postId, authorId, content })
      .returning();
    
    const post = await this.getPostById(postId);
    if (post) {
      const newCount = parseInt(post.commentsCount || "0") + 1;
      await db.update(posts).set({ commentsCount: newCount.toString() }).where(eq(posts.id, postId));
    }
    return comment;
  },

  async addPostTip(postId: string, fromUserId: string, amount: string, currency: string = "pathUSD", txHash?: string): Promise<PostTip> {
    const [tip] = await db.insert(postTips)
      .values({ postId, fromUserId, amount, currency, txHash: txHash || null })
      .returning();
    
    const post = await this.getPostById(postId);
    if (post) {
      const currentTotal = parseFloat(post.tipsTotal || "0");
      const newTotal = currentTotal + parseFloat(amount);
      await db.update(posts).set({ tipsTotal: newTotal.toString() }).where(eq(posts.id, postId));
    }
    return tip;
  },
};
