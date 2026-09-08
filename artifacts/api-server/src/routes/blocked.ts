import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { blockedUsersTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { toPublicUser } from "../lib/publicUser";
import { lockUserPair } from "../lib/chatDelivery";
import { getActiveCharacterIdentityMap } from "../lib/characterProfiles";

const router: IRouter = Router();
const blockUserSchema = z.object({ blockedUserId: z.uuid() }).strict();

router.get("/blocked", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const blocked = await db
    .select()
    .from(blockedUsersTable)
    .where(eq(blockedUsersTable.blockerUserId, userId));

  const identities = await getActiveCharacterIdentityMap(blocked.map((row) => row.blockedUserId));
  const users = await Promise.all(
    blocked.map(async (b) => {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, b.blockedUserId));
      const profile = u ? identities.get(u.id) ?? null : null;
      return u ? {
        ...toPublicUser(u),
        nickname: profile?.displayName ?? u.nickname,
        profileImageUrl: profile?.profileImageUrl ?? null,
        profile,
      } : null;
    }),
  );

  res.json(users.filter(Boolean));
});

router.post("/blocked", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const parsed = blockUserSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.blockedUserId === userId) {
    res.status(400).json({ error: "Invalid blockedUserId" });
    return;
  }
  const { blockedUserId } = parsed.data;

  await db.transaction(async (tx) => {
    await lockUserPair(tx, userId, blockedUserId);
    await tx
      .insert(blockedUsersTable)
      .values({ blockerUserId: userId, blockedUserId })
      .onConflictDoNothing({ target: [blockedUsersTable.blockerUserId, blockedUsersTable.blockedUserId] });
  });

  res.sendStatus(201);
});

router.delete("/blocked/:userId", requireAuth, async (req, res): Promise<void> => {
  const myId = req.dbUser!.id;
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db.transaction(async (tx) => {
    await lockUserPair(tx, myId, raw);
    await tx
      .delete(blockedUsersTable)
      .where(and(eq(blockedUsersTable.blockerUserId, myId), eq(blockedUsersTable.blockedUserId, raw)));
  });
  res.sendStatus(204);
});

export default router;
