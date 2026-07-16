import { index, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
export const ADMIN_ROLES = ["super_admin", "operations", "ip_manager", "content_editor", "support", "analyst"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const adminRolesTable = pgTable("admin_roles", { id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }), role: text("role").$type<AdminRole>().notNull(), grantedByUserId: uuid("granted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (t) => [uniqueIndex("admin_roles_user_role_idx").on(t.userId, t.role), index("admin_roles_user_idx").on(t.userId)]);
