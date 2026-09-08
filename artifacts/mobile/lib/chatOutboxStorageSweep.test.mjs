import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_OUTBOX_STORAGE_KEY_PREFIX,
  chatOutboxStorageKey,
  clearChatOutboxStorageForOwner,
  sweepChatOutboxStorage,
} from "./chatOutboxStorageSweep.ts";
import {
  CHAT_OUTBOX_RETENTION_MS,
  pruneChatOutbox,
} from "./chatOutboxPolicy.ts";

function entry(ownerId, createdAt, clientMessageId) {
  return {
    clientMessageId,
    tempId: `temp-${clientMessageId}`,
    roomId: "room-1",
    senderId: ownerId,
    senderProfileId: `profile-${ownerId}`,
    content: `private message from ${ownerId}`,
    type: "text",
    replyToMessageId: null,
    createdAt,
    attempts: 0,
    nextAttemptAt: createdAt,
    deliveryState: "pending",
    retryable: true,
  };
}

function memoryStorage(initial) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getAllKeys() {
      return Array.from(values.keys());
    },
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

test("a startup/session-B sweep removes expired account-A plaintext", async () => {
  const now = 2_000_000_000_000;
  const keyA = chatOutboxStorageKey("user-A");
  const keyB = chatOutboxStorageKey("user-B");
  const storage = memoryStorage({
    [keyA]: JSON.stringify([
      entry("user-A", now - CHAT_OUTBOX_RETENTION_MS - 1, "m-user-A-expired"),
    ]),
    [keyB]: JSON.stringify([
      entry("user-B", now - 1_000, "m-user-B-current"),
    ]),
    "anotherme:unrelated": "keep",
  });

  const result = await sweepChatOutboxStorage(storage, now, pruneChatOutbox);

  assert.deepEqual(result, { examined: 2, removed: 1, rewritten: 0 });
  assert.equal(storage.values.has(keyA), false);
  assert.equal(storage.values.has(keyB), true);
  assert.equal(storage.values.get("anotherme:unrelated"), "keep");
});

test("the global sweep prunes mixed rows and ignores malformed owner keys", async () => {
  const now = 2_000_000_000_000;
  const key = chatOutboxStorageKey("user/shared device");
  const malformedKey = `${CHAT_OUTBOX_STORAGE_KEY_PREFIX}%not-encoded`;
  const current = entry("user/shared device", now - 1_000, "m-current");
  const storage = memoryStorage({
    [key]: JSON.stringify([
      entry("user/shared device", now - CHAT_OUTBOX_RETENTION_MS - 1, "m-expired"),
      current,
    ]),
    [malformedKey]: "do-not-touch",
  });

  const result = await sweepChatOutboxStorage(storage, now, pruneChatOutbox);

  assert.deepEqual(result, { examined: 1, removed: 0, rewritten: 1 });
  assert.deepEqual(JSON.parse(storage.values.get(key)), [current]);
  assert.equal(storage.values.get(malformedKey), "do-not-touch");
});

test("logout removes only the previous owner's plaintext namespace", async () => {
  const now = 2_000_000_000_000;
  const keyA = chatOutboxStorageKey("user-A");
  const keyB = chatOutboxStorageKey("user-B");
  const storage = memoryStorage({
    [keyA]: JSON.stringify([entry("user-A", now, "m-user-A")]),
    [keyB]: JSON.stringify([entry("user-B", now, "m-user-B")]),
    "anotherme:unrelated": "keep",
  });
  const lockOwners = [];

  await clearChatOutboxStorageForOwner(
    storage,
    "user-A",
    async (ownerId, operation) => {
      lockOwners.push(ownerId);
      return operation();
    },
  );

  assert.deepEqual(lockOwners, ["user-A"]);
  assert.equal(storage.values.has(keyA), false);
  assert.match(storage.values.get(keyB), /private message from user-B/);
  assert.equal(storage.values.get("anotherme:unrelated"), "keep");
});
