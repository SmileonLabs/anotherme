import { eq } from "drizzle-orm";
import { adminRolesTable, db, type AdminRole } from "@workspace/db";
import type { User } from "@workspace/db";
import { isKnowledgeAdmin } from "./knowledge/validation";

const ADMIN_ACCESS_ROLES: readonly AdminRole[] = ["super_admin", "operations", "ip_manager", "content_editor", "support", "analyst"];

export async function hasAdminRole(userId: string, roles: readonly AdminRole[]): Promise<boolean> {
  if (roles.length === 0) return false;
  const rows = await db.select({ role: adminRolesTable.role }).from(adminRolesTable).where(eq(adminRolesTable.userId, userId));
  return rows.some((row) => roles.includes(row.role));
}

/** Single source of truth for all administrator surfaces.
 * Keep the environment allowlist as a break-glass path, but prefer the
 * persisted admin_roles grant so every admin screen and API agrees.
 */
export async function hasAdminAccess(user: Pick<User, "id" | "email">): Promise<boolean> {
  if (isKnowledgeAdmin(user)) return true;
  return hasAdminRole(user.id, ADMIN_ACCESS_ROLES);
}
