import { pgTable, text, integer, boolean, timestamp, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { users, shopStores, shopProducts, shopOrders, mediaUploads, posts } from "./social";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const shop = () => text("shop_id").notNull().references(() => shopStores.id, { onDelete: "cascade" });
const user = () => text("user_id").notNull().references(() => users.id, { onDelete: "cascade" });
const product = () => text("product_id").notNull().references(() => shopProducts.id, { onDelete: "cascade" });

// Roles are explicitly approved by the owner. A creator cannot manage orders or customer data.
export const commerceTeam = pgTable("commerce_team", {
  shopId: shop(), userId: user(), role: text("role").notNull(), createdAt: created(),
}, t => [primaryKey({ columns: [t.shopId, t.userId] })]);
export const commerceFollowers = pgTable("commerce_followers", {
  shopId: shop(), userId: user(), marketingOptIn: boolean("marketing_opt_in").notNull().default(false), createdAt: created(),
}, t => [primaryKey({ columns: [t.shopId, t.userId] })]);
export const commercePhotos = pgTable("commerce_photos", {
  productId: product(), mediaId: text("media_id").notNull().references(() => mediaUploads.id),
  position: integer("position").notNull(),
}, t => [primaryKey({ columns: [t.productId, t.mediaId] })]);
export const commerceVariants = pgTable("commerce_variants", {
  id: id(), productId: product(), label: text("label").notNull(), sku: text("sku").notNull(),
  priceMinor: integer("price_minor").notNull(), inventory: integer("inventory").notNull(),
  active: boolean("active").notNull().default(true),
}, t => [uniqueIndex("commerce_variant_product_sku").on(t.productId, t.sku)]);
export const commerceSaved = pgTable("commerce_saved", {
  productId: product(), userId: user(), createdAt: created(),
}, t => [primaryKey({ columns: [t.productId, t.userId] })]);
export const commerceReviews = pgTable("commerce_reviews", {
  productId: product(), userId: user(), rating: integer("rating").notNull(), content: text("content").notNull(),
  createdAt: created(),
}, t => [primaryKey({ columns: [t.productId, t.userId] })]);
export const commerceReports = pgTable("commerce_reports", {
  id: id(), userId: user(), kind: text("kind").notNull(), targetId: text("target_id").notNull(),
  reason: text("reason").notNull(), state: text("state").notNull().default("open"), createdAt: created(),
}, t => [uniqueIndex("commerce_report_user_target").on(t.userId, t.kind, t.targetId)]);
export const commerceCoupons = pgTable("commerce_coupons", {
  id: id(), shopId: shop(), code: text("code").notNull(), kind: text("kind").notNull(), value: integer("value").notNull(),
  currency: text("currency").notNull(), minSpendMinor: integer("min_spend_minor").notNull().default(0),
  maxRedemptions: integer("max_redemptions").notNull(), perBuyerLimit: integer("per_buyer_limit").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), productIds: text("product_ids").array().notNull().default([]),
  active: boolean("active").notNull().default(true), createdAt: created(),
}, t => [uniqueIndex("commerce_coupon_shop_code").on(t.shopId, t.code)]);
export const commerceRedemptions = pgTable("commerce_redemptions", {
  orderId: text("order_id").primaryKey().references(() => shopOrders.id), couponId: text("coupon_id").notNull().references(() => commerceCoupons.id),
  userId: user(), createdAt: created(),
});
export const commerceCampaigns = pgTable("commerce_campaigns", {
  id: id(), shopId: shop(), name: text("name").notNull(), productId: text("product_id").references(() => shopProducts.id),
  creatorId: text("creator_id").references(() => users.id),
  couponId: text("coupon_id").references(() => commerceCoupons.id), active: boolean("active").notNull().default(true), createdAt: created(),
});
export const commerceCustomers = pgTable("commerce_customers", {
  shopId: shop(), userId: user(), notes: text("notes").notNull().default(""), labels: text("labels").array().notNull().default([]),
}, t => [primaryKey({ columns: [t.shopId, t.userId] })]);
export const commerceTags = pgTable("commerce_tags", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }), productId: product(),
}, t => [primaryKey({ columns: [t.postId, t.productId] })]);
export const commerceEvents = pgTable("commerce_events", {
  id: id(), shopId: shop(), userId: user(), productId: text("product_id").references(() => shopProducts.id),
  campaignId: text("campaign_id").references(() => commerceCampaigns.id), kind: text("kind").notNull(),
  // One event per authenticated user/entity/kind/UTC day, not a client-supplied event key.
  dedupKey: text("dedup_key").notNull().unique(), createdAt: created(),
}, t => [index("commerce_events_shop_time").on(t.shopId, t.createdAt)]);
export const commerceHistory = pgTable("commerce_history", {
  id: id(), orderId: text("order_id").notNull().references(() => shopOrders.id),
  actorId: text("actor_id").notNull().references(() => users.id), action: text("action").notNull(),
  note: text("note").notNull().default(""), createdAt: created(),
}, t => [index("commerce_history_order_time").on(t.orderId, t.createdAt)]);

export const insertCommerceTeamSchema = createInsertSchema(commerceTeam);
export const insertCommerceFollowerSchema = createInsertSchema(commerceFollowers);
export const insertCommercePhotoSchema = createInsertSchema(commercePhotos);
export const insertCommerceVariantSchema = createInsertSchema(commerceVariants);
export const insertCommerceSavedSchema = createInsertSchema(commerceSaved);
export const insertCommerceReviewSchema = createInsertSchema(commerceReviews);
export const insertCommerceReportSchema = createInsertSchema(commerceReports);
export const insertCommerceCouponSchema = createInsertSchema(commerceCoupons);
export const insertCommerceRedemptionSchema = createInsertSchema(commerceRedemptions);
export const insertCommerceCampaignSchema = createInsertSchema(commerceCampaigns);
export const insertCommerceCustomerSchema = createInsertSchema(commerceCustomers);
export const insertCommerceTagSchema = createInsertSchema(commerceTags);
export const insertCommerceEventSchema = createInsertSchema(commerceEvents);
export const insertCommerceHistorySchema = createInsertSchema(commerceHistory);
export type CommerceVariantRow = typeof commerceVariants.$inferSelect;
export type CommerceCouponRow = typeof commerceCoupons.$inferSelect;
export type CommerceCampaignRow = typeof commerceCampaigns.$inferSelect;
