export interface DeviceValueOwner<T> {
  userId: string;
  values: readonly T[];
}

/**
 * Reassigns one physical/browser device identifier to exactly one account.
 * The database caller serializes equal-key operations and row-locks every
 * returned owner before applying these deterministic updates.
 */
export function rebindExclusiveDevice<T>(
  owners: readonly DeviceValueOwner<T>[],
  targetUserId: string,
  incoming: T,
  deviceKey: (value: T) => string,
  maxPerOwner: number,
): Map<string, T[]> {
  if (!targetUserId || !Number.isSafeInteger(maxPerOwner) || maxPerOwner < 1) {
    throw new TypeError("invalid exclusive device binding arguments");
  }
  const incomingKey = deviceKey(incoming);
  if (!incomingKey) throw new TypeError("device key is required");

  const updates = new Map<string, T[]>();
  for (const owner of owners) {
    const remaining = owner.values.filter(
      (value) => deviceKey(value) !== incomingKey,
    );
    const next =
      owner.userId === targetUserId
        ? [...remaining, incoming].slice(-maxPerOwner)
        : remaining;
    if (
      next.length !== owner.values.length ||
      next.some((value, index) => deviceKey(value) !== deviceKey(owner.values[index]))
    ) {
      updates.set(owner.userId, next);
    }
  }
  if (!owners.some((owner) => owner.userId === targetUserId)) {
    throw new Error("target push owner does not exist");
  }
  return updates;
}

export function removeOwnedDevice<T>(
  values: readonly T[],
  ownedDeviceKey: string,
  deviceKey: (value: T) => string,
): T[] {
  return values.filter((value) => deviceKey(value) !== ownedDeviceKey);
}
