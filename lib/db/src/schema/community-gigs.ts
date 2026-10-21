import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { communities, users } from "./social";

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Community skill offers and requests. Rates are descriptive only; this does not process payments. */
export const communityGigs = pgTable("community_gigs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  communityId: text("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  rateNote: text("rate_note").notNull().default(""),
  state: text("state").notNull().default("open"),
  createdAt: created(),
}, (t) => [
  check("community_gigs_kind_check", sql`${t.kind} in ('offer','request')`),
  check("community_gigs_state_check", sql`${t.state} in ('open','matched','completed','closed')`),
  index("community_gigs_community_state_created").on(t.communityId, t.state, t.createdAt),
  index("community_gigs_author_created").on(t.authorId, t.createdAt),
]);

/** Private introductions/applications; only the author and the responding member can access a row. */
export const communityGigResponses = pgTable("community_gig_responses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  gigId: text("gig_id").notNull().references(() => communityGigs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  state: text("state").notNull().default("pending"),
  createdAt: created(),
}, (t) => [
  check("community_gig_responses_state_check", sql`${t.state} in ('pending','accepted','declined')`),
  uniqueIndex("community_gig_responses_once").on(t.gigId, t.userId),
  index("community_gig_responses_gig_created").on(t.gigId, t.createdAt),
]);

export type CommunityGig = typeof communityGigs.$inferSelect;
export type CommunityGigResponse = typeof communityGigResponses.$inferSelect;
