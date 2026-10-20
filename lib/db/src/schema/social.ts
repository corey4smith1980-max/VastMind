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
export const messageReactions = pgTable("message_reactions", {
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: uid("user_id"), emoji: text("emoji").notNull(), createdAt: created(),
}, t => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] }), index("message_reactions_message").on(t.messageId)]);
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
export const statuses = pgTable("statuses",{id:id(),authorId:uid("author_id"),content:text("content").notNull(),mediaId:text("media_id"),backgroundStyle:text("background_style").notNull().default("midnight"),createdAt:created(),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull()});

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
// Product listings, orders, and immutable line-item snapshots power VastMind's
// in-app shop. Payment is intentionally recorded as manual until a processor
// is connected; these tables never store card or bank credentials.
export const shopStores = pgTable("shop_stores", {
  id: id(), ownerId: uid("owner_id").unique(), name: text("name").notNull(), slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""), category: text("category").notNull().default("General"),
  currency: text("currency").notNull().default("USD"), policies: text("policies").notNull().default(""),
  contact: text("contact").notNull().default(""), pickupDetails: text("pickup_details").notNull().default(""),
  shippingMinor: integer("shipping_minor").notNull().default(0),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(true), pickupEnabled: boolean("pickup_enabled").notNull().default(false),
  logoMediaId: text("logo_media_id").references(() => mediaUploads.id, { onDelete: "set null" }),
  isPublished: boolean("is_published").notNull().default(true), createdAt: created(),
}, t => [index("shop_stores_published").on(t.isPublished, t.createdAt)]);
export const insertShopStoreSchema = createInsertSchema(shopStores).omit({ id: true, createdAt: true });
export type ShopStore = typeof shopStores.$inferSelect;
export const shopProducts = pgTable("shop_products", {
  id: id(), sellerId: uid("seller_id"), title: text("title").notNull(),
  shopId: text("shop_id").references(() => shopStores.id),
  description: text("description").notNull().default(""), category: text("category").notNull().default("General"),
  priceMinor: integer("price_minor").notNull(), currency: text("currency").notNull().default("USD"),
  inventory: integer("inventory").notNull().default(0),
  imageMediaId: text("image_media_id").references(() => mediaUploads.id, { onDelete: "set null" }),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: created(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("shop_products_published_time").on(t.isPublished, t.createdAt), index("shop_products_seller_time").on(t.sellerId, t.createdAt)]);
export const shopOrders = pgTable("shop_orders", {
  id: id(), buyerId: uid("buyer_id"), sellerId: uid("seller_id"),
  shopId: text("shop_id").references(() => shopStores.id),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("awaiting_manual"),
  buyerNote: text("buyer_note").notNull().default(""),
  totalMinor: integer("total_minor").notNull(), currency: text("currency").notNull(),
  subtotalMinor: integer("subtotal_minor"), discountMinor: integer("discount_minor").notNull().default(0),
  shippingMinor: integer("shipping_minor").notNull().default(0),
  fulfillment: text("fulfillment").notNull().default("pickup"),
  recipientName: text("recipient_name").notNull().default(""), phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""), trackingNumber: text("tracking_number").notNull().default(""),
  carrier: text("carrier").notNull().default(""), couponId: text("coupon_id"), campaignId: text("campaign_id"),
  requestType: text("request_type").notNull().default(""), requestStatus: text("request_status").notNull().default(""),
  requestReason: text("request_reason").notNull().default(""),
  inventoryRestored: boolean("inventory_restored").notNull().default(false), idempotencyKey: text("idempotency_key"),
  checkoutHash: text("checkout_hash"),
  createdAt: created(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("shop_orders_buyer_time").on(t.buyerId, t.createdAt), index("shop_orders_seller_time").on(t.sellerId, t.createdAt),
  uniqueIndex("shop_orders_buyer_idempotency").on(t.buyerId, t.idempotencyKey)]);
export const shopOrderItems = pgTable("shop_order_items", {
  id: id(), orderId: text("order_id").notNull().references(() => shopOrders.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => shopProducts.id),
  title: text("title").notNull(), unitPriceMinor: integer("unit_price_minor").notNull(),
  variantId: text("variant_id"), variantLabel: text("variant_label"), sku: text("sku"),
  quantity: integer("quantity").notNull(),
}, t => [index("shop_order_items_order").on(t.orderId)]);
export const insertShopProductSchema = createInsertSchema(shopProducts).omit({ id: true, createdAt: true, updatedAt: true });
export type ShopProduct = typeof shopProducts.$inferSelect;
export type InsertShopProduct = typeof shopProducts.$inferInsert;
export const insertShopOrderSchema = createInsertSchema(shopOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type ShopOrder = typeof shopOrders.$inferSelect;
export const insertShopOrderItemSchema = createInsertSchema(shopOrderItems).omit({ id: true });
export type ShopOrderItem = typeof shopOrderItems.$inferSelect;
export const notifications = pgTable("notifications",{id:id(),userId:uid("user_id"),actorId:uid("actor_id"),type:text("type").notNull(),title:text("title").notNull(),body:text("body").notNull(),read:boolean("read").notNull().default(false),pushSentAt:timestamp("push_sent_at",{withTimezone:true}),createdAt:created()},t=>[index("notifications_user_time").on(t.userId,t.createdAt)]);

export const pushSubscriptions = pgTable("push_subscriptions",{
  id:id(),userId:uid("user_id"),endpoint:text("endpoint").notNull(),
  p256dh:text("p256dh").notNull(),auth:text("auth").notNull(),createdAt:created(),
},t=>[uniqueIndex("push_endpoint_unique").on(t.endpoint)]);
export const insertPushSubscriptionSchema=createInsertSchema(pushSubscriptions).omit({id:true,createdAt:true});
export const insertUserSchema = createInsertSchema(users);
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
