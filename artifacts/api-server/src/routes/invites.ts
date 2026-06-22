import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { invitesTable, friendRequestsTable, friendshipsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function generateCode(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

router.post("/invites", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const expiredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invite] = await db
    .insert(invitesTable)
    .values({ inviteCode: generateCode(), inviterUserId: userId, expiredAt })
    .returning();

  res.status(201).json({
    id: invite.id,
    inviteCode: invite.inviteCode,
    inviterUserId: invite.inviterUserId,
    status: invite.status,
    createdAt: invite.createdAt.toISOString(),
    expiredAt: invite.expiredAt?.toISOString() ?? null,
  });
});

router.post("/invites/redeem", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const { inviteCode } = req.body;
  if (!inviteCode) {
    res.status(400).json({ error: "inviteCode required" });
    return;
  }

  const [invite] = await db
    .select()
    .from(invitesTable)
    .where(and(eq(invitesTable.inviteCode, inviteCode), eq(invitesTable.status, "active")));

  if (!invite) {
    res.status(400).json({ error: "Invalid or expired invite" });
    return;
  }

  if (invite.expiredAt && invite.expiredAt < new Date()) {
    await db.update(invitesTable).set({ status: "expired" }).where(eq(invitesTable.id, invite.id));
    res.status(400).json({ error: "Invite expired" });
    return;
  }

  if (invite.inviterUserId === userId) {
    res.status(400).json({ error: "Cannot use your own invite" });
    return;
  }

  await db.update(invitesTable).set({ status: "used", usedByUserId: userId }).where(eq(invitesTable.id, invite.id));

  const [request] = await db
    .insert(friendRequestsTable)
    .values({ fromUserId: userId, toUserId: invite.inviterUserId })
    .returning();

  res.json({
    id: request.id,
    fromUserId: request.fromUserId,
    toUserId: request.toUserId,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  });
});

export default router;
