import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { adminAuditLogsTable, db } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { hasAdminAccess } from "../lib/adminRbac";
const router: IRouter = Router();
router.get("/admin/audit-logs", requireAuth, async (req, res): Promise<void> => { if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; } res.json(await db.select().from(adminAuditLogsTable).orderBy(desc(adminAuditLogsTable.createdAt)).limit(100)); });
export default router;
