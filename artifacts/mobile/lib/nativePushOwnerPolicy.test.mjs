import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_NATIVE_PUSH_OWNER_STORAGE_KEY,
  NATIVE_PUSH_OWNER_LEASE_MS,
  NATIVE_PUSH_OWNER_RECORD_VERSION,
  NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS,
  NATIVE_PUSH_OWNER_STORAGE_KEY,
  clearNativePushOwnerLease,
  nativePushOwnerNeedsRefresh,
  parseNativePushOwnerRecord,
  readNativePushOwnerLease,
  writeNativePushOwnerLease,
} from "./nativePushOwnerPolicy.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

test("a native owner is a versioned 24-hour lease refreshed after six hours", async () => {
  const now = 2_000_000_000_000;
  const storage = memoryStorage();
  await writeNativePushOwnerLease(storage, "user-A", now);

  const serialized = storage.values.get(NATIVE_PUSH_OWNER_STORAGE_KEY);
  const stored = JSON.parse(serialized);
  assert.deepEqual(stored, {
    version: NATIVE_PUSH_OWNER_RECORD_VERSION,
    ownerId: "user-A",
    refreshedAt: now,
    expiresAt: now + NATIVE_PUSH_OWNER_LEASE_MS,
  });
  assert.equal(nativePushOwnerNeedsRefresh(stored, now + NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS - 1), false);
  assert.equal(nativePushOwnerNeedsRefresh(stored, now + NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS), true);

  await writeNativePushOwnerLease(
    storage,
    "user-A",
    now + NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS,
  );
  const refreshed = await readNativePushOwnerLease(
    storage,
    now + NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS,
  );
  assert.equal(refreshed?.refreshedAt, now + NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS);
  assert.equal(
    refreshed?.expiresAt,
    now + NATIVE_PUSH_OWNER_REFRESH_INTERVAL_MS + NATIVE_PUSH_OWNER_LEASE_MS,
  );
});

test("force-close without logout fails closed after the lease expires", async () => {
  const now = 2_000_000_000_000;
  const storage = memoryStorage();
  await writeNativePushOwnerLease(storage, "user-A", now);

  assert.equal((await readNativePushOwnerLease(storage, now + NATIVE_PUSH_OWNER_LEASE_MS - 1))?.ownerId, "user-A");
  assert.equal(await readNativePushOwnerLease(storage, now + NATIVE_PUSH_OWNER_LEASE_MS), null);
  assert.equal(storage.values.has(NATIVE_PUSH_OWNER_STORAGE_KEY), false);
});

test("legacy bare owner IDs and malformed v2 values never authorize a push", async () => {
  const now = 2_000_000_000_000;
  const storage = memoryStorage({
    [LEGACY_NATIVE_PUSH_OWNER_STORAGE_KEY]: "user-A",
    [NATIVE_PUSH_OWNER_STORAGE_KEY]: "user-A",
  });

  assert.equal(parseNativePushOwnerRecord("user-A", now), null);
  assert.equal(await readNativePushOwnerLease(storage, now), null);
  assert.equal(storage.values.has(LEGACY_NATIVE_PUSH_OWNER_STORAGE_KEY), false);
  assert.equal(storage.values.has(NATIVE_PUSH_OWNER_STORAGE_KEY), false);
});

test("late account-A cleanup cannot clear account B and logout removes its own lease", async () => {
  const now = 2_000_000_000_000;
  const storage = memoryStorage();
  await writeNativePushOwnerLease(storage, "user-B", now);

  assert.equal(await clearNativePushOwnerLease(storage, "user-A", now), false);
  assert.equal((await readNativePushOwnerLease(storage, now))?.ownerId, "user-B");
  assert.equal(await clearNativePushOwnerLease(storage, "user-B", now), true);
  assert.equal(await readNativePushOwnerLease(storage, now), null);
});
