import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { starFeedPostsTable } from "./starFeed";
import { usersTable } from "./users";

export const PROFILE_UPDATE_HISTORY_KINDS = ["profile_image", "status_message", "profile_update"] as const;
export type ProfileUpdateHistoryKind = (typeof PROFILE_UPDATE_HISTORY_KINDS)[number];

export const profileUpdateHistoryTable = pgTable(
  "profile_update_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ProfileUpdateHistoryKind>().notNull(),
    oldProfileImageUrl: text("old_profile_image_url"),
    newProfileImageUrl: text("new_profile_image_url"),
    oldStatusMessage: text("old_status_message"),
    newStatusMessage: text("new_status_message"),
    feedPostId: uuid("feed_post_id").references(() => starFeedPostsTable.id, { onDelete: "set null" }),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("profile_update_history_user_created_at_idx").on(t.userId, t.createdAt),
    index("profile_update_history_feed_post_id_idx").on(t.feedPostId),
  ],
);

export type ProfileUpdateHistory = typeof profileUpdateHistoryTable.$inferSelect;
