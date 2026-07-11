import { and, eq, or, sql } from "drizzle-orm";
import {
  anotherMeSettingsTable,
  chatRoomMembersTable,
  chatRoomsTable,
  db,
  friendshipsTable,
  usersTable,
} from "@workspace/db";

export const BIBI_OFFICIAL_USER_ID = "00000000-0000-4000-8000-00000000b1b1";
export const BIBI_OFFICIAL_HANDLE = "@bibi_official";
export const BIBI_OFFICIAL_PROFILE_IMAGE_URL = "https://anothermeai.app/images/bibi-profileimg.png";

const BIBI_OFFICIAL_SEED = {
  id: BIBI_OFFICIAL_USER_ID,
  clerkId: "official:bibi",
  email: "bibi.official@anotherme.local",
  nickname: "BIBI Official",
  profileImageUrl: BIBI_OFFICIAL_PROFILE_IMAGE_URL,
  statusMessage: "BIBI Official 준비 계정입니다. 응답에는 AI 라벨이 표시돼요.",
};

export type BibiOfficialProfile = {
  id: string;
  email: string;
  nickname: string;
  displayName: string;
  handle: string;
  profileImageUrl: string | null;
  statusMessage: string | null;
};

function toBibiProfile(user: typeof usersTable.$inferSelect): BibiOfficialProfile {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    displayName: user.nickname,
    handle: BIBI_OFFICIAL_HANDLE,
    profileImageUrl: user.profileImageUrl ?? null,
    statusMessage: user.statusMessage ?? null,
  };
}

export async function ensureBibiOfficialUser(): Promise<typeof usersTable.$inferSelect> {
  const now = new Date();
  const [user] = await db
    .insert(usersTable)
    .values(BIBI_OFFICIAL_SEED)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        nickname: BIBI_OFFICIAL_SEED.nickname,
        profileImageUrl: BIBI_OFFICIAL_PROFILE_IMAGE_URL,
        statusMessage: BIBI_OFFICIAL_SEED.statusMessage,
        updatedAt: now,
      },
    })
    .returning();

  return user;
}

export async function ensureBibiOfficialAccount(): Promise<typeof usersTable.$inferSelect> {
  const user = await ensureBibiOfficialUser();
  const now = new Date();
  await db
    .insert(anotherMeSettingsTable)
    .values({
      userId: user.id,
      summonEnabled: true,
      defaultWaitMinutes: 1,
      allowFriends: true,
      allowFamily: true,
      allowWork: false,
      allowUnknown: true,
      autoReplyEnabled: true,
      sensitiveReplyBlocked: true,
      toneSyncEnabled: true,
      defaultToneSyncLevel: "MEDIUM",
    })
    .onConflictDoUpdate({
      target: anotherMeSettingsTable.userId,
      set: {
        summonEnabled: true,
        defaultWaitMinutes: 1,
        allowFriends: true,
        allowFamily: true,
        allowUnknown: true,
        autoReplyEnabled: true,
        sensitiveReplyBlocked: true,
        toneSyncEnabled: true,
        defaultToneSyncLevel: "MEDIUM",
        updatedAt: now,
      },
    });
  return user;
}

export async function backfillBibiOfficialFriendships(): Promise<void> {
  await ensureBibiOfficialAccount();
  await db.execute(sql`
    INSERT INTO friendships (user_a_id, user_b_id)
    SELECT ${BIBI_OFFICIAL_USER_ID}::uuid, u.id
    FROM users u
    WHERE u.id <> ${BIBI_OFFICIAL_USER_ID}::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM friendships f
        WHERE (f.user_a_id = ${BIBI_OFFICIAL_USER_ID}::uuid AND f.user_b_id = u.id)
           OR (f.user_a_id = u.id AND f.user_b_id = ${BIBI_OFFICIAL_USER_ID}::uuid)
      )
  `);
}

export async function ensureBibiFriendshipForUser(userId: string): Promise<void> {
  if (!userId || userId === BIBI_OFFICIAL_USER_ID) return;
  await ensureBibiOfficialAccount();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`bibi-friend:${userId}`}))`);
    const [existing] = await tx
      .select({ id: friendshipsTable.id })
      .from(friendshipsTable)
      .where(
        or(
          and(eq(friendshipsTable.userAId, BIBI_OFFICIAL_USER_ID), eq(friendshipsTable.userBId, userId)),
          and(eq(friendshipsTable.userAId, userId), eq(friendshipsTable.userBId, BIBI_OFFICIAL_USER_ID)),
        ),
      )
      .limit(1);
    if (!existing) {
      await tx.insert(friendshipsTable).values({ userAId: BIBI_OFFICIAL_USER_ID, userBId: userId });
    }
  });
}

export async function getBibiOfficialProfile(): Promise<BibiOfficialProfile> {
  const user = await ensureBibiOfficialAccount();
  return toBibiProfile(user);
}

async function findDirectRoomId(tx: Pick<typeof db, "execute">, userAId: string, userBId: string): Promise<string | null> {
  const result = await tx.execute(sql`
    SELECT crm.room_id AS "roomId"
    FROM chat_room_members crm
    INNER JOIN chat_rooms cr ON cr.id = crm.room_id
    WHERE cr.type = 'direct'
      AND crm.user_id IN (${userAId}::uuid, ${userBId}::uuid)
    GROUP BY crm.room_id
    HAVING count(DISTINCT crm.user_id) = 2
       AND (SELECT count(*) FROM chat_room_members all_members WHERE all_members.room_id = crm.room_id) = 2
    LIMIT 1
  `);
  const rows = ((result as unknown as { rows?: Array<{ roomId?: string }> }).rows ?? []);
  return rows[0]?.roomId ?? null;
}

export async function getOrCreateBibiDirectRoom(userId: string): Promise<string> {
  if (userId === BIBI_OFFICIAL_USER_ID) throw new Error("BIBI Official cannot open a self chat");
  await ensureBibiFriendshipForUser(userId);
  const [a, b] = [userId, BIBI_OFFICIAL_USER_ID].sort();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`direct:${a}:${b}`}))`);
    const existingId = await findDirectRoomId(tx, userId, BIBI_OFFICIAL_USER_ID);
    if (existingId) {
      await tx
        .update(chatRoomMembersTable)
        .set({ hiddenAt: null })
        .where(eq(chatRoomMembersTable.roomId, existingId));
      return existingId;
    }

    const [room] = await tx
      .insert(chatRoomsTable)
      .values({ type: "direct", name: null, ownerId: null })
      .returning();
    await tx.insert(chatRoomMembersTable).values([
      { roomId: room.id, userId },
      { roomId: room.id, userId: BIBI_OFFICIAL_USER_ID },
    ]);
    return room.id;
  });
}
