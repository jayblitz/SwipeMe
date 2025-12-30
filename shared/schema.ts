import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  profileImage: text("profile_image"),
  status: text("status"),
  twitterLink: text("twitter_link"),
  telegramLink: text("telegram_link"),
  biometricEnabled: boolean("biometric_enabled").default(false),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: text("two_factor_secret"),
  themePreference: text("theme_preference").default("system"),
  pushToken: text("push_token"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  address: text("address").notNull(),
  encryptedPrivateKey: text("encrypted_private_key"),
  encryptedSeedPhrase: text("encrypted_seed_phrase"),
  isImported: boolean("is_imported").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  contactUserId: varchar("contact_user_id").references(() => users.id),
  name: text("name").notNull(),
  phoneNumber: text("phone_number"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chats = pgTable("chats", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: text("type").notNull().default("direct"),
  name: text("name"),
  disappearingMessagesTimer: text("disappearing_messages_timer"), // null = off, "24h" | "7d" | "30d"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatParticipants = pgTable("chat_participants", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id").notNull().references(() => chats.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  mutedUntil: timestamp("muted_until"),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("chat_participants_chat_idx").on(table.chatId),
  index("chat_participants_user_idx").on(table.userId),
]);

export const messages = pgTable("messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id").notNull().references(() => chats.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content"),
  type: text("type").notNull().default("text"),
  metadata: jsonb("metadata"),
  expiresAt: timestamp("expires_at"), // For disappearing messages - null means never expires
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("messages_chat_created_idx").on(table.chatId, table.createdAt),
  index("messages_sender_idx").on(table.senderId),
  index("messages_expires_idx").on(table.expiresAt),
]);

export const transactions = pgTable("transactions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toUserId: varchar("to_user_id").notNull().references(() => users.id),
  amount: text("amount").notNull(),
  currency: text("currency").notNull().default("USDC"),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  chatId: varchar("chat_id").references(() => chats.id),
  messageId: varchar("message_id").references(() => messages.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("transactions_from_user_idx").on(table.fromUserId, table.createdAt),
  index("transactions_to_user_idx").on(table.toUserId, table.createdAt),
  index("transactions_chat_idx").on(table.chatId),
  index("transactions_status_idx").on(table.status),
]);

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
});

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const verifyCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "Code must be 6 digits"),
});

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export const setPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  password: passwordSchema,
});

export function validatePasswordStrength(password: string): { score: number; feedback: string[] } {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push("Use at least 8 characters");

  if (password.length >= 12) score += 1;

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("Add uppercase letter");

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push("Add lowercase letter");

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push("Add a number");

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push("Add special character");

  if (password.length >= 16) score += 1;

  return { score: Math.min(score, 5), feedback };
}

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const usernameSchema = z.string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
  .regex(/^[a-z]/, "Username must start with a letter");

export const setUsernameSchema = z.object({
  username: usernameSchema,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

export const waitlistSignups = pgTable("waitlist_signups", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  source: text("source").default("landing_page"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const passkeys = pgTable("passkeys", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  deviceName: text("device_name"),
  counter: text("counter").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const waitlistSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const verify2FASchema = z.object({
  userId: z.string(),
  code: z.string().length(6, "Code must be 6 digits"),
});

export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type Passkey = typeof passkeys.$inferSelect;

// Wallet operation validation schemas
const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

export const walletCreateSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export const walletImportSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  seedPhrase: z.string().optional(),
  privateKey: z.string().optional(),
}).refine(
  (data) => data.seedPhrase || data.privateKey,
  { message: "Seed phrase or private key is required" }
);

export const transferSchema = z.object({
  tokenAddress: ethereumAddressSchema,
  toAddress: ethereumAddressSchema,
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  decimals: z.number().int().min(0).max(18),
});

export const signMessageSchema = z.object({
  message: z.string().min(1, "Message is required").max(10000, "Message too long"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z.string().length(6, "Code must be 6 digits"),
  newPassword: passwordSchema,
});

// Moments (Social Feed) tables
export const posts = pgTable("posts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").notNull().references(() => users.id),
  content: text("content"),
  mediaUrls: jsonb("media_urls").$type<string[]>(),
  visibility: text("visibility").notNull().default("public"), // public, friends, private
  likesCount: text("likes_count").default("0"),
  commentsCount: text("comments_count").default("0"),
  tipsTotal: text("tips_total").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("posts_author_idx").on(table.authorId),
  index("posts_created_idx").on(table.createdAt),
]);

export const postLikes = pgTable("post_likes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("post_likes_post_idx").on(table.postId),
  index("post_likes_user_idx").on(table.userId),
]);

export const postComments = pgTable("post_comments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("post_comments_post_idx").on(table.postId),
  index("post_comments_author_idx").on(table.authorId),
]);

export const postTips = pgTable("post_tips", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  amount: text("amount").notNull(),
  currency: text("currency").notNull().default("pathUSD"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("post_tips_post_idx").on(table.postId),
  index("post_tips_from_user_idx").on(table.fromUserId),
]);

export type Post = typeof posts.$inferSelect;
export type PostLike = typeof postLikes.$inferSelect;
export type PostComment = typeof postComments.$inferSelect;
export type PostTip = typeof postTips.$inferSelect;

export const createPostSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(500),
});

export const tipPostSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  currency: z.string().optional(),
});

// Export AI chat models
export * from "./models/chat";
