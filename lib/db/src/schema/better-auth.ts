import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./social";

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Better Auth owns passkey credentials and opaque sessions; this is deliberately
// separate from the social profile table and never stores user passwords.
export const authUser = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("better_auth_user_email_unique").on(t.email)]);

export const authSession = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("better_auth_session_token_unique").on(t.token), index("better_auth_session_user").on(t.userId)]);

export const authAccount = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("better_auth_account_user").on(t.userId)]);

export const authVerification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("better_auth_verification_identifier").on(t.identifier)]);

export const authPasskey = pgTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: created(),
  aaguid: text("aaguid"),
}, (t) => [uniqueIndex("better_auth_passkey_credential_unique").on(t.credentialID), index("better_auth_passkey_user").on(t.userId)]);

// A registration intent is short-lived, random, single-use, and contains only
// the requested profile claims and a public recovery-key fingerprint.
export const passkeyRegistrationIntent = pgTable("passkey_registration_intent", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  recoveryPublicKey: text("recovery_public_key").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [uniqueIndex("passkey_registration_intent_token_unique").on(t.tokenHash)]);

// Recovery keys are isolated from public profiles. The secret phrase never
// reaches or gets stored by the server; only its derived verification key does.
export const accountRecoveryKey = pgTable("account_recovery_key", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  createdAt: created(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
});

export const accountRecoveryChallenge = pgTable("account_recovery_challenge", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
}, (t) => [index("account_recovery_challenge_user").on(t.userId)]);

export const insertAuthUserSchema = createInsertSchema(authUser);
export const insertAuthSessionSchema = createInsertSchema(authSession);
export const insertAuthAccountSchema = createInsertSchema(authAccount);
export const insertAuthVerificationSchema = createInsertSchema(authVerification);
export const insertAuthPasskeySchema = createInsertSchema(authPasskey);
