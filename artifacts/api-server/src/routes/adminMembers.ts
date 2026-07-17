import { Router, type IRouter } from "express";
import { count, desc, eq, ilike, or } from "drizzle-orm";
import { blockedUsersTable, db, fanProfilesTable, starFeedPostsTable, starFeedReportsTable, starProfilesTable, userPlayModesTable, userWalletsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { hasAdminAccess } from "../lib/adminRbac";

const router: IRouter = Router();

router.get("/admin/members", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rows = await db.select({ id: usersTable.id, nickname: usersTable.nickname, email: usersTable.email, profileImageUrl: usersTable.profileImageUrl, statusMessage: usersTable.statusMessage, createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt }).from(usersTable).where(q ? ilike(usersTable.nickname, `%${q}%`) : undefined).orderBy(desc(usersTable.createdAt)).limit(100);
  res.json(rows);
});

router.get("/admin/members/:id", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const [member] = await db.select({ id: usersTable.id, nickname: usersTable.nickname, email: usersTable.email, profileImageUrl: usersTable.profileImageUrl, statusMessage: usersTable.statusMessage, notificationEnabled: usersTable.notificationEnabled, talkAnalysisEnabled: usersTable.talkAnalysisEnabled, createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt }).from(usersTable).where(eq(usersTable.id, String(req.params.id))).limit(1);
  if (!member) { res.status(404).json({ error: "not_found" }); return; }
  const [fan] = await db.select().from(fanProfilesTable).where(eq(fanProfilesTable.userId, member.id)).limit(1);
  const [mode] = await db.select().from(userPlayModesTable).where(eq(userPlayModesTable.userId, member.id)).limit(1);
  const stars = await db.select({ id: starProfilesTable.id, displayName: starProfilesTable.displayName, level: starProfilesTable.level, xp: starProfilesTable.xp, category: starProfilesTable.category, ownershipStatus: starProfilesTable.ownershipStatus, equippedAt: starProfilesTable.equippedAt }).from(starProfilesTable).where(eq(starProfilesTable.userId, member.id));
  const wallets = await db.select({ walletAddress: userWalletsTable.walletAddress, chainId: userWalletsTable.chainId, verifiedAt: userWalletsTable.verifiedAt, nftVerifiedAt: userWalletsTable.nftVerifiedAt }).from(userWalletsTable).where(eq(userWalletsTable.userId, member.id));
  const [postCount] = await db.select({ total: count() }).from(starFeedPostsTable).where(eq(starFeedPostsTable.authorUserId, member.id));
  const [reportCount] = await db.select({ total: count() }).from(starFeedReportsTable).innerJoin(starFeedPostsTable, eq(starFeedReportsTable.postId, starFeedPostsTable.id)).where(eq(starFeedPostsTable.authorUserId, member.id));
  const blocks = await db.select({ blockerUserId: blockedUsersTable.blockerUserId, blockedUserId: blockedUsersTable.blockedUserId, createdAt: blockedUsersTable.createdAt }).from(blockedUsersTable).where(or(eq(blockedUsersTable.blockerUserId, member.id), eq(blockedUsersTable.blockedUserId, member.id)));
  res.json({ member, sections: { fan: fan ?? null, mode: mode ?? null, star: stars, nft: stars.filter((star) => star.ownershipStatus === "verified"), wallets, activity: { postCount: Number(postCount?.total ?? 0), reportCount: Number(reportCount?.total ?? 0), blocks } } });
});

export default router;
