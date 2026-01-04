import { eq, and, gt, gte, desc, inArray, lt, or, ilike, ne, count, sql } from "drizzle-orm";
import { db } from "./db";
import { 
  users, 
  verificationCodes, 
  wallets, 
  chats,
  chatParticipants, 
  waitlistSignups,
  passkeys,
  follows,
  posts,
  postLikes,
  postComments,
  postTips,
  revenueLedger,
  creatorBalances,
  creatorWithdrawals,
  type User,
  type Wallet,
  type WaitlistSignup,
  type Passkey,
  type Chat,
  type ChatParticipant,
  type Follow,
  type Post,
  type PostComment,
  type PostTip,
  type RevenueLedger,
  type CreatorBalance,
  type CreatorWithdrawal
} from "@shared/schema";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
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
    await db.delete(wallets).where(eq(wallets.userId, userId));
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
  parseHashtags(content: string | null | undefined): string[] {
    if (!content) return [];
    const hashtagRegex = /#(\w+)/g;
    const matches = content.match(hashtagRegex);
    if (!matches) return [];
    return [...new Set(matches.map(tag => tag.slice(1).toLowerCase()))];
  },

  async createPost(
    authorId: string, 
    content?: string, 
    mediaUrls?: string[], 
    mediaType?: string, 
    visibility?: string,
    thumbnailUrl?: string,
    durationSeconds?: number
  ): Promise<Post> {
    const hashtags = this.parseHashtags(content);
    
    const [post] = await db.insert(posts)
      .values({
        authorId,
        content: content || null,
        mediaUrls: mediaUrls || null,
        mediaType: mediaType || "text",
        visibility: visibility || "public",
        thumbnailUrl: thumbnailUrl || null,
        durationSeconds: durationSeconds || null,
        hashtags: hashtags.length > 0 ? hashtags : null,
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

  async getPostsByIds(postIds: string[], viewerId: string): Promise<(Post & { author: User; isLiked: boolean })[]> {
    if (postIds.length === 0) return [];
    
    const allPosts = await db.select()
      .from(posts)
      .where(inArray(posts.id, postIds));
    
    const postsById = new Map(allPosts.map(p => [p.id, p]));
    
    const orderedPosts = postIds
      .map(id => postsById.get(id))
      .filter((p): p is Post => p !== undefined);
    
    const postsWithAuthors = await Promise.all(
      orderedPosts.map(async (post) => {
        const author = await this.getUserById(post.authorId);
        const [like] = await db.select()
          .from(postLikes)
          .where(and(eq(postLikes.postId, post.id), eq(postLikes.userId, viewerId)));
        return {
          ...post,
          author: author!,
          isLiked: !!like,
        };
      })
    );
    return postsWithAuthors;
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

  async incrementPostShares(postId: string): Promise<void> {
    const post = await this.getPostById(postId);
    if (post) {
      const currentShares = parseInt((post as any).sharesCount || "0");
      await db.update(posts).set({ 
        sharesCount: (currentShares + 1).toString() 
      } as any).where(eq(posts.id, postId));
    }
  },

  async getTrendingHashtags(limit: number = 10): Promise<{ hashtag: string; count: number; postCount: number }[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await db.select({
      hashtags: posts.hashtags,
    })
      .from(posts)
      .where(and(
        eq(posts.visibility, "public"),
        gte(posts.createdAt, oneDayAgo),
        sql`${posts.hashtags} IS NOT NULL`
      ));
    
    const hashtagCounts = new Map<string, number>();
    
    for (const row of result) {
      const tags = row.hashtags as string[] | null;
      if (tags) {
        for (const tag of tags) {
          hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
        }
      }
    }
    
    const sorted = [...hashtagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([hashtag, count]) => ({
        hashtag,
        count,
        postCount: count,
      }));
    
    return sorted;
  },

  async getPostsByHashtag(hashtag: string, userId: string, limit: number = 50, offset: number = 0): Promise<(Post & { author: User; isLiked: boolean })[]> {
    const normalizedTag = hashtag.toLowerCase().replace(/^#/, "");
    
    const allPosts = await db.select()
      .from(posts)
      .where(and(
        eq(posts.visibility, "public"),
        sql`${posts.hashtags} @> ${JSON.stringify([normalizedTag])}`
      ))
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

  async followUser(followerId: string, followingId: string): Promise<Follow | null> {
    if (followerId === followingId) return null;
    const [existing] = await db.select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    if (existing) return existing;
    const [follow] = await db.insert(follows)
      .values({ followerId, followingId })
      .returning();
    return follow;
  },

  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    const result = await db.delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .returning();
    return result.length > 0;
  },

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [existing] = await db.select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    return !!existing;
  },

  async getFollowersCount(userId: string): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(follows)
      .where(eq(follows.followingId, userId));
    return result?.count ?? 0;
  },

  async getFollowingCount(userId: string): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(follows)
      .where(eq(follows.followerId, userId));
    return result?.count ?? 0;
  },

  async getFollowers(userId: string, limit: number = 50): Promise<User[]> {
    const followerRecords = await db.select()
      .from(follows)
      .where(eq(follows.followingId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(limit);
    const followerIds = followerRecords.map(f => f.followerId);
    if (followerIds.length === 0) return [];
    const followerUsers = await db.select().from(users).where(inArray(users.id, followerIds));
    return followerUsers;
  },

  async getFollowing(userId: string, limit: number = 50): Promise<User[]> {
    const followingRecords = await db.select()
      .from(follows)
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt))
      .limit(limit);
    const followingIds = followingRecords.map(f => f.followingId);
    if (followingIds.length === 0) return [];
    const followingUsers = await db.select().from(users).where(inArray(users.id, followingIds));
    return followingUsers;
  },

  async getPostsByUser(userId: string, viewerId: string, limit: number = 20, offset: number = 0): Promise<(Post & { author: User; isLiked: boolean })[]> {
    const userPosts = await db.select()
      .from(posts)
      .where(eq(posts.authorId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    const postsWithAuthors = await Promise.all(
      userPosts.map(async (post) => {
        const author = await this.getUserById(post.authorId);
        const [like] = await db.select()
          .from(postLikes)
          .where(and(eq(postLikes.postId, post.id), eq(postLikes.userId, viewerId)));
        return {
          ...post,
          author: author!,
          isLiked: !!like,
        };
      })
    );
    return postsWithAuthors;
  },

  // Revenue tracking functions
  // Fees are collected on-chain: 5% tips go to treasury, 95% to creator
  async recordRevenueEntry(data: {
    transactionId?: string;
    tipId?: string;
    revenueSource: string;
    grossAmount: string;
    feeAmount: string;
    feePercentage: string;
    netToRecipient: string;
    currency: string;
    tempoTxHash?: string;
    feeTxHash?: string;
    feeCollected?: boolean;
  }): Promise<RevenueLedger> {
    const [entry] = await db.insert(revenueLedger)
      .values({
        transactionId: data.transactionId || null,
        tipId: data.tipId || null,
        revenueSource: data.revenueSource,
        grossAmount: data.grossAmount,
        feeAmount: data.feeAmount,
        feePercentage: data.feePercentage,
        netToRecipient: data.netToRecipient,
        currency: data.currency,
        tempoTxHash: data.tempoTxHash || null,
        feeTxHash: data.feeTxHash || null,
        feeCollected: data.feeCollected || false,
        recordedAt: new Date(),
      })
      .returning();
    return entry;
  },

  async getRevenueStats(): Promise<{
    totalRevenue: string;
    collectedRevenue: string;
    tipFees: string;
    p2pFees: string;
    miniAppFees: string;
    collectedTipFees: string;
    collectedP2pFees: string;
    entryCount: number;
    collectedCount: number;
  }> {
    const entries = await db.select().from(revenueLedger);
    
    let totalRevenue = 0;
    let collectedRevenue = 0;
    let tipFees = 0;
    let p2pFees = 0;
    let miniAppFees = 0;
    let collectedTipFees = 0;
    let collectedP2pFees = 0;
    let collectedCount = 0;
    
    for (const entry of entries) {
      const fee = parseFloat(entry.feeAmount);
      totalRevenue += fee;
      
      if (entry.revenueSource === 'tip_fee') tipFees += fee;
      if (entry.revenueSource === 'p2p_fee') p2pFees += fee;
      if (entry.revenueSource === 'mini_app_fee') miniAppFees += fee;
      
      // Only count fees that were actually collected on-chain
      if (entry.feeCollected) {
        collectedRevenue += fee;
        collectedCount++;
        if (entry.revenueSource === 'tip_fee') collectedTipFees += fee;
        if (entry.revenueSource === 'p2p_fee') collectedP2pFees += fee;
      }
    }
    
    return {
      totalRevenue: totalRevenue.toFixed(6),
      collectedRevenue: collectedRevenue.toFixed(6),
      tipFees: tipFees.toFixed(6),
      p2pFees: p2pFees.toFixed(6),
      miniAppFees: miniAppFees.toFixed(6),
      collectedTipFees: collectedTipFees.toFixed(6),
      collectedP2pFees: collectedP2pFees.toFixed(6),
      entryCount: entries.length,
      collectedCount,
    };
  },

  async getOrCreateCreatorBalance(creatorId: string): Promise<CreatorBalance> {
    const [existing] = await db.select()
      .from(creatorBalances)
      .where(eq(creatorBalances.creatorId, creatorId));
    
    if (existing) return existing;
    
    const [created] = await db.insert(creatorBalances)
      .values({ creatorId })
      .returning();
    return created;
  },

  async updateCreatorBalance(creatorId: string, netAmount: string, feeAmount: string): Promise<CreatorBalance> {
    const balance = await this.getOrCreateCreatorBalance(creatorId);
    
    // Creator receives net amount (after 5% fee deducted on-chain)
    // totalEarned = net amount received, totalFeesPaid = platform fees sent to treasury
    const newTotalEarned = parseFloat(balance.totalEarned) + parseFloat(netAmount);
    const newPendingBalance = parseFloat(balance.pendingBalance) + parseFloat(netAmount);
    const newTotalTipsReceived = parseInt(balance.totalTipsReceived) + 1;
    const newTotalFeesPaid = parseFloat(balance.totalFeesPaid) + parseFloat(feeAmount);
    
    const [updated] = await db.update(creatorBalances)
      .set({
        totalEarned: newTotalEarned.toFixed(6),
        pendingBalance: newPendingBalance.toFixed(6),
        totalTipsReceived: newTotalTipsReceived.toString(),
        totalFeesPaid: newTotalFeesPaid.toFixed(6),
        updatedAt: new Date(),
      })
      .where(eq(creatorBalances.creatorId, creatorId))
      .returning();
    
    return updated;
  },

  async getCreatorBalance(creatorId: string): Promise<CreatorBalance | undefined> {
    const [balance] = await db.select()
      .from(creatorBalances)
      .where(eq(creatorBalances.creatorId, creatorId));
    return balance;
  },

  async createWithdrawal(data: {
    creatorId: string;
    amount: string;
    currency: string;
    destinationWallet: string;
  }): Promise<CreatorWithdrawal> {
    const [withdrawal] = await db.insert(creatorWithdrawals)
      .values({
        creatorId: data.creatorId,
        amount: data.amount,
        currency: data.currency,
        destinationWallet: data.destinationWallet,
        status: 'pending',
      })
      .returning();
    return withdrawal;
  },

  async updateWithdrawalStatus(withdrawalId: string, status: string, tempoTxHash?: string): Promise<CreatorWithdrawal> {
    const [updated] = await db.update(creatorWithdrawals)
      .set({
        status,
        tempoTxHash: tempoTxHash || null,
        completedAt: status === 'completed' ? new Date() : null,
      })
      .where(eq(creatorWithdrawals.id, withdrawalId))
      .returning();
    return updated;
  },

  async processWithdrawal(creatorId: string, amount: string): Promise<void> {
    const balance = await this.getCreatorBalance(creatorId);
    if (!balance) throw new Error("Creator balance not found");
    
    const newPendingBalance = parseFloat(balance.pendingBalance) - parseFloat(amount);
    const newTotalWithdrawn = parseFloat(balance.totalWithdrawn) + parseFloat(amount);
    
    if (newPendingBalance < 0) throw new Error("Insufficient balance");
    
    await db.update(creatorBalances)
      .set({
        pendingBalance: newPendingBalance.toFixed(6),
        totalWithdrawn: newTotalWithdrawn.toFixed(6),
        lastWithdrawalAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorBalances.creatorId, creatorId));
  },

  async getCreatorWithdrawals(creatorId: string, limit: number = 50): Promise<CreatorWithdrawal[]> {
    return db.select()
      .from(creatorWithdrawals)
      .where(eq(creatorWithdrawals.creatorId, creatorId))
      .orderBy(desc(creatorWithdrawals.createdAt))
      .limit(limit);
  },

  async getRecentRevenueLedger(limit: number = 100): Promise<RevenueLedger[]> {
    return db.select()
      .from(revenueLedger)
      .orderBy(desc(revenueLedger.createdAt))
      .limit(limit);
  },

  async createGroup(adminId: string, data: {
    name: string;
    description?: string;
    avatarUrl?: string;
    xmtpGroupId?: string;
    memberIds: string[];
  }): Promise<Chat & { members: Array<ChatParticipant & { user: User }> }> {
    const [group] = await db.insert(chats)
      .values({
        type: "group",
        name: data.name,
        description: data.description,
        avatarUrl: data.avatarUrl,
        xmtpGroupId: data.xmtpGroupId,
        adminId,
      })
      .returning();

    await db.insert(chatParticipants)
      .values({
        chatId: group.id,
        userId: adminId,
        role: "admin",
      });

    for (const memberId of data.memberIds) {
      if (memberId !== adminId) {
        await db.insert(chatParticipants)
          .values({
            chatId: group.id,
            userId: memberId,
            role: "member",
          });
      }
    }

    return this.getGroupWithMembers(group.id) as Promise<Chat & { members: Array<ChatParticipant & { user: User }> }>;
  },

  async getGroupById(groupId: string): Promise<Chat | undefined> {
    const [group] = await db.select()
      .from(chats)
      .where(and(
        eq(chats.id, groupId),
        eq(chats.type, "group")
      ));
    return group;
  },

  async getUserGroups(userId: string): Promise<Array<Chat & { members: Array<ChatParticipant & { user: User }> }>> {
    const participations = await db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, userId));

    const groupIds = participations.map(p => p.chatId);
    if (groupIds.length === 0) return [];

    const groups = await db.select()
      .from(chats)
      .where(and(
        inArray(chats.id, groupIds),
        eq(chats.type, "group")
      ))
      .orderBy(desc(chats.updatedAt));

    const result: Array<Chat & { members: Array<ChatParticipant & { user: User }> }> = [];
    for (const group of groups) {
      const withMembers = await this.getGroupWithMembers(group.id);
      if (withMembers) {
        result.push(withMembers);
      }
    }

    return result;
  },

  async getGroupWithMembers(groupId: string): Promise<(Chat & { members: Array<ChatParticipant & { user: User }> }) | null> {
    const [group] = await db.select()
      .from(chats)
      .where(and(
        eq(chats.id, groupId),
        eq(chats.type, "group")
      ));

    if (!group) return null;

    const participants = await db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, groupId));

    const members: Array<ChatParticipant & { user: User }> = [];
    for (const participant of participants) {
      const user = await this.getUserById(participant.userId);
      if (user) {
        members.push({ ...participant, user });
      }
    }

    return { ...group, members };
  },

  async getGroupMembers(groupId: string): Promise<ChatParticipant[]> {
    return db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, groupId));
  },

  async updateGroup(groupId: string, data: {
    name?: string;
    description?: string;
    avatarUrl?: string;
  }): Promise<Chat | undefined> {
    const updateData: Partial<Chat> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;

    const [updated] = await db.update(chats)
      .set(updateData)
      .where(eq(chats.id, groupId))
      .returning();
    return updated;
  },

  async addGroupMembers(groupId: string, memberIds: string[]): Promise<void> {
    for (const memberId of memberIds) {
      const existing = await db.select()
        .from(chatParticipants)
        .where(and(
          eq(chatParticipants.chatId, groupId),
          eq(chatParticipants.userId, memberId)
        ));

      if (existing.length === 0) {
        await db.insert(chatParticipants)
          .values({
            chatId: groupId,
            userId: memberId,
            role: "member",
          });
      }
    }

    await db.update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, groupId));
  },

  async removeGroupMember(groupId: string, memberId: string): Promise<void> {
    await db.delete(chatParticipants)
      .where(and(
        eq(chatParticipants.chatId, groupId),
        eq(chatParticipants.userId, memberId)
      ));

    await db.update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, groupId));
  },

  async transferGroupAdmin(groupId: string, oldAdminId: string, newAdminId: string): Promise<void> {
    await db.update(chatParticipants)
      .set({ role: "member" })
      .where(and(
        eq(chatParticipants.chatId, groupId),
        eq(chatParticipants.userId, oldAdminId)
      ));

    await db.update(chatParticipants)
      .set({ role: "admin" })
      .where(and(
        eq(chatParticipants.chatId, groupId),
        eq(chatParticipants.userId, newAdminId)
      ));

    await db.update(chats)
      .set({ adminId: newAdminId, updatedAt: new Date() })
      .where(eq(chats.id, groupId));
  },

  async deleteGroup(groupId: string): Promise<void> {
    await db.delete(chatParticipants)
      .where(eq(chatParticipants.chatId, groupId));

    await db.delete(chats)
      .where(eq(chats.id, groupId));
  },
};
