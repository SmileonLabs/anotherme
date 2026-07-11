import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const STAR_FEED_POST_KINDS = ["official", "event", "fan", "star", "growth", "profile_update", "talk_diary"] as const;
export type StarFeedPostKind = (typeof STAR_FEED_POST_KINDS)[number];

export const STAR_FEED_VISIBILITIES = ["PRIVATE", "FRIENDS", "PUBLIC"] as const;
export type StarFeedVisibility = (typeof STAR_FEED_VISIBILITIES)[number];

export const starFeedPostsTable = pgTable(
  "star_feed_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorUserId: uuid("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    kind: text("kind").$type<StarFeedPostKind>().notNull().default("fan"),
    sourceKey: text("source_key").unique(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    visibility: text("visibility").$type<StarFeedVisibility>().notNull().default("PUBLIC"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("star_feed_posts_created_at_idx").on(t.createdAt),
    index("star_feed_posts_kind_created_at_idx").on(t.kind, t.createdAt),
    index("star_feed_posts_author_user_id_idx").on(t.authorUserId),
  ],
);

export const starFeedReactionsTable = pgTable(
  "star_feed_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => starFeedPostsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reactionType: text("reaction_type").notNull().default("cheer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("star_feed_reactions_post_user_idx").on(t.postId, t.userId),
    index("star_feed_reactions_post_id_idx").on(t.postId),
    index("star_feed_reactions_user_id_idx").on(t.userId),
  ],
);

export const starFeedCommentsTable = pgTable(
  "star_feed_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => starFeedPostsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("star_feed_comments_post_id_created_at_idx").on(t.postId, t.createdAt),
    index("star_feed_comments_user_id_idx").on(t.userId),
  ],
);

export type StarFeedPost = typeof starFeedPostsTable.$inferSelect;
export type StarFeedReaction = typeof starFeedReactionsTable.$inferSelect;
export type StarFeedComment = typeof starFeedCommentsTable.$inferSelect;
