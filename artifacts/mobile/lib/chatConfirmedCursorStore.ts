import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  normalizePersistedConfirmedCursors,
  upsertPersistedConfirmedCursor,
} from "./chatMessageReliability";

const KEY_PREFIX = "anotherme:chat-confirmed-cursors:v1:";
const locks = new Map<string, Promise<unknown>>();

function scopeKey(userId: string, profileId: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(profileId)}`;
}

function withScopeLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  locks.set(key, next);
  void next.then(
    () => {
      if (locks.get(key) === next) locks.delete(key);
    },
    () => {
      if (locks.get(key) === next) locks.delete(key);
    },
  );
  return next;
}

async function readScope(key: string) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    return normalizePersistedConfirmedCursors(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export async function loadConfirmedChatCursor(
  userId: string,
  profileId: string,
  roomId: string,
): Promise<number> {
  if (!userId || !profileId || !roomId) return 0;
  const key = scopeKey(userId, profileId);
  return withScopeLock(key, async () => {
    const records = await readScope(key);
    return records.find((record) => record.roomId === roomId)?.roomSeq ?? 0;
  });
}

export async function saveConfirmedChatCursor(
  userId: string,
  profileId: string,
  roomId: string,
  roomSeq: number,
): Promise<void> {
  if (!userId || !profileId || !roomId) return;
  const key = scopeKey(userId, profileId);
  return withScopeLock(key, async () => {
    const current = await readScope(key);
    const next = upsertPersistedConfirmedCursor(current, roomId, roomSeq);
    await AsyncStorage.setItem(key, JSON.stringify(next));
  });
}
