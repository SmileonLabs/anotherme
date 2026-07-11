import { Router, type IRouter } from "express";
import { desc, eq, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  profileUpdateHistoryTable,
  starFeedPostsTable,
  usersTable,
  type ProfileUpdateHistoryKind,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { addSubscription } from "../lib/push";

const router: IRouter = Router();

const toPublic = (u: typeof usersTable.$inferSelect) => ({
  id: u.id,
  email: u.email,
  nickname: u.nickname,
  profileImageUrl: u.profileImageUrl ?? null,
  statusMessage: u.statusMessage ?? null,
});

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
  res.json(users.filter((u) => u.id !== req.dbUser!.id).map(toPublic));
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
  const { nickname, statusMessage, profileImageUrl, notificationEnabled, talkAnalysisEnabled } = req.body;

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
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }
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

router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const email = typeof req.query.email === "string" ? req.query.email : "";
  if (!email) {
    res.status(400).json({ error: "email query param required" });
    return;
  }
  const users = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.email, `%${email}%`))
    .limit(20);

  res.json(users.filter((u) => u.id !== req.dbUser!.id).map(toPublic));
});

export default router;
