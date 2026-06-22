// Ephemeral, in-memory "is typing" tracking. Typing state is transient and does
// not need to survive restarts, so we avoid a DB table/migration and keep it in
// process memory with a short TTL. Entries auto-expire; stale rooms are pruned.
const TTL_MS = 5000;

const rooms = new Map<string, Map<string, number>>();

export function markTyping(roomId: string, userId: string): void {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Map();
    rooms.set(roomId, room);
  }
  room.set(userId, Date.now() + TTL_MS);
}

export function getTypingUserIds(roomId: string, excludeUserId: string): string[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  const now = Date.now();
  const active: string[] = [];
  for (const [userId, expiresAt] of room) {
    if (expiresAt <= now) {
      room.delete(userId);
      continue;
    }
    if (userId !== excludeUserId) active.push(userId);
  }
  if (room.size === 0) rooms.delete(roomId);
  return active;
}
