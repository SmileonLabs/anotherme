import { Router, type IRouter } from "express";
import { count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import { adminAuditLogsTable, blockedUsersTable, characterProfilesTable, db, fanProfilesTable, starFeedPostsTable, starFeedReportsTable, starProfilesTable, userPlayModesTable, userWalletsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { hasAdminAccess } from "../lib/adminRbac";

const router: IRouter = Router();

router.get("/admin/members", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rows = await db.select({ id: usersTable.id, nickname: usersTable.nickname, email: usersTable.email, statusMessage: usersTable.statusMessage, createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt }).from(usersTable).where(q ? ilike(usersTable.nickname, `%${q}%`) : undefined).orderBy(desc(usersTable.createdAt)).limit(100);
  res.json(rows.map((row) => ({ ...row, profileImageUrl: null })));
});

router.get("/admin/members/:id", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const [member] = await db.select({ id: usersTable.id, nickname: usersTable.nickname, email: usersTable.email, statusMessage: usersTable.statusMessage, notificationEnabled: usersTable.notificationEnabled, talkAnalysisEnabled: usersTable.talkAnalysisEnabled, createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt }).from(usersTable).where(eq(usersTable.id, String(req.params.id))).limit(1);
  if (!member) { res.status(404).json({ error: "not_found" }); return; }
  const [fan] = await db.select().from(fanProfilesTable).where(eq(fanProfilesTable.userId, member.id)).limit(1);
  const [mode] = await db.select().from(userPlayModesTable).where(eq(userPlayModesTable.userId, member.id)).limit(1);
  const stars = await db.select({ id: starProfilesTable.id, displayName: starProfilesTable.displayName, level: starProfilesTable.level, xp: starProfilesTable.xp, category: starProfilesTable.category, ownershipStatus: starProfilesTable.ownershipStatus, equippedAt: starProfilesTable.equippedAt }).from(starProfilesTable).where(eq(starProfilesTable.userId, member.id));
  const wallets = await db.select({ walletAddress: userWalletsTable.walletAddress, chainId: userWalletsTable.chainId, verifiedAt: userWalletsTable.verifiedAt, nftVerifiedAt: userWalletsTable.nftVerifiedAt }).from(userWalletsTable).where(eq(userWalletsTable.userId, member.id));
  const [postCount] = await db.select({ total: count() }).from(starFeedPostsTable).where(eq(starFeedPostsTable.authorUserId, member.id));
  const [reportCount] = await db.select({ total: count() }).from(starFeedReportsTable).innerJoin(starFeedPostsTable, eq(starFeedReportsTable.postId, starFeedPostsTable.id)).where(eq(starFeedPostsTable.authorUserId, member.id));
  const blocks = await db.select({ blockerUserId: blockedUsersTable.blockerUserId, blockedUserId: blockedUsersTable.blockedUserId, createdAt: blockedUsersTable.createdAt }).from(blockedUsersTable).where(or(eq(blockedUsersTable.blockerUserId, member.id), eq(blockedUsersTable.blockedUserId, member.id)));
  const profiles = await db.select({ id: characterProfilesTable.id, type: characterProfilesTable.type, handle: characterProfilesTable.handle, displayName: characterProfilesTable.displayName, status: characterProfilesTable.status, level: characterProfilesTable.level, xp: characterProfilesTable.xp, jobKey: characterProfilesTable.jobKey, jobStage: characterProfilesTable.jobStage, createdAt: characterProfilesTable.createdAt, archivedAt: characterProfilesTable.archivedAt }).from(characterProfilesTable).where(eq(characterProfilesTable.ownerUserId, member.id)).orderBy(desc(characterProfilesTable.createdAt));
  res.json({ member: { ...member, profileImageUrl: null }, profiles, sections: { fan: fan ?? null, mode: mode ?? null, star: stars, nft: stars.filter((star) => star.ownershipStatus === "verified"), wallets, activity: { postCount: Number(postCount?.total ?? 0), reportCount: Number(reportCount?.total ?? 0), blocks } } });
});

router.patch("/admin/profiles/:profileId/status", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const parsed = z.object({ status: z.enum(["active", "locked"]), reason: z.string().trim().min(2).max(300) }).safeParse(req.body);
  if (!parsed.success || !z.uuid().safeParse(req.params.profileId).success) { res.status(400).json({ error: "invalid_profile_status" }); return; }
  const [before] = await db.select().from(characterProfilesTable).where(eq(characterProfilesTable.id, String(req.params.profileId))).limit(1);
  if (!before) { res.status(404).json({ error: "profile_not_found" }); return; }
  const [updated] = await db.update(characterProfilesTable).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(characterProfilesTable.id, before.id)).returning();
  await db.insert(adminAuditLogsTable).values({ actorUserId: req.dbUser.id, action: "character_profile_status_change", targetType: "character_profile", targetId: before.id, reason: parsed.data.reason, beforeJson: { status: before.status }, afterJson: { status: updated.status } });
  res.json(updated);
});

export default router;
