import { pgTable, text, integer, boolean, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { users, posts } from "./social";

// One bounded record per member/clip, not a raw event log or public watch history.
export const videoEngagement = pgTable("video_engagement", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  watchMs: integer("watch_ms").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.userId, t.postId] }), index("video_engagement_member").on(t.userId, t.updatedAt)]);

// Stable ranked pages survive restarts and work across backend instances.
export const videoFeedSessions = pgTable("video_feed_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feed: text("feed").notNull(),
  creatorId: text("creator_id"),
  postIds: text("post_ids").array().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("video_sessions_expiry").on(t.expiresAt), index("video_sessions_member").on(t.userId, t.expiresAt)]);

// Processing leases and hourly quotas are shared across instances, not in memory.
export const videoProcessingJobs = pgTable("video_processing_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  state: text("state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("video_jobs_member").on(t.userId, t.createdAt), index("video_jobs_active").on(t.state, t.expiresAt)]);
