import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import {
  db,
  callsTable,
  callUserLocksTable,
  usersTable,
  messagesTable,
  chatRoomsTable,
  chatRoomMembersTable,
  blockedUsersTable,
} from "@workspace/db";
import type { Call } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { sendCallPush, sendCallTerminalPush, incomingCallData } from "../lib/push";
import { logger } from "../lib/logger";
import { publishRealtimeEvent } from "../lib/realtime";
import { allocateRoomMessageSeq, setMemberReadSeq } from "../lib/readReceipts";
import {
  CALL_TOKEN_TTL_SECONDS,
  callTokenGrant,
  callDurationSec,
  isLiveCallStatus,
  isTerminalCallStatus,
  terminalCallStatuses,
  type CallMedia,
  type TerminalCallStatus,
} from "../lib/callLifecycle";

const router: IRouter = Router();

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

const RING_TIMEOUT_MS = 45_000;
const ROOM_TERMINATION_RETRY_MS = 30_000;
const DEFAULT_CALL_WORKER_BATCH_SIZE = 25;

function livekitConfigured(): boolean {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return false;
  try {
    new URL(LIVEKIT_URL);
    return true;
  } catch {
    return false;
  }
}

function normalizeCallMedia(value: unknown): CallMedia {
  return value === "video" ? "video" : "audio";
}

function mediaFromCall(call: Pick<Call, "media">): CallMedia {
  return normalizeCallMedia(call.media);
}

function livekitServiceUrl(): string {
  const url = new URL(LIVEKIT_URL!);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  return url.toString().replace(/\/$/, "");
}

function livekitRoomService(): RoomServiceClient {
  return new RoomServiceClient(livekitServiceUrl(), LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!);
}

function isNotFoundError(err: unknown): boolean {
  const value = err as { code?: unknown; status?: unknown; message?: unknown } | null;
  return (
    value?.code === 5 ||
    value?.status === 404 ||
    (typeof value?.message === "string" && /not found/i.test(value.message))
  );
}

function envPositiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function terminalUpdate(status: TerminalCallStatus, now: Date) {
  if (status === "declined") return { status, declinedAt: now, endedAt: now };
  if (status === "missed") return { status, missedAt: now, endedAt: now };
  if (status === "cancelled") return { status, cancelledAt: now, endedAt: now };
  return { status, endedAt: now };
}

async function findCall(id: string): Promise<Call | undefined> {
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, id));
  return call;
}

// This guarded update is the only path to a terminal state. Deleting both
// participant locks in the same transaction makes the user immediately eligible
// for another call without allowing concurrent ringing calls.
async function transitionToTerminal(
  callId: string,
  fromStatuses: readonly ("ringing" | "active")[],
  status: TerminalCallStatus,
): Promise<Call | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(callsTable)
      .set(terminalUpdate(status, now))
      .where(and(eq(callsTable.id, callId), inArray(callsTable.status, [...fromStatuses])))
      .returning();
    if (updated) {
      await tx.delete(callUserLocksTable).where(eq(callUserLocksTable.callId, callId));
    }
    return updated;
  });
}

async function activateCall(callId: string): Promise<Call | undefined> {
  const [updated] = await db
    .update(callsTable)
    .set({ status: "active", acceptedAt: new Date() })
    .where(and(eq(callsTable.id, callId), eq(callsTable.status, "ringing")))
    .returning();
  return updated;
}

async function createToken(
  roomName: string,
  identity: string,
  name: string,
  media: CallMedia,
  canPublish: boolean,
): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY!, LIVEKIT_API_SECRET!, {
    identity,
    name,
    ttl: CALL_TOKEN_TTL_SECONDS,
  });
  at.addGrant(callTokenGrant(roomName, media, canPublish));
  return at.toJwt();
}

async function activeCallSession(callId: string, userId: string, name: string): Promise<{
  call: Call;
  token: string;
} | null> {
  return db.transaction(async (tx) => {
    // Serialize token issuance with terminal updates. A transition cannot delete
    // the participant lock until this active-state check and signature complete.
    const [row] = await tx
      .select({ call: callsTable })
      .from(callsTable)
      .innerJoin(
        callUserLocksTable,
        and(eq(callUserLocksTable.callId, callsTable.id), eq(callUserLocksTable.userId, userId)),
      )
      .where(and(eq(callsTable.id, callId), eq(callsTable.status, "active")))
      .for("update");
    if (!row) return null;
    return {
      call: row.call,
      token: await createToken(row.call.roomName, userId, name, mediaFromCall(row.call), true),
    };
  });
}

async function terminateLiveKitRoom(call: Call, log = logger, force = false): Promise<boolean> {
  const now = new Date();
  const retryCutoff = new Date(now.getTime() - ROOM_TERMINATION_RETRY_MS);
  const [claimed] = await db
    .update(callsTable)
    .set({ roomTerminationAttemptedAt: now })
    .where(
      and(
        eq(callsTable.id, call.id),
        isNull(callsTable.roomTerminatedAt),
        ...(force
          ? []
          : [
              or(
                isNull(callsTable.roomTerminationAttemptedAt),
                lt(callsTable.roomTerminationAttemptedAt, retryCutoff),
              ),
            ]),
      ),
    )
    .returning();
  if (!claimed) return true;

  if (!livekitConfigured()) {
    log.warn({ callId: call.id }, "LiveKit is unavailable; room termination will be retried");
    return false;
  }

  try {
    await livekitRoomService().deleteRoom(claimed.roomName);
  } catch (err) {
    if (!isNotFoundError(err)) {
      log.warn({ err, callId: call.id }, "Failed to terminate LiveKit call room");
      return false;
    }
  }

  await db
    .update(callsTable)
    .set({ roomTerminatedAt: new Date() })
    .where(and(eq(callsTable.id, call.id), isNull(callsTable.roomTerminatedAt)));
  return true;
}

async function settleTerminalCall(
  call: Call,
  actorUserId?: string | null,
  log = logger,
): Promise<void> {
  const media = mediaFromCall(call);
  const [messageResult, roomResult, pushResult] = await Promise.allSettled([
    endCallMessage(
      call.id,
      call.status as TerminalCallStatus,
      call.status === "ended" ? callDurationSec(call.acceptedAt, call.endedAt) : undefined,
      media,
    ),
    terminateLiveKitRoom(call, log, true),
    sendCallTerminalPush([call.callerId, call.calleeId], {
      callId: call.id,
      status: call.status as TerminalCallStatus,
      chatRoomId: call.chatRoomId ?? null,
      media,
    }),
  ]);
  if (messageResult.status === "rejected") {
    log.error({ err: messageResult.reason, callId: call.id }, "Failed to finalize call message");
  }
  if (roomResult.status === "rejected") {
    log.error({ err: roomResult.reason, callId: call.id }, "Failed to schedule LiveKit room termination");
  }
  if (pushResult.status === "rejected") {
    log.error({ err: pushResult.reason, callId: call.id }, "Failed to send terminal call push");
  }
  publishCallRealtimeEvent(call, "call.updated", actorUserId, media);
}

// Reads may still expire a call promptly, but the worker below performs this
// transition even when neither participant polls the API.
async function maybeExpire(call: Call): Promise<Call> {
  if (call.status !== "ringing" || Date.now() - call.createdAt.getTime() <= RING_TIMEOUT_MS) {
    return call;
  }
  const updated = await transitionToTerminal(call.id, ["ringing"], "missed");
  if (updated) {
    await settleTerminalCall(updated);
    return updated;
  }
  return (await findCall(call.id)) ?? call;
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

// Posts the in-chat "call" card (a messages row of type "call") so both parties
// can join the call straight from the conversation. The content carries the
// callId + status so the card can render a "통화 참여" button and later flip to
// "ended". Its foreign key binds the card to this exact call row.
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
      .values({ roomId, senderId: callerId, type: "call", content, callId, roomSeq })
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
// callId foreign key so only the matching server-created call card changes.
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
    .where(and(eq(messagesTable.type, "call"), eq(messagesTable.callId, callId)));
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
  let call: Call;
  try {
    call = await db.transaction(async (tx) => {
      const [created] = await tx
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
      const participantIds = [userId, calleeId].sort();
      await tx.insert(callUserLocksTable).values(
        participantIds.map((participantId) => ({ userId: participantId, callId: created.id })),
      );
      return created;
    });
  } catch (err) {
    const cause = err as { cause?: { constraint?: unknown; code?: unknown }; constraint?: unknown; code?: unknown };
    const constraint = cause.constraint ?? cause.cause?.constraint;
    const code = cause.code ?? cause.cause?.code;
    if (code === "23505" && typeof constraint === "string" && constraint.includes("call_user_locks")) {
      res.status(409).json({ error: "통화 중인 사용자가 있어 전화를 걸 수 없습니다" });
      return;
    }
    throw err;
  }

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

  // The initial session remains subscribe-only while ringing. The caller gets
  // media publish permission only through the active-only join endpoint.
  const token = await createToken(roomName, userId, req.dbUser!.nickname, media, false);
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
  const fresh = await maybeExpire(call);
  if (fresh.status === "active") {
    const session = await activeCallSession(raw, userId, req.dbUser!.nickname);
    if (session) {
      res.json({ call: await serializeCallWithMedia(session.call), token: session.token, url: LIVEKIT_URL });
      return;
    }
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  if (fresh.status !== "ringing") {
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  const updated = await activateCall(raw);
  if (!updated) {
    const latest = await findCall(raw);
    if (latest?.status === "active") {
      const session = await activeCallSession(raw, userId, req.dbUser!.nickname);
      if (session) {
        res.json({ call: await serializeCallWithMedia(session.call), token: session.token, url: LIVEKIT_URL });
        return;
      }
    }
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  const session = await activeCallSession(raw, userId, req.dbUser!.nickname);
  if (!session) {
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  const media = mediaFromCall(updated);
  publishCallRealtimeEvent(updated, "call.updated", userId, media);
  res.json({ call: serializeCall(updated, media), token: session.token, url: LIVEKIT_URL });
});

router.post("/calls/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, raw));
  if (!call || call.calleeId !== userId) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const updated = await transitionToTerminal(raw, ["ringing"], "declined");
  if (updated) {
    await settleTerminalCall(updated, userId, req.log);
  }
  // If another transition won the race, return its current state rather than
  // overwriting it or returning the stale pre-transition read.
  res.json(await serializeCallWithMedia(updated ?? (await findCall(raw)) ?? call));
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
  const updated = await transitionToTerminal(raw, ["ringing"], "cancelled");
  if (updated) {
    await settleTerminalCall(updated, userId, req.log);
  }
  // If the callee answered/declined in the race, return the current state so the
  // caller's UI converges instead of forcing a cancelled card over a live call.
  res.json(await serializeCallWithMedia(updated ?? (await findCall(raw)) ?? call));
});

router.post("/calls/:id/end", requireAuth, async (req, res): Promise<void> => {
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
  // A caller hanging up a still-ringing call (callee never answered) is a cancel,
  // not an "ended" call — render it as cancelled so it isn't mistaken for a real
  // (0s) conversation.
  const terminalStatus: TerminalCallStatus =
    call.status === "ringing" && call.callerId === userId ? "cancelled" : "ended";
  const updated = isLiveCallStatus(call.status)
    ? await transitionToTerminal(raw, [call.status], terminalStatus)
    : undefined;
  if (!updated) {
    res.json(await serializeCallWithMedia((await findCall(raw)) ?? call));
    return;
  }
  const media = mediaFromCall(updated);
  await settleTerminalCall(updated, userId, req.log);
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
  const updated = isLiveCallStatus(call.status)
    ? await transitionToTerminal(raw, [call.status], "failed")
    : undefined;
  const current = updated ?? (await findCall(raw)) ?? call;
  if (updated) {
    await settleTerminalCall(updated, userId, req.log);
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

// Join an active call from its in-chat card. A callee can accept by joining a
// ringing call; callers cannot obtain a media token until that transition wins.
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
  let current = call;
  if (call.status === "ringing") {
    if (call.callerId === userId) {
      res.status(409).json({ error: "상대방의 수락을 기다리는 중입니다" });
      return;
    }
    const updated = await activateCall(raw);
    if (!updated) {
      const latest = await findCall(raw);
      if (latest?.status !== "active") {
        res.status(409).json({ error: "이미 종료된 통화입니다" });
        return;
      }
      current = latest;
    } else {
      current = updated;
      publishCallRealtimeEvent(updated, "call.updated", userId, mediaFromCall(updated));
    }
  }
  if (current.status !== "active") {
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  const session = await activeCallSession(raw, userId, req.dbUser!.nickname);
  if (!session) {
    // A terminal transition that won after the local read removes the lock, so
    // this guard prevents issuing a token for that now-invalid call.
    res.status(409).json({ error: "이미 종료된 통화입니다" });
    return;
  }
  res.json({ call: await serializeCallWithMedia(session.call), token: session.token, url: LIVEKIT_URL });
});

export async function processCallLifecycleBatch(log = logger): Promise<number> {
  const batchSize = envPositiveNumber("CALL_LIFECYCLE_WORKER_BATCH_SIZE", DEFAULT_CALL_WORKER_BATCH_SIZE);
  const expiryCutoff = new Date(Date.now() - RING_TIMEOUT_MS);
  const expired = await db
    .select()
    .from(callsTable)
    .where(and(eq(callsTable.status, "ringing"), lt(callsTable.createdAt, expiryCutoff)))
    .orderBy(callsTable.createdAt)
    .limit(batchSize);

  let processed = 0;
  for (const call of expired) {
    const updated = await transitionToTerminal(call.id, ["ringing"], "missed");
    if (!updated) continue;
    processed += 1;
    await settleTerminalCall(updated, undefined, log);
  }

  const retryCutoff = new Date(Date.now() - ROOM_TERMINATION_RETRY_MS);
  const pendingTermination = await db
    .select()
    .from(callsTable)
    .where(
      and(
        inArray(callsTable.status, terminalCallStatuses),
        isNull(callsTable.roomTerminatedAt),
        or(
          isNull(callsTable.roomTerminationAttemptedAt),
          lt(callsTable.roomTerminationAttemptedAt, retryCutoff),
        ),
      ),
    )
    .orderBy(callsTable.endedAt)
    .limit(batchSize);
  for (const call of pendingTermination) {
    if (await terminateLiveKitRoom(call, log)) processed += 1;
  }
  return processed;
}

let callLifecycleWorkerStarted = false;
let callLifecycleWorkerRunning = false;

export function startCallLifecycleWorker(log = logger): void {
  if (callLifecycleWorkerStarted || process.env.CALL_LIFECYCLE_WORKER_ENABLED === "false") return;
  callLifecycleWorkerStarted = true;
  const intervalMs = envPositiveNumber("CALL_LIFECYCLE_WORKER_INTERVAL_MS", 5_000);
  const tick = () => {
    if (callLifecycleWorkerRunning) return;
    callLifecycleWorkerRunning = true;
    void processCallLifecycleBatch(log)
      .catch((err) => log.warn({ err }, "Call lifecycle worker tick failed"))
      .finally(() => {
        callLifecycleWorkerRunning = false;
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
}

export default router;
