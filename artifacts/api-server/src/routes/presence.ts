import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, chatRoomMembersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { getPresenceStates, markPresence } from "../lib/presence";

const router: IRouter = Router();
const MAX_QUERY_USERS = 50;

function parseIds(raw: unknown): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return [];
  return Array.from(new Set(value.split(",").map((id) => id.trim()).filter(Boolean))).slice(0, MAX_QUERY_USERS);
}

router.post("/presence/heartbeat", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const body = req.body as { roomId?: unknown; platform?: unknown };
  const roomId = typeof body.roomId === "string" && body.roomId.trim() ? body.roomId.trim() : null;
  const platform = typeof body.platform === "string" && body.platform.trim() ? body.platform.trim() : null;

  await markPresence(userId, { roomId, platform });
  res.sendStatus(204);
});

router.get("/presence/users", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const requestedIds = parseIds(req.query.ids);
  if (requestedIds.length === 0) {
    res.json({ users: [] });
    return;
  }

  const myMemberships = await db
    .select({ roomId: chatRoomMembersTable.roomId })
    .from(chatRoomMembersTable)
    .where(eq(chatRoomMembersTable.userId, userId));
  const roomIds = myMemberships.map((m) => m.roomId);

  const allowedIds = new Set<string>(requestedIds.includes(userId) ? [userId] : []);
  if (roomIds.length > 0) {
    const sharedMembers = await db
      .select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable)
      .where(and(inArray(chatRoomMembersTable.roomId, roomIds), inArray(chatRoomMembersTable.userId, requestedIds)));
    for (const member of sharedMembers) allowedIds.add(member.userId);
  }

  const allowedRequestedIds = requestedIds.filter((id) => allowedIds.has(id));
  const states = await getPresenceStates(allowedRequestedIds);
  res.json({ users: states });
});

export default router;
