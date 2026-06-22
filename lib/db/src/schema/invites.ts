import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const invitesTable = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviteCode: text("invite_code").notNull().unique(),
  inviterUserId: uuid("inviter_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  usedByUserId: uuid("used_by_user_id").references(() => usersTable.id),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
});

export type Invite = typeof invitesTable.$inferSelect;
