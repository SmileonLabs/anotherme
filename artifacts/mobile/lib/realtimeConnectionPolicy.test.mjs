import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartRealtimeConnection,
  realtimeReconnectDelayMs,
  RealtimeGenerationFence,
  runWithAbortDeadline,
} from "./realtimeConnectionPolicy.ts";

test("realtime reconnect backoff is exponential and capped", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map(realtimeReconnectDelayMs),
    [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000],
  );
});

test("offline, hidden and background states prohibit a new connection", () => {
  assert.equal(
    canStartRealtimeConnection({ online: true, visible: true, appActive: true }),
    true,
  );
  assert.equal(
    canStartRealtimeConnection({ online: false, visible: true, appActive: true }),
    false,
  );
  assert.equal(
    canStartRealtimeConnection({ online: true, visible: false, appActive: true }),
    false,
  );
  assert.equal(
    canStartRealtimeConnection({ online: true, visible: true, appActive: false }),
    false,
  );
});

test("a newer generation fences every older asynchronous result", () => {
  const fence = new RealtimeGenerationFence();
  const oldAttempt = fence.begin();
  const currentAttempt = fence.begin();
  assert.equal(fence.isCurrent(oldAttempt), false);
  assert.equal(fence.isCurrent(currentAttempt), true);
  fence.invalidate();
  assert.equal(fence.isCurrent(currentAttempt), false);
});

test("deadline aborts and releases a non-cooperative ticket operation", async () => {
  let suppliedSignal;
  await assert.rejects(
    runWithAbortDeadline(
      async (signal) => {
        suppliedSignal = signal;
        return new Promise(() => {});
      },
      5,
    ),
    { name: "AbortError" },
  );
  assert.equal(suppliedSignal.aborted, true);
});

test("parent cleanup aborts an active ticket deadline immediately", async () => {
  const parent = new AbortController();
  const pending = runWithAbortDeadline(
    async () => new Promise(() => {}),
    10_000,
    parent.signal,
  );
  parent.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
