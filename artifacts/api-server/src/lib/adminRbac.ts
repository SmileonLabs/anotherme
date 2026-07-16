import { eq } from "drizzle-orm";
import { adminRolesTable, db, type AdminRole } from "@workspace/db";
export async function hasAdminRole(userId: string, roles: readonly AdminRole[]): Promise<boolean> {
  if (roles.length === 0) return false;
  const rows = await db.select({ role: adminRolesTable.role }).from(adminRolesTable).where(eq(adminRolesTable.userId, userId));
  return rows.some((row) => roles.includes(row.role));
}
