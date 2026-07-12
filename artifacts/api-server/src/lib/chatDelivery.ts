import { and, eq, inArray, or, sql } from "drizzle-orm";
import { blockedUsersTable, chatRoomMembersTable, chatRoomsTable, db } from "@workspace/db";

type SelectExecutor = Pick<typeof db, "select">;
type LockExecutor = Pick<typeof db, "execute">;

export interface ChatDeliveryMember {
  userId: string;
  muted: boolean;
}

export interface ChatDeliveryRecipients {
  realtimeUserIds: string[];
  pushUserIds: string[];
}

export async function lockUserPair(executor: LockExecutor, userAId: string, userBId: string): Promise<void> {
  const [a, b] = [userAId, userBId].sort();
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`chat-policy:${a}:${b}`}))`);
}

export async function hasMutualBlockBetween(executor: SelectExecutor, userAId: string, userBId: string): Promise<boolean> {
  const rows = await executor
    .select({ id: blockedUsersTable.id })
    .from(blockedUsersTable)
    .where(
      or(
        and(eq(blockedUsersTable.blockerUserId, userAId), eq(blockedUsersTable.blockedUserId, userBId)),
        and(eq(blockedUsersTable.blockerUserId, userBId), eq(blockedUsersTable.blockedUserId, userAId)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function getBlockedRecipientIds(actorUserId: string, recipientUserIds: string[]): Promise<Set<string>> {
  const candidateIds = Array.from(new Set(recipientUserIds.filter((id) => id !== actorUserId)));
  if (candidateIds.length === 0) return new Set();
  const rows = await db
    .select({ blockerUserId: blockedUsersTable.blockerUserId, blockedUserId: blockedUsersTable.blockedUserId })
    .from(blockedUsersTable)
    .where(
      or(
        and(eq(blockedUsersTable.blockerUserId, actorUserId), inArray(blockedUsersTable.blockedUserId, candidateIds)),
        and(eq(blockedUsersTable.blockedUserId, actorUserId), inArray(blockedUsersTable.blockerUserId, candidateIds)),
      ),
    );
  return new Set(rows.map((row) => row.blockerUserId === actorUserId ? row.blockedUserId : row.blockerUserId));
}

export function selectChatDeliveryRecipients(
  members: ChatDeliveryMember[],
  actorUserId: string,
  blockedRecipientIds: ReadonlySet<string>,
): ChatDeliveryRecipients {
  const recipients = members.filter((member) => member.userId === actorUserId || !blockedRecipientIds.has(member.userId));
  return {
    // Muting controls OS notifications only. Realtime stays active so the room
    // remains current while the user is in the app.
    realtimeUserIds: recipients.map((member) => member.userId),
    pushUserIds: recipients.filter((member) => member.userId !== actorUserId && !member.muted).map((member) => member.userId),
  };
}

export async function getRoomDeliveryRecipients(roomId: string, actorUserId: string): Promise<ChatDeliveryRecipients> {
  const members = await db
    .select({ userId: chatRoomMembersTable.userId, muted: chatRoomMembersTable.muted })
    .from(chatRoomMembersTable)
    .where(eq(chatRoomMembersTable.roomId, roomId));
  const blockedRecipientIds = await getBlockedRecipientIds(actorUserId, members.map((member) => member.userId));
  return selectChatDeliveryRecipients(members, actorUserId, blockedRecipientIds);
}

export async function getDirectRoomPeer(
  roomId: string,
  userId: string,
): Promise<{ isDirect: boolean; peerId: string | null }> {
  const [[room], members] = await Promise.all([
    db.select({ type: chatRoomsTable.type }).from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)),
    db.select({ userId: chatRoomMembersTable.userId }).from(chatRoomMembersTable).where(eq(chatRoomMembersTable.roomId, roomId)),
  ]);
  if (room?.type !== "direct") return { isDirect: false, peerId: null };
  const peers = members.filter((member) => member.userId !== userId);
  return { isDirect: true, peerId: members.length === 2 && peers.length === 1 ? peers[0].userId : null };
}

export type MessageLockExecutor = LockExecutor & SelectExecutor;

export async function lockAndCheckDirectRoomBlock(
  executor: MessageLockExecutor,
  userId: string,
  peerId: string | null,
): Promise<boolean> {
  if (!peerId) return false;
  await lockUserPair(executor, userId, peerId);
  return hasMutualBlockBetween(executor, userId, peerId);
}
