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
  blockedUsersTable,
} from "@workspace/db";
import type { Call } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { sendCallPush, incomingCallData } from "../lib/push";
import { logger } from "../lib/logger";
import { publishRealtimeEvent } from "../lib/realtime";
import { allocateRoomMessageSeq, setMemberReadSeq } from "../lib/readReceipts";
import { callDurationSec, isTerminalCallStatus } from "../lib/callLifecycle";

const router: IRouter = Router();

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const RING_TIMEOUT_MS = 45_000;
type CallMedia = "audio" | "video";

function livekitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

function normalizeCallMedia(value: unknown): CallMedia {
  return value === "video" ? "video" : "audio";
}

function mediaFromCall(call: Pick<Call, "media">): CallMedia {
  return normalizeCallMedia(call.media);
}

// Opportunistically transition a long-unanswered ringing call to "missed".
async function maybeExpire(call: Call): Promise<Call> {
  if (call.status === "ringing" && Date.now() - call.createdAt.getTime() > RING_TIMEOUT_MS) {
    const now = new Date();
    const [updated] = await db
      .update(callsTable)
      .set({ status: "missed", missedAt: now, endedAt: now })
      .where(and(eq(callsTable.id, call.id), eq(callsTable.status, "ringing")))
      .returning();
    if (updated) {
      const media = mediaFromCall(updated);
      await endCallMessage(call.id, "missed", undefined, media);
      publishCallRealtimeEvent(updated, "call.updated", undefined, media);
    }
    return updated ?? call;
  }
  return call;
}

/** Whether either user has blocked the other (calls are mutually disallowed). */
async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ id: blockedUsersTable.blockerUserId })
    .from(blockedUsersTable)
    .where(
      or(
        and(
          eq(blockedUsersTable.blockerUserId, a),
          eq(blockedUsersTable.blockedUserId, b),
        ),
        and(
          eq(blockedUsersTable.blockerUserId, b),
          eq(blockedUsersTable.blockedUserId, a),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
async function postCallMessage(
  roomId: string,
  callerId: string,
  callId: string,
  media: CallMedia,
): Promise<void> {
  const content = JSON.stringify({ callId, status: "ringing", media });
  await db.transaction(async (tx) => {
    const roomSeq = await allocateRoomMessageSeq(tx, roomId);
    const [message] = await tx
      .insert(messagesTable)
      .values({ roomId, senderId: callerId, type: "call", content, roomSeq })
      .returning();
    await tx
      .update(chatRoomsTable)
      .set({ lastMessage: media === "video" ? "📹 영상통화" : "📞 보이스톡", lastMessageAt: new Date() })
      .where(eq(chatRoomsTable.id, roomId));
    // A new call resurfaces the room for anyone who previously hid (left) it.
    await tx
      .update(chatRoomMembersTable)
      .set({ hiddenAt: null })
      .where(eq(chatRoomMembersTable.roomId, roomId));
    // The caller has implicitly read their own call card so it never counts as
    // unread for them.
    await setMemberReadSeq(tx, roomId, callerId, { id: message.id, roomSeq });
  });
}

// Flips the in-chat call card to its FINAL state so the "통화 참여" button
// disappears and the card can render a distinct result (ended / missed /
// declined / cancelled / failed) with an optional duration. The card is located by its
// callId substring in the JSON content (avoids a migration).
async function endCallMessage(
  callId: string,
  status: "ended" | "missed" | "declined" | "cancelled" | "failed",
  durationSec?: number | null,
  media?: CallMedia,
): Promise<void> {
  const payload: { callId: string; status: string; media: CallMedia; durationSec?: number } = {
    callId,
    status,
    media: media ?? "audio",
  };
  if (typeof durationSec === "number") payload.durationSec = durationSec;
  await db
    .update(messagesTable)
    .set({ content: JSON.stringify(payload) })
    .where(
      and(eq(messagesTable.type, "call"), like(messagesTable.content, `%"callId":"${callId}"%`)),
    );
}

function serializeCall(c: Call, media: CallMedia = "audio") {
  return {
    id: c.id,
    roomName: c.roomName,
    callerId: c.callerId,
    calleeId: c.calleeId,
    chatRoomId: c.chatRoomId ?? null,
    media,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    acceptedAt: c.acceptedAt?.toISOString() ?? null,
    declinedAt: c.declinedAt?.toISOString() ?? null,
    missedAt: c.missedAt?.toISOString() ?? null,
    cancelledAt: c.cancelledAt?.toISOString() ?? null,
    endedAt: c.endedAt?.toISOString() ?? null,
    durationSec: callDurationSec(c.acceptedAt, c.endedAt),
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

async function serializeCallWithMedia(c: Call) {
  return serializeCall(c, mediaFromCall(c));
}

function publishCallRealtimeEvent(
  call: Call,
  type: "call.created" | "call.updated",
  actorUserId?: string | null,
  media: CallMedia = "audio",
): void {
  void publishRealtimeEvent({
    type,
    callId: call.id,
    roomId: call.chatRoomId ?? null,
    actorUserId: actorUserId ?? null,
    userIds: [call.callerId, call.calleeId],
    data: { call: serializeCall(call, media) },
  }).catch((err) => logger.error({ err, callId: call.id, type }, "Failed to publish call realtime event"));
}

router.post("/calls", requireAuth, async (req, res): Promise<void> => {
  if (!livekitConfigured()) {
    res.status(503).json({ error: "음성 통화 서버가 설정되지 않았습니다" });
    return;
  }
  const userId = req.dbUser!.id;
  const { calleeId, roomId, media: rawMedia } = req.body as {
    calleeId?: string;
    roomId?: string;
    media?: unknown;
  };
  const media = normalizeCallMedia(rawMedia);
  if (!calleeId || calleeId === userId) {
    res.status(400).json({ error: "calleeId is required" });
    return;
  }

  const [callee] = await db.select().from(usersTable).where(eq(usersTable.id, calleeId));
  if (!callee) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Block list is mutual for calls: if either side blocked the other, the call
  // is refused. 403 (not 404) so the caller gets a clear, honest failure.
  if (await isBlockedBetween(userId, calleeId)) {
    res.status(403).json({ error: "차단된 상대에게는 전화를 걸 수 없습니다" });
    return;
  }

  // Validate the originating 1:1 room up front (used both to store chatRoomId on
  // the call row and to post the in-chat card). Only a "direct" room where BOTH
  // parties are members is trusted — otherwise an authenticated user could inject
  // a call card / mutate room metadata (lastMessage/hiddenAt) in arbitrary rooms.
  let validRoomId: string | null = null;
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
      if (room?.type === "direct" && memberIds.has(userId) && memberIds.has(calleeId)) {
        validRoomId = roomId;
      } else {
        req.log.warn({ roomId, userId, calleeId }, "Skipped call card for invalid room");
      }
    } catch (err) {
      req.log.error({ err, roomId }, "Failed to validate call room");
    }
  }

  const roomName = `call_${crypto.randomUUID()}`;
  const [call] = await db
    .insert(callsTable)
    .values({
      roomName,
      callerId: userId,
      calleeId,
      chatRoomId: validRoomId,
      media,
      status: "ringing",
    })
    .returning();

  // Post the in-chat call card so both parties can join from the conversation.
  if (validRoomId) {
    try {
      await postCallMessage(validRoomId, userId, call.id, media);
    } catch (err) {
      req.log.error({ err, roomId: validRoomId, callId: call.id }, "Failed to post call message");
    }
  }

  // Always-on voice-call push: ignores focus/away gating AND the user's
  // notification toggle so an incoming call is never silently missed. The data
  // payload lets the service worker route a tap straight to the incoming screen.
  void sendCallPush(calleeId, {
    title: media === "video" ? "영상통화" : "보이스톡",
    body:
      media === "video"
        ? `${req.dbUser!.nickname}님이 영상 통화를 걸었습니다`
        : `${req.dbUser!.nickname}님이 음성 통화를 걸었습니다`,
    url: validRoomId ? `/chat/${validRoomId}` : "/",
    tag: `call-${call.id}`,
    data: incomingCallData({
      callId: call.id,
      chatRoomId: validRoomId,
      callerUserId: userId,
      callerName: req.dbUser!.nickname,
      media,
    }),
  });

  const token = await createToken(roomName, userId, req.dbUser!.nickname);
  publishCallRealtimeEvent(call, "call.created", userId, media);
  res.status(201).json({ call: serializeCall(call, media), token, url: LIVEKIT_URL });
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
      // Authoritatively expire a >45s ringing call so it never surfaces as a
      // fresh incoming ring (the 60s query window is wider than the timeout).
      const fresh = await maybeExpire(c);
      if (fresh.status !== "ringing") return null;
      const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, fresh.callerId));
      return caller ? { ...(await serializeCallWithMedia(fresh)), caller: toPublicUser(caller) } : null;
    }),
  );
  res.json(result.filter((r) => r !== null));
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
  res.json(await serializeCallWithMedia(fresh));
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
  // Enforce the server-authoritative ring timeout here too: a >45s ringing call
  // must flip to "missed" and become unacceptable even if no prior GET/join
  // touched it. The status-guarded UPDATE below then fails to find a "ringing"
  // row and we fall through to the dead-call 409.
  const fresh = await maybeExpire(call);
  // Stamp acceptedAt only on the ringing→active transition (so a repeat accept
  // on an already-active call doesn't reset the connect time used for duration).
  const now = new Date();
  const [updated] = await db
    .update(callsTable)
    .set({ status: "active", acceptedAt: now })
    .where(and(eq(callsTable.id, raw), eq(callsTable.status, "ringing")))
    .returning();
  if (!updated) {
    // Already active (re-accept) is fine — return current token. Anything else
    // (ended/declined/missed/etc.) is a dead call.
    if (fresh.status === "active") {
      const token = await createToken(fresh.roomName, userId, req.dbUser!.nickname);
      res.json({ call: await serializeCallWithMedia(fresh), token, url: LIVEKIT_URL });
      return;
    }
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  const token = await createToken(updated.roomName, userId, req.dbUser!.nickname);
  const media = mediaFromCall(updated);
  publishCallRealtimeEvent(updated, "call.updated", userId, media);
  res.json({ call: serializeCall(updated, media), token, url: LIVEKIT_URL });
});

router.post("/calls/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || call.calleeId !== userId) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const now = new Date();
  const [updated] = await db
    .update(callsTable)
    .set({ status: "declined", declinedAt: now, endedAt: now })
    .where(and(eq(callsTable.id, raw), eq(callsTable.status, "ringing")))
    .returning();
  if (updated) {
    const media = mediaFromCall(updated);
    await endCallMessage(raw, "declined", undefined, media);
    publishCallRealtimeEvent(updated, "call.updated", userId, media);
  }
  // If it was already accepted/ended, leave it as-is and return current state.
  res.json(await serializeCallWithMedia(updated ?? call));
});

// Cancel an outgoing call before it is answered. Caller-only; only a still-
// ringing call can be cancelled (once accepted, use /end instead).
router.post("/calls/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || call.callerId !== userId) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const now = new Date();
  const [updated] = await db
    .update(callsTable)
    .set({ status: "cancelled", cancelledAt: now, endedAt: now })
    .where(and(eq(callsTable.id, raw), eq(callsTable.status, "ringing")))
    .returning();
  if (updated) {
    const media = mediaFromCall(updated);
    await endCallMessage(raw, "cancelled", undefined, media);
    publishCallRealtimeEvent(updated, "call.updated", userId, media);
  }
  // If the callee answered/declined in the race, return the current state so the
  // caller's UI converges instead of forcing a cancelled card over a live call.
  res.json(await serializeCallWithMedia(updated ?? call));
});

router.post("/calls/:id/end", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  // Terminal states are immutable.
  if (isTerminalCallStatus(call.status)) {
    res.json(await serializeCallWithMedia(call));
    return;
  }
  // A caller hanging up a still-ringing call (callee never answered) is a cancel,
  // not an "ended" call — render it as cancelled so it isn't mistaken for a real
  // (0s) conversation.
  if (call.status === "ringing" && call.callerId === userId) {
    const now = new Date();
    const [cancelled] = await db
      .update(callsTable)
      .set({ status: "cancelled", cancelledAt: now, endedAt: now })
      .where(and(eq(callsTable.id, raw), eq(callsTable.status, "ringing")))
      .returning();
    if (cancelled) {
      const media = mediaFromCall(cancelled);
      await endCallMessage(raw, "cancelled", undefined, media);
      publishCallRealtimeEvent(cancelled, "call.updated", userId, media);
      res.json(serializeCall(cancelled, media));
      return;
    }
  }
  // Compare-and-set on the status we read so a concurrent decline/cancel/expire
  // that terminalized the row between our read and this write is NOT clobbered
  // back to "ended" (which would also flip the chat card to the wrong result).
  const now = new Date();
  const [updated] = await db
    .update(callsTable)
    .set({ status: "ended", endedAt: now })
    .where(and(eq(callsTable.id, raw), eq(callsTable.status, call.status)))
    .returning();
  if (!updated) {
    // Someone else won the race and set a terminal state; converge to it without
    // touching the card (the winning handler already wrote the correct card).
    const [latest] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
    res.json(await serializeCallWithMedia(latest ?? call));
    return;
  }
  const media = mediaFromCall(updated);
  await endCallMessage(raw, "ended", callDurationSec(updated.acceptedAt, updated.endedAt), media);
  publishCallRealtimeEvent(updated, "call.updated", userId, media);
  res.json(serializeCall(updated, media));
});

router.post("/calls/:id/failed", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  if (isTerminalCallStatus(call.status)) {
    res.json(await serializeCallWithMedia(call));
    return;
  }
  const now = new Date();
  const [updated] = await db
    .update(callsTable)
    .set({ status: "failed", endedAt: now })
    .where(and(eq(callsTable.id, raw), eq(callsTable.status, call.status)))
    .returning();
  const current = updated ?? call;
  if (updated) {
    const media = mediaFromCall(updated);
    await endCallMessage(raw, "failed", undefined, media);
    publishCallRealtimeEvent(updated, "call.updated", userId, media);
  }
  res.json(await serializeCallWithMedia(current));
});

router.post("/calls/:id/diagnostics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const body = req.body as Record<string, unknown> | null;
  req.log.info(
    {
      callId: raw,
      userId,
      media: mediaFromCall(call),
      callStatus: call.status,
      phase: typeof body?.phase === "string" ? body.phase : "unknown",
      platform: typeof body?.platform === "string" ? body.platform : undefined,
      role: typeof body?.role === "string" ? body.role : undefined,
      details: body?.details && typeof body.details === "object" ? body.details : undefined,
    },
    "Call diagnostic",
  );
  res.status(204).end();
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
  if (isTerminalCallStatus(call.status)) {
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
      .set({ status: "active", acceptedAt: new Date() })
      .where(and(eq(callsTable.id, raw), eq(callsTable.status, "ringing")))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "이미 종료된 통화입니다" });
      return;
    }
    current = updated;
    publishCallRealtimeEvent(updated, "call.updated", userId, mediaFromCall(updated));
  }
  const token = await createToken(current.roomName, userId, req.dbUser!.nickname);
  res.json({ call: await serializeCallWithMedia(current), token, url: LIVEKIT_URL });
});

export default router;
