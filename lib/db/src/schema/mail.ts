import { index, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./social";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const userId = (name: string) => text(name).notNull().references(() => users.id, { onDelete: "cascade" });

/**
 * Public encryption and signing keys only. Private keys and recovery phrases stay on user devices.
 * Keys are immutable in this first release so an account cannot silently replace a contact's key.
 */
export const mailKeys = pgTable("mail_keys", {
  userId: userId("user_id").primaryKey(),
  encryptionPublicKey: text("encryption_public_key").notNull(),
  signingPublicKey: text("signing_public_key").notNull(),
  createdAt: created(),
});

/** Direct, two-person internal-mail threads; message content never appears in this table. */
export const mailThreads = pgTable("mail_threads", {
  id: id(),
  directKey: text("direct_key").notNull(),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("mail_threads_direct_key").on(table.directKey)]);

export const mailMembers = pgTable("mail_members", {
  threadId: text("thread_id").notNull().references(() => mailThreads.id, { onDelete: "cascade" }),
  userId: userId("user_id"),
  joinedAt: created(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.threadId, table.userId] }),
  index("mail_members_user").on(table.userId, table.archivedAt),
]);

/** Message rows contain routing metadata only; each participant gets a distinct ciphertext envelope. */
export const mailMessages = pgTable("mail_messages", {
  id: id(),
  threadId: text("thread_id").notNull().references(() => mailThreads.id, { onDelete: "cascade" }),
  senderId: userId("sender_id"),
  createdAt: created(),
}, (table) => [
  index("mail_messages_thread_time").on(table.threadId, table.createdAt),
  index("mail_messages_sender").on(table.senderId, table.createdAt),
]);

export const mailEnvelopes = pgTable("mail_envelopes", {
  messageId: text("message_id").notNull().references(() => mailMessages.id, { onDelete: "cascade" }),
  recipientId: userId("recipient_id"),
  encapsulatedSecret: text("encapsulated_secret").notNull(),
  ciphertext: text("ciphertext").notNull(),
  signature: text("signature").notNull(),
}, (table) => [
  primaryKey({ columns: [table.messageId, table.recipientId] }),
  index("mail_envelopes_recipient").on(table.recipientId, table.messageId),
]);
