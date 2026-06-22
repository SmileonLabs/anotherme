import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { chatRoomMembersTable, chatRoomsTable, messagesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { sendPushToUsers } from "../lib/push";
import { getTypingUserIds, markTyping } from "../lib/typing";
import { runDungeonTurn } from "../lib/dungeon";
import { recordActivity } from "../lib/growth";

const router: IRouter = Router();

// Sticker content is a Noto codepoint: lowercase hex groups joined by "_"
// (e.g. "1f600", "2764_fe0f"). Anything else is rejected.
const STICKER_CODE_PATTERN = /^[0-9a-f]+(_[0-9a-f]+)*$/;

// Monotonically advance a member's read pointer toward `target`, NEVER moving it
// backward. Row-locks the member (FOR UPDATE) so the three writers — sending a
// message, PATCH /read, and the typing heartbeat — serialize instead of
// clobbering each other with stale snapshots. A backward write would regress the
// pointer and desync unreadCount / message readCount (both keyed off its
// timestamp). No-op when there's nothing newer to advance to.
async function advanceReadPointer(
  roomId: string,
  userId: string,
  target: { id: string; createdAt: Date },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [m] = await tx
      .select({ lastReadMessageId: chatRoomMembersTable.lastReadMessageId })
      .from(chatRoomMembersTable)
      .where(and(eq(chatRoomMembersTable.roomId, roomId), eq(chatRoomMembersTable.userId, userId)))
      .for("update");
    if (!m) return;
    if (m.lastReadMessageId === target.id) return;
    let currentReadAt = 0;
    if (m.lastReadMessageId) {
      const [cur] = await tx
        .select({ createdAt: messagesTable.createdAt })
        .from(messagesTable)
        .where(eq(messagesTable.id, m.lastReadMessageId));
      currentReadAt = cur ? cur.createdAt.getTime() : 0;
    }
    if (target.createdAt.getTime() <= currentReadAt) return;
    await tx
      .update(chatRoomMembersTable)
      .set({ lastReadMessageId: target.id })
      .where(and(eq(chatRoomMembersTable.roomId, roomId), eq(chatRoomMembersTable.userId, userId)));
  });
}

router.get("/rooms/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

  if (!member) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.roomId, raw))
    .orderBy(desc(messagesTable.createdAt))
    .limit(50);

  // Resolve each member's read position (the createdAt of their lastReadMessageId)
  // so we can compute, per message, how many *other* members have read it.
  const members = await db
    .select({ userId: chatRoomMembersTable.userId, lastReadMessageId: chatRoomMembersTable.lastReadMessageId })
    .from(chatRoomMembersTable)
    .where(eq(chatRoomMembersTable.roomId, raw));

  const readIds = members.map((m) => m.lastReadMessageId).filter((x): x is string => !!x);
  const readAtById = new Map<string, number>();
  if (readIds.length > 0) {
    const readMsgs = await db
      .select({ id: messagesTable.id, createdAt: messagesTable.createdAt })
      .from(messagesTable)
      .where(and(eq(messagesTable.roomId, raw), inArray(messagesTable.id, readIds)));
    for (const rm of readMsgs) readAtById.set(rm.id, rm.createdAt.getTime());
  }
  const memberReadAt = members.map((m) => ({
    userId: m.userId,
    readAt: m.lastReadMessageId ? (readAtById.get(m.lastReadMessageId) ?? 0) : 0,
  }));

  const result = await Promise.all(
    messages.map(async (m) => {
      const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, m.senderId));
      const createdMs = m.createdAt.getTime();
      const readCount = memberReadAt.filter(
        (mr) => mr.userId !== m.senderId && mr.readAt >= createdMs,
      ).length;
      return {
        id: m.id,
        roomId: m.roomId,
        senderId: m.senderId,
        type: m.type,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        readCount,
        sender: sender
          ? { id: sender.id, email: sender.email, nickname: sender.nickname, profileImageUrl: sender.profileImageUrl ?? null, statusMessage: sender.statusMessage ?? null }
          : null,
      };
    }),
  );

  res.json(result.reverse());
});

router.post("/rooms/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

  if (!member) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  const { content, type = "text" } = req.body;
  if (!content) {
    res.status(400).json({ error: "content required" });
    return;
  }

  // Image messages store an internal object path as content. Reject anything
  // else (e.g. arbitrary external URLs) so clients can't be tricked into
  // auto-loading attacker-controlled resources.
  if (type === "image" && !content.startsWith("/objects/")) {
    res.status(400).json({ error: "invalid image path" });
    return;
  }

  // Sticker messages store a Noto codepoint (e.g. "1f600" / "2764_fe0f") as
  // content. Constrain it to a strict codepoint shape so it can only ever
  // resolve to the public Noto CDN, never an arbitrary URL.
  if (type === "sticker" && !STICKER_CODE_PATTERN.test(content)) {
    res.status(400).json({ error: "invalid sticker" });
    return;
  }

  // File messages store JSON metadata ({ path, name, size, mime }) as content.
  // The path must point at an internal object so clients can't be tricked into
  // loading attacker-controlled resources.
  if (type === "file") {
    let ok = false;
    try {
      const meta = JSON.parse(content) as Record<string, unknown>;
      ok =
        typeof meta?.path === "string" &&
        meta.path.startsWith("/objects/") &&
        typeof meta?.name === "string";
    } catch {
      ok = false;
    }
    if (!ok) {
      res.status(400).json({ error: "invalid file" });
      return;
    }
  }

  // For non-text messages the content holds an opaque value (image object path,
  // sticker code, or file metadata), so room previews and push notifications
  // use a label.
  const preview =
    type === "image"
      ? "사진"
      : type === "sticker"
        ? "스티커"
        : type === "file"
          ? "파일"
          : content;

  const [message] = await db
    .insert(messagesTable)
    .values({ roomId: raw, senderId: userId, content, type })
    .returning();

  await db
    .update(chatRoomsTable)
    .set({ lastMessage: preview, lastMessageAt: new Date() })
    .where(eq(chatRoomsTable.id, raw));

  // A new message resurfaces the room for anyone who previously hid (left) it.
  await db
    .update(chatRoomMembersTable)
    .set({ hiddenAt: null })
    .where(eq(chatRoomMembersTable.roomId, raw));

  // The sender has implicitly read their own message — advance their read marker
  // so it never counts as unread (prevents self-notifications across devices).
  await advanceReadPointer(raw, userId, { id: message.id, createdAt: message.createdAt });

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [room] = await db
    .select({ type: chatRoomsTable.type })
    .from(chatRoomsTable)
    .where(eq(chatRoomsTable.id, raw));

  res.status(201).json({
    id: message.id,
    roomId: message.roomId,
    senderId: message.senderId,
    type: message.type,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    readCount: 0,
    sender: sender
      ? { id: sender.id, email: sender.email, nickname: sender.nickname, profileImageUrl: sender.profileImageUrl ?? null, statusMessage: sender.statusMessage ?? null }
      : null,
  });

  // Grow the sender's Another Me persona from this chat activity. Fire-and-forget
  // and self-isolated: growth tracking must never affect message delivery.
  void recordActivity({
    userId,
    kind: "chat_message",
    sourceId: message.id,
    sourceKey: `chat:${message.id}:${userId}`,
    log: req.log,
  });

  // In a dungeon room, a player's text message is an in-game action: let the
  // AI Dungeon Master respond (fire-and-forget, serialized per room).
  if (room?.type === "dungeon" && type === "text") {
    void runDungeonTurn(
      raw,
      { userId, name: sender?.nickname ?? "모험가", text: content },
      req.log,
    ).catch((err) => req.log.error({ err, roomId: raw }, "Dungeon turn failed"));
  }

  // Fire-and-forget push notification to other room members
  void (async () => {
    try {
      const members = await db
        .select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, raw));
      const recipients = members.map((m) => m.userId).filter((id) => id !== userId);
      if (recipients.length === 0) return;
      await sendPushToUsers(recipients, {
        title: sender?.nickname ?? "새 메시지",
        body: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview,
        url: `/chat/${raw}`,
        tag: `room-${raw}`,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to dispatch message push");
    }
  })();
});

router.patch("/rooms/:id/read", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { messageId } = req.body;
  if (!messageId) {
    res.status(400).json({ error: "messageId required" });
    return;
  }

  // The read marker must point at a message that actually belongs to this room,
  // otherwise a cross-room id would corrupt readCount computation elsewhere.
  const [msg] = await db
    .select({ id: messagesTable.id, createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(and(eq(messagesTable.id, messageId), eq(messagesTable.roomId, raw)));
  if (!msg) {
    res.status(400).json({ error: "messageId not in room" });
    return;
  }

  // Monotonic advance only — a stale poll cycle must never regress the pointer.
  await advanceReadPointer(raw, userId, msg);
  res.sendStatus(204);
});

router.post("/rooms/:id/typing", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

  if (!member) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  markTyping(raw, userId);

  // Typing means the user is actively present in the room, so treat everything
  // as read. Without this, "입력 중" could coexist with an "안읽음" receipt on the
  // other side (the typer is clearly in the room yet hadn't marked read). Advance
  // (monotonically) to the latest message; the helper no-ops if already current.
  const [latest] = await db
    .select({ id: messagesTable.id, createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(eq(messagesTable.roomId, raw))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);
  if (latest) await advanceReadPointer(raw, userId, latest);
  res.sendStatus(204);
});

router.get("/rooms/:id/typing", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

  if (!member) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  const ids = getTypingUserIds(raw, userId);
  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const users = await db.select().from(usersTable).where(inArray(usersTable.id, ids));
  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      profileImageUrl: u.profileImageUrl ?? null,
      statusMessage: u.statusMessage ?? null,
    })),
  );
});

export default router;
