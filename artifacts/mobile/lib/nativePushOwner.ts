import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearNativePushOwnerLease,
  readNativePushOwnerLease,
  writeNativePushOwnerLease,
} from "./nativePushOwnerPolicy";
export { NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS } from "./nativePushOwnerPolicy";

let ownerWriteQueue: Promise<void> = Promise.resolve();

function withOwnerStorageQueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = ownerWriteQueue.catch(() => undefined).then(operation);
  ownerWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Serialised so delayed logout cleanup cannot clear a newer account owner. */
export function setCurrentNativePushOwner(userId: string | null): Promise<void> {
  return withOwnerStorageQueue(() =>
    writeNativePushOwnerLease(AsyncStorage, userId),
  );
}

export function clearCurrentNativePushOwner(ownerId: string): Promise<boolean> {
  return withOwnerStorageQueue(() =>
    clearNativePushOwnerLease(AsyncStorage, ownerId),
  );
}

export function getCurrentNativePushOwner(now = Date.now()): Promise<string | null> {
  return withOwnerStorageQueue(async () => {
    try {
      return (await readNativePushOwnerLease(AsyncStorage, now))?.ownerId ?? null;
    } catch {
      return null;
    }
  });
}

export async function nativePushMatchesCurrentOwner(
  recipientUserId: unknown,
  now = Date.now(),
): Promise<boolean> {
  if (typeof recipientUserId !== "string") return false;
  return (await getCurrentNativePushOwner(now)) === recipientUserId;
}
