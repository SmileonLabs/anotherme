import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { adminAuditLogsTable, db, starFeedPostsTable, starFeedReportsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { isKnowledgeAdmin } from "../lib/knowledge/validation";

const router: IRouter = Router();
function admin(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1]): boolean {
  if (!req.dbUser || !isKnowledgeAdmin(req.dbUser)) { res.status(403).json({ error: "admin_required" }); return false; }
  return true;
}
router.get("/star-feed/admin/reports", requireAuth, async (req, res): Promise<void> => {
  if (!admin(req, res)) return;
  const rows = await db.select({ id: starFeedReportsTable.id, postId: starFeedReportsTable.postId, reason: starFeedReportsTable.reason, details: starFeedReportsTable.details, status: starFeedReportsTable.status, createdAt: starFeedReportsTable.createdAt, postTitle: starFeedPostsTable.title, reporterNickname: usersTable.nickname }).from(starFeedReportsTable).leftJoin(starFeedPostsTable, eq(starFeedPostsTable.id, starFeedReportsTable.postId)).leftJoin(usersTable, eq(usersTable.id, starFeedReportsTable.reporterUserId)).where(eq(starFeedReportsTable.status, "OPEN")).orderBy(desc(starFeedReportsTable.createdAt)).limit(100);
  res.json(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })));
});
router.post("/star-feed/admin/reports/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  if (!admin(req, res)) return;
  const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = z.object({ action: z.enum(["keep", "remove"]) }).safeParse(req.body);
  if (!z.uuid().safeParse(reportId).success || !parsed.success) { res.status(400).json({ error: "invalid" }); return; }
  const [report] = await db.update(starFeedReportsTable).set({ status: parsed.data.action === "remove" ? "RESOLVED_REMOVE" : "RESOLVED_KEEP", reviewedAt: new Date() }).where(and(eq(starFeedReportsTable.id, reportId), eq(starFeedReportsTable.status, "OPEN"))).returning({ postId: starFeedReportsTable.postId });
  if (!report) { res.status(404).json({ error: "not_found" }); return; }
  await db.update(starFeedPostsTable).set({ status: parsed.data.action === "remove" ? "REMOVED" : "PUBLISHED" }).where(eq(starFeedPostsTable.id, report.postId));
  await db.insert(adminAuditLogsTable).values({ actorUserId: req.dbUser!.id, action: parsed.data.action === "remove" ? "moderation_remove" : "moderation_keep", targetType: "star_feed_report", targetId: reportId, afterJson: { postId: report.postId, action: parsed.data.action } });
  res.json({ resolved: true, action: parsed.data.action });
});
export default router;
