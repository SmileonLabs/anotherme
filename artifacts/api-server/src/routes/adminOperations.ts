import { Router, type IRouter } from "express";
import { count, desc } from "drizzle-orm";
import { callsTable, chatRoomsTable, db, searchQueryLogsTable, starFeedPostsTable, starFeedReportsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { hasAdminAccess } from "../lib/adminRbac";

const router: IRouter = Router();
router.get("/admin/operations/overview", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const [[posts], [reports], [rooms], [calls], [searches]] = await Promise.all([
    db.select({ value: count() }).from(starFeedPostsTable),
    db.select({ value: count() }).from(starFeedReportsTable),
    db.select({ value: count() }).from(chatRoomsTable),
    db.select({ value: count() }).from(callsTable),
    db.select({ value: count() }).from(searchQueryLogsTable),
  ]);
  res.json({ posts: Number(posts?.value ?? 0), reports: Number(reports?.value ?? 0), rooms: Number(rooms?.value ?? 0), calls: Number(calls?.value ?? 0), searches: Number(searches?.value ?? 0), generatedAt: new Date().toISOString() });
});
export default router;
