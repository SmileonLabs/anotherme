import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { adminRolesTable, adminAuditLogsTable, db, usersTable, ADMIN_ROLES } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { isKnowledgeAdmin } from "../lib/knowledge/validation";
import { hasAdminRole } from "../lib/adminRbac";
const router: IRouter = Router();
router.get("/admin/roles", requireAuth, async (req, res): Promise<void> => { if (!req.dbUser || !isKnowledgeAdmin(req.dbUser)) { res.status(403).json({ error: "admin_required" }); return; } const rows = await db.select({ id: adminRolesTable.id, userId: adminRolesTable.userId, nickname: usersTable.nickname, email: usersTable.email, role: adminRolesTable.role, createdAt: adminRolesTable.createdAt }).from(adminRolesTable).leftJoin(usersTable, eq(usersTable.id, adminRolesTable.userId)).orderBy(desc(adminRolesTable.createdAt)); res.json(rows); });
router.post("/admin/roles", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminRole(req.dbUser.id, ["super_admin"]))) { res.status(403).json({ error: "super_admin_required" }); return; }
  const parsed = z.object({ userId: z.string().uuid(), role: z.enum(ADMIN_ROLES) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_role_assignment" }); return; }
  const [row] = await db.insert(adminRolesTable).values({ userId: parsed.data.userId, role: parsed.data.role, grantedByUserId: req.dbUser.id }).onConflictDoNothing().returning();
  await db.insert(adminAuditLogsTable).values({ actorUserId: req.dbUser.id, action: "admin_role_grant", targetType: "admin_role", targetId: row?.id ?? parsed.data.userId, afterJson: parsed.data });
  res.status(201).json(row ?? { userId: parsed.data.userId, role: parsed.data.role });
});
router.delete("/admin/roles/:id", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminRole(req.dbUser.id, ["super_admin"]))) { res.status(403).json({ error: "super_admin_required" }); return; }
  const [row] = await db.delete(adminRolesTable).where(eq(adminRolesTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "role_not_found" }); return; }
  await db.insert(adminAuditLogsTable).values({ actorUserId: req.dbUser.id, action: "admin_role_revoke", targetType: "admin_role", targetId: row.id, beforeJson: row });
  res.json({ ok: true });
});
export default router;
