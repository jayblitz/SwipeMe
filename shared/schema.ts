import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
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
  joinedAt: timestamp("joined_at").defaultNow(),
});

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
});

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
});

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
