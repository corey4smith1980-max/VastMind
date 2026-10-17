import { pgTable, text, timestamp, boolean, integer, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const users = pgTable("users", {
  id: text("id").primaryKey(), name: text("name").notNull(), username: text("username").notNull(),
  email: text("email"), avatarUrl: text("avatar_url"), bio: text("bio"), status: text("status"),
  allowMessagesFrom: text("allow_messages_from").notNull().default("everyone"),
  profileVisibility: text("profile_visibility").notNull().default("everyone"),
  showOnlineStatus: boolean("show_online_status").notNull().default(true),
  showLastSeen: boolean("show_last_seen").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  isOpen: boolean("is_open").notNull().default(true), createdAt: created(),
}, t => [uniqueIndex("users_username_ci").on(sql`lower(${t.username})`)]);
const uid = (name: string) => text(name).notNull().references(() => users.id, { onDelete: "cascade" });
// Directed following relationships. Mutual follows are trusted contacts.
export const follows = pgTable("follows", {
  userId: uid("user_id"),
  targetId: uid("target_id"),
  createdAt: created(),
}, t => [
  primaryKey({ columns: [t.userId, t.targetId] }),
  index("follows_target").on(t.targetId),
]);
export const insertFollowSchema = createInsertSchema(follows);
export type Follow = typeof follows.$inferSelect;
export type InsertFollow = typeof follows.$inferInsert;
export const blocks = pgTable("blocks", { userId: uid("user_id"), targetId: uid("target_id") }, t => [primaryKey({ columns: [t.userId,t.targetId] })]);
export const reports = pgTable("reports", { id: id(), userId: uid("user_id"), targetId: uid("target_id"), reason: text("reason").notNull(), createdAt: created() });
export const chats = pgTable("chats", { id: id(), type: text("type").notNull(), name: text("name"), isPrivate: boolean("is_private").notNull().default(true), inviteCode: text("invite_code").unique(), directKey: text("direct_key").unique(), createdAt: created() });
export const chatMembers = pgTable("chat_members", { chatId: text("chat_id").notNull().references(() => chats.id,{onDelete:"cascade"}), userId: uid("user_id"), role: text("role").notNull().default("member"), joinedAt: created(), lastReadAt: timestamp("last_read_at",{withTimezone:true}) }, t => [primaryKey({columns:[t.chatId,t.userId]}),index("chat_members_user").on(t.userId)]);
export const messages = pgTable("messages", { id: id(), chatId: text("chat_id").notNull().references(()=>chats.id,{onDelete:"cascade"}), senderId: uid("sender_id"), content: text("content").notNull(), type: text("type").notNull().default("text"), mediaId: text("media_id"), replyToId: text("reply_to_id"), createdAt: created() },t=>[
  index("messages_chat_time").on(t.chatId,t.createdAt),
  index("messages_content_search").using("gin", sql`to_tsvector('simple', ${t.content})`),
]);
export const communities = pgTable("communities",{id:id(),ownerId:uid("owner_id"),name:text("name").notNull(),description:text("description").notNull(),category:text("category").notNull(),isPrivate:boolean("is_private").notNull(),createdAt:created()});
export const communityMembers = pgTable("community_members",{communityId:text("community_id").notNull().references(()=>communities.id,{onDelete:"cascade"}),userId:uid("user_id"),role:text("role").notNull().default("member"),state:text("state").notNull().default("member")},t=>[primaryKey({columns:[t.communityId,t.userId]})]);
export const posts = pgTable("posts",{id:id(),authorId:uid("author_id"),communityId:text("community_id").references(()=>communities.id,{onDelete:"cascade"}),content:text("content").notNull(),mediaId:text("media_id"),audioMediaId:text("audio_media_id"),effect:text("effect").notNull().default("none"),captions:jsonb("captions").notNull().default([]),createdAt:created()}, t => [
  index("posts_content_search").using("gin", sql`to_tsvector('simple', ${t.content})`),
]);
export const reactions = pgTable("reactions",{postId:text("post_id").notNull().references(()=>posts.id,{onDelete:"cascade"}),userId:uid("user_id"),reaction:text("reaction").notNull()},t=>[primaryKey({columns:[t.postId,t.userId]})]);
export const comments = pgTable("comments",{id:id(),postId:text("post_id").notNull().references(()=>posts.id,{onDelete:"cascade"}),authorId:uid("author_id"),content:text("content").notNull(),createdAt:created()});
export const pollOptions = pgTable("poll_options",{id:id(),postId:text("post_id").notNull().references(()=>posts.id,{onDelete:"cascade"}),label:text("label").notNull()});
export const votes = pgTable("votes",{postId:text("post_id").notNull().references(()=>posts.id,{onDelete:"cascade"}),userId:uid("user_id"),optionId:text("option_id").notNull().references(()=>pollOptions.id,{onDelete:"cascade"})},t=>[primaryKey({columns:[t.postId,t.userId]})]);
export const channels = pgTable("channels",{id:id(),ownerId:uid("owner_id"),name:text("name").notNull(),description:text("description").notNull(),createdAt:created()});
export const channelFollowers = pgTable("channel_followers",{channelId:text("channel_id").notNull().references(()=>channels.id,{onDelete:"cascade"}),userId:uid("user_id")},t=>[primaryKey({columns:[t.channelId,t.userId]})]);
export const channelUpdates = pgTable("channel_updates",{id:id(),channelId:text("channel_id").notNull().references(()=>channels.id,{onDelete:"cascade"}),content:text("content").notNull(),pinned:boolean("pinned").notNull().default(false),createdAt:created()});
export const statuses = pgTable("statuses",{id:id(),authorId:uid("author_id"),content:text("content").notNull(),mediaId:text("media_id"),createdAt:created(),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull()});

// Only metadata belongs in PostgreSQL; bytes remain in private App Storage.
export const mediaUploads = pgTable("media_uploads", {
  id: id(), ownerId: uid("owner_id"), objectPath: text("object_path").notNull(),
  name: text("name").notNull(), contentType: text("content_type").notNull(),
  size: text("size").notNull(), purpose: text("purpose").notNull(),
  chatId: text("chat_id").references(()=>chats.id,{onDelete:"cascade"}),
  ready: boolean("ready").notNull().default(false), attached: boolean("attached").notNull().default(false),
  createdAt: created(),
});
export const insertMediaUploadSchema = createInsertSchema(mediaUploads).omit({id:true,createdAt:true});
export type MediaUpload = typeof mediaUploads.$inferSelect;
export const quickReplies = pgTable("quick_replies",{id:id(),userId:uid("user_id"),label:text("label").notNull(),content:text("content").notNull()});
export const notifications = pgTable("notifications",{id:id(),userId:uid("user_id"),actorId:uid("actor_id"),type:text("type").notNull(),title:text("title").notNull(),body:text("body").notNull(),read:boolean("read").notNull().default(false),pushSentAt:timestamp("push_sent_at",{withTimezone:true}),createdAt:created()},t=>[index("notifications_user_time").on(t.userId,t.createdAt)]);

export const pushSubscriptions = pgTable("push_subscriptions",{
  id:id(),userId:uid("user_id"),endpoint:text("endpoint").notNull(),
  p256dh:text("p256dh").notNull(),auth:text("auth").notNull(),createdAt:created(),
},t=>[uniqueIndex("push_endpoint_unique").on(t.endpoint)]);
export const insertPushSubscriptionSchema=createInsertSchema(pushSubscriptions).omit({id:true,createdAt:true});
export const insertUserSchema = createInsertSchema(users);
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
