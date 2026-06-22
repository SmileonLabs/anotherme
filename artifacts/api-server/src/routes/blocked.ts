import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { blockedUsersTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/blocked", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const blocked = await db
    .select()
    .from(blockedUsersTable)
    .where(eq(blockedUsersTable.blockerUserId, userId));

  const users = await Promise.all(
    blocked.map(async (b) => {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, b.blockedUserId));
      return u ? { id: u.id, email: u.email, nickname: u.nickname, profileImageUrl: u.profileImageUrl ?? null, statusMessage: u.statusMessage ?? null } : null;
    }),
  );

  res.json(users.filter(Boolean));
});

router.post("/blocked", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const { blockedUserId } = req.body;
  if (!blockedUserId || blockedUserId === userId) {
    res.status(400).json({ error: "Invalid blockedUserId" });
    return;
  }

  await db
    .insert(blockedUsersTable)
    .values({ blockerUserId: userId, blockedUserId })
    .onConflictDoNothing();

  res.sendStatus(201);
});

router.delete("/blocked/:userId", requireAuth, async (req, res): Promise<void> => {
  const myId = req.dbUser!.id;
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  await db
    .delete(blockedUsersTable)
    .where(and(eq(blockedUsersTable.blockerUserId, myId), eq(blockedUsersTable.blockedUserId, raw)));
  res.sendStatus(204);
});

export default router;
