import { getRedis } from "./redis";
import { logger } from "./logger";

const TTL_MS = 60_000;
const TTL_SECONDS = Math.ceil(TTL_MS / 1000);

export interface PresenceState {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
  platform: string | null;
  roomId: string | null;
}

interface StoredPresence {
  lastSeenAt: string;
  platform: string | null;
  roomId: string | null;
  expiresAt: number;
}

const localPresence = new Map<string, StoredPresence>();

function key(userId: string): string {
  return `presence:user:${userId}`;
}

function toPublicState(userId: string, stored: StoredPresence | null, now: number): PresenceState {
  if (!stored || stored.expiresAt <= now) {
    if (stored) localPresence.delete(userId);
    return { userId, online: false, lastSeenAt: stored?.lastSeenAt ?? null, platform: null, roomId: null };
  }
  return {
    userId,
    online: true,
    lastSeenAt: stored.lastSeenAt,
    platform: stored.platform,
    roomId: stored.roomId,
  };
}

export async function markPresence(
  userId: string,
  input: { platform?: string | null; roomId?: string | null } = {},
): Promise<PresenceState> {
  const now = Date.now();
  const stored: StoredPresence = {
    lastSeenAt: new Date(now).toISOString(),
    platform: input.platform?.slice(0, 32) ?? null,
    roomId: input.roomId ?? null,
    expiresAt: now + TTL_MS,
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key(userId), JSON.stringify(stored), "EX", TTL_SECONDS);
      return toPublicState(userId, stored, now);
    } catch (err) {
      logger.error({ err, userId }, "Failed to write presence state to Redis");
    }
  }

  localPresence.set(userId, stored);
  return toPublicState(userId, stored, now);
}

function parseStoredPresence(value: string | null): StoredPresence | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredPresence>;
    if (typeof parsed.lastSeenAt !== "string" || typeof parsed.expiresAt !== "number") return null;
    return {
      lastSeenAt: parsed.lastSeenAt,
      expiresAt: parsed.expiresAt,
      platform: typeof parsed.platform === "string" ? parsed.platform : null,
      roomId: typeof parsed.roomId === "string" ? parsed.roomId : null,
    };
  } catch {
    return null;
  }
}

export async function getPresenceStates(userIds: string[]): Promise<PresenceState[]> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  const now = Date.now();
  if (uniqueIds.length === 0) return [];

  const redis = getRedis();
  if (redis) {
    try {
      const values = await redis.mget(uniqueIds.map(key));
      return uniqueIds.map((userId, index) => toPublicState(userId, parseStoredPresence(values[index]), now));
    } catch (err) {
      logger.error({ err }, "Failed to read presence state from Redis");
    }
  }

  return uniqueIds.map((userId) => toPublicState(userId, localPresence.get(userId) ?? null, now));
}
