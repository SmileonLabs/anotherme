import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  profileUpdateHistoryTable,
  starFeedPostsTable,
  usersTable,
  type ProfileUpdateHistoryKind,
  fanProfilesTable,
  starProfilesTable,
  starProfileFollowsTable,
  starGrowthEventsTable,
  battleSessionsTable,
  chatRoomMembersTable,
  blockedUsersTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { addSubscription } from "../lib/push";
import { toPublicUser } from "../lib/publicUser";
import { rateLimit } from "../lib/rateLimit";
import { listPublicStarFeedPostsByAuthor } from "../lib/starFeed";

const router: IRouter = Router();

const profileImageUrlSchema = z.string().trim().max(2_048).refine(
  (value) => value.startsWith("/objects/") || /^https:\/\//i.test(value),
  "profileImageUrl must be an internal object path or HTTPS URL",
);
const updateMeSchema = z.object({
  nickname: z.string().trim().min(1).max(30).optional(),
  statusMessage: z.string().trim().max(200).nullable().optional(),
  profileImageUrl: profileImageUrlSchema.nullable().optional(),
  notificationEnabled: z.boolean().optional(),
  talkAnalysisEnabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");
const pushTokenSchema = z.object({ token: z.string().min(1).max(8_192) }).strict();
const userSearchSchema = z.object({ email: z.email().max(320).transform((value) => value.trim().toLowerCase()) });
const publicProfileParams = z.object({ userId: z.string().uuid() });

async function isProfileBlocked(viewerUserId: string, targetUserId: string): Promise<boolean> {
  if (viewerUserId === targetUserId) return false;
  const [row] = await db.select({ id: blockedUsersTable.id }).from(blockedUsersTable).where(sql`(${blockedUsersTable.blockerUserId} = ${viewerUserId} AND ${blockedUsersTable.blockedUserId} = ${targetUserId}) OR (${blockedUsersTable.blockerUserId} = ${targetUserId} AND ${blockedUsersTable.blockedUserId} = ${viewerUserId})`).limit(1);
  return !!row;
}

function profileUpdateKind(args: {
  profileImageChanged: boolean;
  statusMessageChanged: boolean;
}): ProfileUpdateHistoryKind {
  if (args.profileImageChanged && args.statusMessageChanged) return "profile_update";
  return args.profileImageChanged ? "profile_image" : "status_message";
}

function profileUpdateTitle(args: {
  profileImageChanged: boolean;
  statusMessageChanged: boolean;
}): string {
  if (args.profileImageChanged && args.statusMessageChanged) return "프로필을 업데이트했습니다";
  return args.profileImageChanged ? "프로필 사진을 변경했습니다" : "상태 메시지를 변경했습니다";
}

function profileUpdateBody(args: {
  profileImageChanged: boolean;
  statusMessageChanged: boolean;
  newStatusMessage: string | null;
}): string {
  if (args.profileImageChanged && args.statusMessageChanged) {
    return args.newStatusMessage
      ? `프로필 사진과 상태 메시지를 변경했습니다.\n${args.newStatusMessage}`
      : "프로필 사진을 변경하고 상태 메시지를 비웠습니다.";
  }
  if (args.profileImageChanged) return "프로필 사진을 변경했습니다.";
  return args.newStatusMessage ? args.newStatusMessage : "상태 메시지를 비웠습니다.";
}

function serializeProfileHistory(row: typeof profileUpdateHistoryTable.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    oldProfileImageUrl: row.oldProfileImageUrl ?? null,
    newProfileImageUrl: row.newProfileImageUrl ?? null,
    oldStatusMessage: row.oldStatusMessage ?? null,
    newStatusMessage: row.newStatusMessage ?? null,
    feedPostId: row.feedPostId ?? null,
    isVisible: row.isVisible,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).limit(1000);
  res.json(users.filter((u) => u.id !== req.dbUser!.id).map(toPublicUser));
});

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  res.json({
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    nickname: user.nickname,
    profileImageUrl: user.profileImageUrl ?? null,
    statusMessage: user.statusMessage ?? null,
    pushToken: user.pushToken ?? null,
    notificationEnabled: user.notificationEnabled,
    talkAnalysisEnabled: user.talkAnalysisEnabled,
    createdAt: user.createdAt.toISOString(),
  });
});

router.get("/users/:userId/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = publicProfileParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "invalid", message: "Invalid user id" }); return; }
  const userId = parsed.data.userId;
  if (await isProfileBlocked(req.dbUser!.id, userId)) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }
  const [user] = await db.select({ id: usersTable.id, nickname: usersTable.nickname, profileImageUrl: usersTable.profileImageUrl, statusMessage: usersTable.statusMessage, createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }
  const [fan] = await db.select({ level: fanProfilesTable.level, xp: fanProfilesTable.xp, stats: fanProfilesTable.stats }).from(fanProfilesTable).where(eq(fanProfilesTable.userId, userId)).limit(1);
  const stars = await db.select({ id: starProfilesTable.id, displayName: starProfilesTable.displayName, starKey: starProfilesTable.starKey, imageUrl: starProfilesTable.imageUrl, stage: starProfilesTable.stage, level: starProfilesTable.level, xp: starProfilesTable.xp, equippedAt: starProfilesTable.equippedAt }).from(starProfilesTable).where(eq(starProfilesTable.userId, userId)).orderBy(desc(starProfilesTable.equippedAt), desc(starProfilesTable.createdAt));
  const [followers] = await db.select({ value: count() }).from(starProfileFollowsTable).innerJoin(starProfilesTable, eq(starProfilesTable.id, starProfileFollowsTable.starProfileId)).where(eq(starProfilesTable.userId, userId));
  const [following] = await db.select({ value: count() }).from(starProfileFollowsTable).where(eq(starProfileFollowsTable.followerUserId, userId));
  const followedStarIds = stars.length ? await db.select({ starProfileId: starProfileFollowsTable.starProfileId }).from(starProfileFollowsTable).where(and(eq(starProfileFollowsTable.followerUserId, req.dbUser!.id), eq(starProfileFollowsTable.starProfileId, stars[0].id))) : [];
  res.json({ id: user.id, nickname: user.nickname, profileImageUrl: user.profileImageUrl ?? null, statusMessage: user.statusMessage ?? null, createdAt: user.createdAt.toISOString(), fan: fan ?? { level: 1, xp: 0, stats: null }, stars, followerCount: Number(followers?.value ?? 0), followingCount: Number(following?.value ?? 0), followedStarIds: followedStarIds.map((item) => item.starProfileId) });
});

router.get("/users/:userId/posts", requireAuth, async (req, res): Promise<void> => {
  const parsed = publicProfileParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "invalid", message: "Invalid user id" }); return; }
  if (await isProfileBlocked(req.dbUser!.id, parsed.data.userId)) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }
  const limit = z.coerce.number().int().min(1).max(100).catch(30).parse(req.query.limit);
  const cursor = typeof req.query.cursor === "string" && !Number.isNaN(Date.parse(req.query.cursor)) ? req.query.cursor : undefined;
  const starProfileId = typeof req.query.starId === "string" && z.string().uuid().safeParse(req.query.starId).success ? req.query.starId : undefined;
  res.json(await listPublicStarFeedPostsByAuthor(req.dbUser!.id, parsed.data.userId, limit, starProfileId, cursor));
});

router.get("/users/:userId/growth-records", requireAuth, async (req, res): Promise<void> => {
  const parsed = publicProfileParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "invalid", message: "Invalid user id" }); return; }
  if (await isProfileBlocked(req.dbUser!.id, parsed.data.userId)) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }
  const limit = z.coerce.number().int().min(1).max(100).catch(30).parse(req.query.limit);
  const cursor = typeof req.query.cursor === "string" && !Number.isNaN(Date.parse(req.query.cursor)) ? new Date(req.query.cursor) : undefined;
  const rows = await db.select({ id: starGrowthEventsTable.id, starProfileId: starGrowthEventsTable.starProfileId, eventType: starGrowthEventsTable.eventType, xpDelta: starGrowthEventsTable.xpDelta, reason: starGrowthEventsTable.reason, createdAt: starGrowthEventsTable.createdAt }).from(starGrowthEventsTable).where(and(eq(starGrowthEventsTable.userId, parsed.data.userId), ...(cursor ? [lt(starGrowthEventsTable.createdAt, cursor)] : []))).orderBy(desc(starGrowthEventsTable.createdAt)).limit(limit);
  res.json({ items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), nextCursor: rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null });
});

router.get("/users/:userId/battle-results", requireAuth, async (req, res): Promise<void> => {
  const parsed = publicProfileParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "invalid", message: "Invalid user id" }); return; }
  if (await isProfileBlocked(req.dbUser!.id, parsed.data.userId)) { res.status(404).json({ error: "not_found", message: "Profile not found" }); return; }
  const limit = z.coerce.number().int().min(1).max(100).catch(30).parse(req.query.limit);
  const cursor = typeof req.query.cursor === "string" && !Number.isNaN(Date.parse(req.query.cursor)) ? new Date(req.query.cursor) : undefined;
  const sessions = await db.select({ roomId: battleSessionsTable.roomId, state: battleSessionsTable.state, updatedAt: battleSessionsTable.updatedAt }).from(battleSessionsTable).innerJoin(chatRoomMembersTable, and(eq(chatRoomMembersTable.roomId, battleSessionsTable.roomId), eq(chatRoomMembersTable.userId, parsed.data.userId))).where(and(eq(battleSessionsTable.status, "ended"), ...(cursor ? [lt(battleSessionsTable.updatedAt, cursor)] : []))).orderBy(desc(battleSessionsTable.updatedAt)).limit(limit);
  res.json({ items: sessions.map(({ roomId, state, updatedAt }) => {
    const me = state.participants.find((participant) => participant.userId === parsed.data.userId);
    const opponent = state.participants.find((participant) => participant.userId !== parsed.data.userId);
    const outcome = state.winnerUserId === null ? "draw" : state.winnerUserId === parsed.data.userId ? "win" : "loss";
    return { roomId, topic: state.topic, category: state.category, outcome, myScore: me?.totalScore ?? 0, opponentScore: opponent?.totalScore ?? 0, opponentName: opponent?.name ?? "상대", completedAt: updatedAt.toISOString() };
  }), nextCursor: sessions.length === limit ? sessions[sessions.length - 1].updatedAt.toISOString() : null });
});

router.get("/users/me/profile-history", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(profileUpdateHistoryTable)
    .where(eq(profileUpdateHistoryTable.userId, req.dbUser!.id))
    .orderBy(desc(profileUpdateHistoryTable.createdAt))
    .limit(100);
  res.json(rows.map(serializeProfileHistory));
});

router.patch("/users/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile update" });
    return;
  }
  const { nickname, statusMessage, profileImageUrl, notificationEnabled, talkAnalysisEnabled } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (nickname !== undefined) updates.nickname = nickname;
  if (statusMessage !== undefined) updates.statusMessage = statusMessage;
  if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;
  if (notificationEnabled !== undefined) updates.notificationEnabled = notificationEnabled;
  if (talkAnalysisEnabled !== undefined) updates.talkAnalysisEnabled = talkAnalysisEnabled;

  const profileImageChanged =
    profileImageUrl !== undefined && (profileImageUrl ?? null) !== (user.profileImageUrl ?? null);
  const statusMessageChanged =
    statusMessage !== undefined && (statusMessage ?? null) !== (user.statusMessage ?? null);
  const shouldRecordProfileUpdate = profileImageChanged || statusMessageChanged;

  const updated = await db.transaction(async (tx) => {
    const [updatedUser] = Object.keys(updates).length > 0
      ? await tx
          .update(usersTable)
          .set(updates)
          .where(eq(usersTable.id, user.id))
          .returning()
      : await tx.select().from(usersTable).where(eq(usersTable.id, user.id));

    if (shouldRecordProfileUpdate) {
      const newProfileImageUrl = updatedUser.profileImageUrl ?? null;
      const newStatusMessage = updatedUser.statusMessage ?? null;
      const kind = profileUpdateKind({ profileImageChanged, statusMessageChanged });
      const [post] = await tx
        .insert(starFeedPostsTable)
        .values({
          authorUserId: user.id,
          kind: "profile_update",
          title: profileUpdateTitle({ profileImageChanged, statusMessageChanged }),
          body: profileUpdateBody({ profileImageChanged, statusMessageChanged, newStatusMessage }),
          metadata: {
            type: "profile_update",
            profileImageChanged,
            statusMessageChanged,
            newProfileImageUrl,
            newStatusMessage,
          },
        })
        .returning({ id: starFeedPostsTable.id });

      await tx.insert(profileUpdateHistoryTable).values({
        userId: user.id,
        kind,
        oldProfileImageUrl: profileImageChanged ? user.profileImageUrl ?? null : null,
        newProfileImageUrl: profileImageChanged ? newProfileImageUrl : null,
        oldStatusMessage: statusMessageChanged ? user.statusMessage ?? null : null,
        newStatusMessage: statusMessageChanged ? newStatusMessage : null,
        feedPostId: post.id,
      });
    }

    return updatedUser;
  });

  res.json({
    id: updated.id,
    clerkId: updated.clerkId,
    email: updated.email,
    nickname: updated.nickname,
    profileImageUrl: updated.profileImageUrl ?? null,
    statusMessage: updated.statusMessage ?? null,
    pushToken: updated.pushToken ?? null,
    notificationEnabled: updated.notificationEnabled,
    talkAnalysisEnabled: updated.talkAnalysisEnabled,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/users/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  await db.delete(usersTable).where(eq(usersTable.id, user.id));
  res.sendStatus(204);
});

router.post("/users/me/push-token", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  const { token } = parsed.data;
  await addSubscription(user.id, token);
  const [updated] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.id));

  res.json({
    id: updated.id,
    clerkId: updated.clerkId,
    email: updated.email,
    nickname: updated.nickname,
    profileImageUrl: updated.profileImageUrl ?? null,
    statusMessage: updated.statusMessage ?? null,
    pushToken: updated.pushToken ?? null,
    notificationEnabled: updated.notificationEnabled,
    talkAnalysisEnabled: updated.talkAnalysisEnabled,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.get("/users/search", requireAuth, rateLimit({ name: "user-search", limit: 20, windowSeconds: 60 }), async (req, res): Promise<void> => {
  const parsed = userSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email query param required" });
    return;
  }
  const { email } = parsed.data;
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  res.json(users.filter((u) => u.id !== req.dbUser!.id).map(toPublicUser));
});

export default router;
