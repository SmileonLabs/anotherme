import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { addSubscription } from "../lib/push";

const router: IRouter = Router();

// Only this account may browse the full member directory ("전체 회원" list on the
// add-friend screen). Every other account gets an empty list and must add friends
// by email search or invite code/link instead.
const DIRECTORY_ADMIN_EMAIL = "contact@smileon.app";

const toPublic = (u: typeof usersTable.$inferSelect) => ({
  id: u.id,
  email: u.email,
  nickname: u.nickname,
  profileImageUrl: u.profileImageUrl ?? null,
  statusMessage: u.statusMessage ?? null,
});

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  if (
    req.dbUser!.email.toLowerCase() !== DIRECTORY_ADMIN_EMAIL.toLowerCase()
  ) {
    res.json([]);
    return;
  }
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
    createdAt: user.createdAt.toISOString(),
  });
});

router.patch("/users/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const { nickname, statusMessage, profileImageUrl, notificationEnabled } = req.body;

  const updates: Record<string, unknown> = {};
  if (nickname !== undefined) updates.nickname = nickname;
  if (statusMessage !== undefined) updates.statusMessage = statusMessage;
  if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;
  if (notificationEnabled !== undefined) updates.notificationEnabled = notificationEnabled;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({
    id: updated.id,
    clerkId: updated.clerkId,
    email: updated.email,
    nickname: updated.nickname,
    profileImageUrl: updated.profileImageUrl ?? null,
    statusMessage: updated.statusMessage ?? null,
    pushToken: updated.pushToken ?? null,
    notificationEnabled: updated.notificationEnabled,
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
