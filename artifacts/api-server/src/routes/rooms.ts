import { Router, type IRouter } from "express";
import { and, asc, count, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { chatRoomsTable, chatRoomMembersTable, messagesTable, usersTable, friendshipsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

export async function roomWithMeta(roomId: string, userId: string) {
  const room = (await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)))[0];
  if (!room) return null;

  const memberRows = await db
    .select()
    .from(chatRoomMembersTable)
    .where(eq(chatRoomMembersTable.roomId, roomId));

  const myMember = memberRows.find((m) => m.userId === userId);
  // Batch-load every member's user record in ONE query instead of N per-member
  // round-trips (this runs for every room on each 3s /rooms poll).
  const memberUserIds = memberRows.map((m) => m.userId);
  const userRows = memberUserIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, memberUserIds))
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const members = memberRows
    .map((m) => userById.get(m.userId))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      profileImageUrl: u.profileImageUrl ?? null,
      statusMessage: u.statusMessage ?? null,
    }));

  let unreadCount = 0;
  let firstUnreadMessageId: string | null = null;
  if (myMember) {
    // Resolve the read marker's timestamp in one tiny query rather than loading
    // every message in the room just to find it. Messages the user sent are
    // always "read" — never count them, otherwise your own latest message can
    // surface as an unread "1" in the room list.
    let readAt: Date | null = null;
    if (myMember.lastReadMessageId) {
      // Scope to THIS room (matches the original in-room resolution): a stale or
      // cross-room read marker must resolve to "no read" (readAt null), never to
      // some other room's timestamp — which would under-count unread.
      const [readMsg] = await db
        .select({ createdAt: messagesTable.createdAt })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.id, myMember.lastReadMessageId),
            eq(messagesTable.roomId, roomId),
          ),
        );
      readAt = readMsg?.createdAt ?? null;
    }

    const unreadWhere = and(
      eq(messagesTable.roomId, roomId),
      ne(messagesTable.senderId, userId),
      ...(readAt ? [gt(messagesTable.createdAt, readAt)] : []),
    );

    // COUNT in SQL — no full-message materialization.
    const [{ value: unread }] = await db
      .select({ value: count() })
      .from(messagesTable)
      .where(unreadWhere);
    unreadCount = unread;

    if (unreadCount > 0) {
      // The exact id the client anchors the "새 메시지" divider on — the oldest
      // unread, fetched with a single ordered LIMIT 1.
      const [first] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(unreadWhere)
        .orderBy(asc(messagesTable.createdAt))
        .limit(1);
      firstUnreadMessageId = first?.id ?? null;
    }
  }

  return {
    id: room.id,
    type: room.type,
    name: room.name ?? null,
    ownerId: room.ownerId ?? null,
    lastMessage: room.lastMessage ?? null,
    lastMessageAt: room.lastMessageAt?.toISOString() ?? null,
    unreadCount,
    firstUnreadMessageId,
    muted: myMember?.muted ?? false,
    createdAt: room.createdAt.toISOString(),
    members: members.filter(Boolean),
  };
}

router.get("/rooms", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const memberRows = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.userId, userId), isNull(chatRoomMembersTable.hiddenAt)));

  const rooms = await Promise.all(memberRows.map((m) => roomWithMeta(m.roomId, userId)));
  const validRooms = rooms.filter(Boolean);
  validRooms.sort((a, b) => {
    const aTime = a?.lastMessageAt ?? a?.createdAt ?? "";
    const bTime = b?.lastMessageAt ?? b?.createdAt ?? "";
    return bTime.localeCompare(aTime);
  });
  res.json(validRooms);
});

router.post("/rooms", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const { type, name, memberIds } = req.body as { type: string; name?: string; memberIds: string[] };

  if (!type || !Array.isArray(memberIds)) {
    res.status(400).json({ error: "type and memberIds are required" });
    return;
  }

  const allMemberIds = Array.from(new Set([userId, ...memberIds]));

  // Helper: find an existing direct room shared by exactly the given two users.
  const findDirectRoom = async (
    tx: Pick<typeof db, "select">,
    a: string,
    b: string,
  ): Promise<string | null> => {
    const directRooms = await tx
      .select({ id: chatRoomsTable.id })
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.type, "direct"));
    for (const room of directRooms) {
      const members = await tx
        .select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, room.id));
      const ids = members.map((m) => m.userId);
      if (ids.length === 2 && ids.includes(a) && ids.includes(b)) return room.id;
    }
    return null;
  };

  if (type === "direct") {
    if (allMemberIds.length !== 2) {
      res.status(400).json({ error: "Direct rooms must have exactly 2 members" });
      return;
    }
    const [a, b] = [...allMemberIds].sort();

    // Serialize concurrent creation for this user pair with a transaction-scoped
    // advisory lock so two simultaneous requests can't both create a room.
    const roomId = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`direct:${a}:${b}`}))`);

      const existingId = await findDirectRoom(tx, a, b);
      if (existingId) {
        // Re-entering a room this user previously left: un-hide it so it
        // reappears in their list with the existing history intact.
        await tx
          .update(chatRoomMembersTable)
          .set({ hiddenAt: null })
          .where(
            and(
              eq(chatRoomMembersTable.roomId, existingId),
              eq(chatRoomMembersTable.userId, userId),
            ),
          );
        return existingId;
      }

      const [created] = await tx
        .insert(chatRoomsTable)
        .values({ type, name: null, ownerId: null })
        .returning();
      await tx
        .insert(chatRoomMembersTable)
        .values(allMemberIds.map((mid) => ({ roomId: created.id, userId: mid })));
      return created.id;
    });

    const result = await roomWithMeta(roomId, userId);
    res.status(201).json(result);
    return;
  }

  const [room] = await db
    .insert(chatRoomsTable)
    .values({ type, name: name ?? null, ownerId: type === "group" ? userId : null })
    .returning();

  await Promise.all(
    allMemberIds.map((mid) =>
      db.insert(chatRoomMembersTable).values({ roomId: room.id, userId: mid }),
    ),
  );

  const result = await roomWithMeta(room.id, userId);
  res.status(201).json(result);
});

router.get("/rooms/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

  if (!member) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const room = await roomWithMeta(raw, userId);
  res.json(room);
});

router.post("/rooms/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  await db.transaction(async (tx) => {
    // Serialize concurrent leaves of the same room so the "both parties hidden →
    // delete" garbage-collection check below sees a consistent membership view.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`room:${raw}`}))`);

    const [room] = await tx
      .select()
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, raw));
    if (!room) return;

    // Must be a member to leave.
    const [member] = await tx
      .select()
      .from(chatRoomMembersTable)
      .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));
    if (!member) return;

    // Direct (1:1) rooms: leaving must NOT destroy the other party's history.
    // Soft-hide this user's membership so the room disappears from their list
    // only. It is restored (un-hidden) when they re-open the chat or a new
    // message arrives. If both parties have hidden it, garbage-collect the room.
    if (room.type === "direct") {
      await tx
        .update(chatRoomMembersTable)
        .set({ hiddenAt: new Date() })
        .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

      const visible = await tx
        .select({ id: chatRoomMembersTable.id })
        .from(chatRoomMembersTable)
        .where(and(eq(chatRoomMembersTable.roomId, raw), isNull(chatRoomMembersTable.hiddenAt)));
      if (visible.length === 0) {
        await tx.delete(chatRoomsTable).where(eq(chatRoomsTable.id, raw));
      }
      return;
    }

    // Group rooms: fully remove this user's membership.
    await tx
      .delete(chatRoomMembersTable)
      .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

    const remaining = await tx
      .select({ userId: chatRoomMembersTable.userId, joinedAt: chatRoomMembersTable.joinedAt })
      .from(chatRoomMembersTable)
      .where(eq(chatRoomMembersTable.roomId, raw));

    // An empty group is orphaned — delete it (messages cascade).
    if (remaining.length === 0) {
      await tx.delete(chatRoomsTable).where(eq(chatRoomsTable.id, raw));
      return;
    }

    // If the owner left, hand ownership to the earliest-joined remaining member
    // so the room always has a valid owner.
    if (room.ownerId === userId) {
      const nextOwner = [...remaining].sort(
        (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
      )[0];
      await tx
        .update(chatRoomsTable)
        .set({ ownerId: nextOwner.userId })
        .where(eq(chatRoomsTable.id, raw));
    }
  });

  res.sendStatus(204);
});

router.patch("/rooms/:id/mute", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { muted } = req.body;
  const [updated] = await db
    .update(chatRoomMembersTable)
    .set({ muted: !!muted })
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)))
    .returning();
  res.json({ id: updated.id, roomId: updated.roomId, userId: updated.userId, joinedAt: updated.joinedAt.toISOString(), muted: updated.muted });
});

router.get("/rooms/:id/members", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));

  if (!member) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const memberRows = await db
    .select()
    .from(chatRoomMembersTable)
    .where(eq(chatRoomMembersTable.roomId, raw));

  const members = await Promise.all(
    memberRows.map(async (m) => {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
      return u ? { id: u.id, email: u.email, nickname: u.nickname, profileImageUrl: u.profileImageUrl ?? null, statusMessage: u.statusMessage ?? null } : null;
    }),
  );

  res.json(members.filter(Boolean));
});

router.post("/rooms/:id/members", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { memberIds } = req.body as { memberIds: string[] };

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    res.status(400).json({ error: "memberIds is required" });
    return;
  }
  if (memberIds.length > 50 || memberIds.some((m) => typeof m !== "string")) {
    res.status(400).json({ error: "Invalid memberIds" });
    return;
  }

  // Only an existing member of a GROUP room may invite others.
  const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, raw));
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, raw), eq(chatRoomMembersTable.userId, userId)));
  if (!member) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  if (room.type !== "group") {
    res.status(400).json({ error: "Only group rooms can be invited to" });
    return;
  }

  const added = await db.transaction(async (tx) => {
    // Serialize concurrent invites of the same room so the "already a member"
    // check and insert see a consistent membership view (no duplicate rows).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`room:${raw}`}))`);

    const existing = await tx
      .select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable)
      .where(eq(chatRoomMembersTable.roomId, raw));
    const existingIds = new Set(existing.map((m) => m.userId));

    // Only invite real users the inviter is actually friends with, and who
    // aren't already members. This mirrors the friends-only invite convention
    // and the group-create UI (which lists friends only).
    const candidateIds = Array.from(new Set(memberIds)).filter((mid) => !existingIds.has(mid));
    const newlyAdded: string[] = [];
    for (const mid of candidateIds) {
      const [friendship] = await tx
        .select({ id: friendshipsTable.id })
        .from(friendshipsTable)
        .where(
          or(
            and(eq(friendshipsTable.userAId, userId), eq(friendshipsTable.userBId, mid)),
            and(eq(friendshipsTable.userAId, mid), eq(friendshipsTable.userBId, userId)),
          ),
        );
      if (!friendship) continue;
      await tx.insert(chatRoomMembersTable).values({ roomId: raw, userId: mid });
      newlyAdded.push(mid);
    }
    return newlyAdded;
  });

  // Announce the new members with a system message so everyone sees who joined.
  if (added.length > 0) {
    const [inviter] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const addedUsers = await Promise.all(
      added.map(async (mid) => {
        const [u] = await db.select({ nickname: usersTable.nickname }).from(usersTable).where(eq(usersTable.id, mid));
        return u?.nickname ?? "알 수 없음";
      }),
    );
    const names = addedUsers.join(", ");
    await db.insert(messagesTable).values({
      roomId: raw,
      senderId: userId,
      type: "system",
      content: `${inviter?.nickname ?? "누군가"}님이 ${names}님을 초대했습니다`,
    });
    await db
      .update(chatRoomsTable)
      .set({ lastMessage: `${names}님이 참여했습니다`, lastMessageAt: new Date() })
      .where(eq(chatRoomsTable.id, raw));
  }

  const result = await roomWithMeta(raw, userId);
  res.json(result);
});

export default router;
