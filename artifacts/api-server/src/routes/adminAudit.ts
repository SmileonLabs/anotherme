import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { adminAuditLogsTable, db } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { isKnowledgeAdmin } from "../lib/knowledge/validation";
const router: IRouter = Router();
router.get("/admin/audit-logs", requireAuth, async (req, res): Promise<void> => { if (!req.dbUser || !isKnowledgeAdmin(req.dbUser)) { res.status(403).json({ error: "admin_required" }); return; } res.json(await db.select().from(adminAuditLogsTable).orderBy(desc(adminAuditLogsTable.createdAt)).limit(100)); });
export default router;
