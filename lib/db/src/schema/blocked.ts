import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const blockedUsersTable = pgTable(
  "blocked_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerUserId: uuid("blocker_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    blockedUserId: uuid("blocked_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blocked_users_blocker_user_id_blocked_user_id_unique_idx").on(t.blockerUserId, t.blockedUserId),
    index("blocked_users_blocked_user_id_blocker_user_id_idx").on(t.blockedUserId, t.blockerUserId),
  ],
);

export type BlockedUser = typeof blockedUsersTable.$inferSelect;
