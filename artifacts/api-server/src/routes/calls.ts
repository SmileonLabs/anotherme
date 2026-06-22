import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gt, like, or } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import {
  db,
  callsTable,
  usersTable,
  messagesTable,
  chatRoomsTable,
  chatRoomMembersTable,
} from "@workspace/db";
import type { Call } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { sendCallPush } from "../lib/push";

const router: IRouter = Router();

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const RING_TIMEOUT_MS = 45_000;

function livekitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

// Opportunistically transition a long-unanswered ringing call to "missed".
async function maybeExpire(call: Call): Promise<Call> {
  if (call.status === "ringing" && Date.now() - call.createdAt.getTime() > RING_TIMEOUT_MS) {
    const [updated] = await db
      .update(callsTable)
      .set({ status: "missed", endedAt: new Date() })
      .where(and(eq(callsTable.id, call.id), eq(callsTable.status, "ringing")))
      .returning();
    if (updated) await endCallMessage(call.id);
    return updated ?? call;
  }
  return call;
}

async function createToken(roomName: string, identity: string, name: string): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!, { identity, name });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

// Posts the in-chat "call" card (a messages row of type "call") so both parties
// can join the call straight from the conversation. The content carries the
// callId + status so the card can render a "통화 참여" button and later flip to
// "ended". Reuses the messages table — no migration (same pattern as image/file).
async function postCallMessage(roomId: string, callerId: string, callId: string): Promise<void> {
  const content = JSON.stringify({ callId, status: "ringing" });
  const [message] = await db
    .insert(messagesTable)
    .values({ roomId, senderId: callerId, type: "call", content })
    .returning();
  await db
    .update(chatRoomsTable)
    .set({ lastMessage: "📞 보이스톡", lastMessageAt: new Date() })
    .where(eq(chatRoomsTable.id, roomId));
  // A new call resurfaces the room for anyone who previously hid (left) it.
  await db
    .update(chatRoomMembersTable)
    .set({ hiddenAt: null })
    .where(eq(chatRoomMembersTable.roomId, roomId));
  // The caller has implicitly read their own call card so it never counts as
  // unread for them.
  await db
    .update(chatRoomMembersTable)
    .set({ lastReadMessageId: message.id })
    .where(
      and(
        eq(chatRoomMembersTable.roomId, roomId),
        eq(chatRoomMembersTable.userId, callerId),
      ),
    );
}

// Flips the in-chat call card to "ended" so its "통화 참여" button disappears.
// The call row has no roomId, so the card is located by its callId substring in
// the JSON content (avoids a migration).
async function endCallMessage(callId: string): Promise<void> {
  await db
    .update(messagesTable)
    .set({ content: JSON.stringify({ callId, status: "ended" }) })
    .where(
      and(eq(messagesTable.type, "call"), like(messagesTable.content, `%"callId":"${callId}"%`)),
    );
}

function serializeCall(c: Call) {
  return {
    id: c.id,
    roomName: c.roomName,
    callerId: c.callerId,
    calleeId: c.calleeId,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    endedAt: c.endedAt?.toISOString() ?? null,
  };
}

function toPublicUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    nickname: u.nickname,
    profileImageUrl: u.profileImageUrl ?? null,
    statusMessage: u.statusMessage ?? null,
  };
}

router.post("/calls", requireAuth, async (req, res): Promise<void> => {
  if (!livekitConfigured()) {
    res.status(503).json({ error: "음성 통화 서버가 설정되지 않았습니다" });
    return;
  }
  const userId = req.dbUser!.id;
  const { calleeId, roomId } = req.body as { calleeId?: string; roomId?: string };
  if (!calleeId || calleeId === userId) {
    res.status(400).json({ error: "calleeId is required" });
    return;
  }

  const [callee] = await db.select().from(usersTable).where(eq(usersTable.id, calleeId));
  if (!callee) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const roomName = `call_${crypto.randomUUID()}`;
  const [call] = await db
    .insert(callsTable)
    .values({ roomName, callerId: userId, calleeId, status: "ringing" })
    .returning();

  // Post the in-chat call card so both parties can join from the conversation.
  // Only after verifying roomId is a 1:1 room where BOTH caller and callee are
  // members — otherwise an authenticated user could inject a call card and mutate
  // room metadata (lastMessage/hiddenAt) in arbitrary rooms.
  if (roomId) {
    try {
      const [room] = await db
        .select({ type: chatRoomsTable.type })
        .from(chatRoomsTable)
        .where(eq(chatRoomsTable.id, roomId));
      const members = await db
        .select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, roomId));
      const memberIds = new Set(members.map((m) => m.userId));
      const valid =
        room?.type === "direct" && memberIds.has(userId) && memberIds.has(calleeId);
      if (valid) {
        await postCallMessage(roomId, userId, call.id);
      } else {
        req.log.warn({ roomId, userId, calleeId }, "Skipped call card for invalid room");
      }
    } catch (err) {
      req.log.error({ err, roomId, callId: call.id }, "Failed to post call message");
    }
  }

  // Always-on voice-call push: ignores focus/away gating AND the user's
  // notification toggle so an incoming call is never silently missed.
  void sendCallPush(calleeId, {
    title: "보이스톡",
    body: `${req.dbUser!.nickname}님이 음성 통화를 걸었습니다`,
    url: roomId ? `/chat/${roomId}` : "/",
    tag: `call-${call.id}`,
  });

  const token = await createToken(roomName, userId, req.dbUser!.nickname);
  res.status(201).json({ call: serializeCall(call), token, url: LIVEKIT_URL });
});

router.get("/calls/incoming", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const since = new Date(Date.now() - 60_000);
  const rows = await db
    .select()
    .from(callsTable)
    .where(
      and(
        eq(callsTable.calleeId, userId),
        eq(callsTable.status, "ringing"),
        gt(callsTable.createdAt, since),
      ),
    )
    .orderBy(desc(callsTable.createdAt));

  const result = await Promise.all(
    rows.map(async (c) => {
      const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, c.callerId));
      return { ...serializeCall(c), caller: caller ? toPublicUser(caller) : null };
    }),
  );
  res.json(result.filter((r) => r.caller));
});

router.get("/calls/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const fresh = await maybeExpire(call);
  res.json(serializeCall(fresh));
});

router.post("/calls/:id/accept", requireAuth, async (req, res): Promise<void> => {
  if (!livekitConfigured()) {
    res.status(503).json({ error: "음성 통화 서버가 설정되지 않았습니다" });
    return;
  }
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || call.calleeId !== userId) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const [updated] = await db
    .update(callsTable)
    .set({ status: "active" })
    .where(
      and(
        eq(callsTable.id, raw),
        or(eq(callsTable.status, "ringing"), eq(callsTable.status, "active")),
      ),
    )
    .returning();
  if (!updated) {
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  const token = await createToken(call.roomName, userId, req.dbUser!.nickname);
  res.json({ call: serializeCall(updated), token, url: LIVEKIT_URL });
});

router.post("/calls/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || call.calleeId !== userId) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const [updated] = await db
    .update(callsTable)
    .set({ status: "declined", endedAt: new Date() })
    .where(and(eq(callsTable.id, raw), eq(callsTable.status, "ringing")))
    .returning();
  if (updated) await endCallMessage(raw);
  // If it was already accepted/ended, leave it as-is and return current state.
  res.json(serializeCall(updated ?? call));
});

router.post("/calls/:id/end", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  if (call.status === "ended" || call.status === "declined") {
    res.json(serializeCall(call));
    return;
  }
  const [updated] = await db
    .update(callsTable)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(callsTable.id, raw))
    .returning();
  await endCallMessage(raw);
  res.json(serializeCall(updated));
});

// Join a call from the in-chat call card. Either party (caller or callee) may
// join. If the callee joins while it is still ringing, the call flips to active.
// Already-finished calls (ended/declined/missed) return 409 so the card can show
// "통화 종료" instead of a dead join button.
router.post("/calls/:id/join", requireAuth, async (req, res): Promise<void> => {
  if (!livekitConfigured()) {
    res.status(503).json({ error: "음성 통화 서버가 설정되지 않았습니다" });
    return;
  }
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [found] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!found || (found.callerId !== userId && found.calleeId !== userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  // Lazily expire a long-unanswered ringing call so a stale card can't be joined.
  const call = await maybeExpire(found);
  if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  // The callee joining a ringing call accepts it (caller stays as-is on active).
  // The status-guarded UPDATE is atomic: if a concurrent end/decline/expire won
  // the race, `updated` is null and we must 409 instead of issuing a token for a
  // dead call.
  let current = call;
  if (call.calleeId === userId && call.status === "ringing") {
    const [updated] = await db
      .update(callsTable)
      .set({ status: "active" })
      .where(and(eq(callsTable.id, raw), eq(callsTable.status, "ringing")))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "이미 종료된 통화입니다" });
      return;
    }
    current = updated;
  }
  const token = await createToken(current.roomName, userId, req.dbUser!.nickname);
  res.json({ call: serializeCall(current), token, url: LIVEKIT_URL });
});

export default router;
