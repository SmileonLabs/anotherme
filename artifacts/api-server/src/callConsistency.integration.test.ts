import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const runInfrastructureTests = process.env.RUN_INFRA_INTEGRATION === "1";
const dependencies = runInfrastructureTests
  ? {
      ...(await import("@workspace/db")),
      ...(await import("./lib/callControl")),
      ...(await import("./routes/calls")),
    }
  : null;

const callerId = "00000000-0000-4000-8000-00000000d101";
const calleeAId = "00000000-0000-4000-8000-00000000d102";
const calleeBId = "00000000-0000-4000-8000-00000000d103";
const callAId = "00000000-0000-4000-8000-00000000ca11";
const callBId = "00000000-0000-4000-8000-00000000ca12";
const operationAId = "00000000-0000-4000-8000-00000000cc01";
const roomId = "00000000-0000-4000-8000-00000000d201";
const callerProfileId = "00000000-0000-4000-8000-00000000d301";

describe("call consistency with migrated PostgreSQL", () => {
  if (!runInfrastructureTests) {
    it.skip("requires RUN_INFRA_INTEGRATION=1", () => {});
    return;
  }

  const {
    pool,
    db,
    callsTable,
    applyCallControlOperation,
    CallAttemptConflictError,
    CallOperationConflictError,
    ensureCallMessage,
    pruneExpiredCallControlOperations,
    processCallLifecycleBatch,
    recordParticipantObservation,
  } = dependencies!;

  beforeEach(async () => {
    await pool.query("DELETE FROM chat_rooms WHERE id = $1", [roomId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[callerId, calleeAId, calleeBId]]);
    await pool.query(
      `INSERT INTO users (id, clerk_id, email, nickname) VALUES
       ($1, 'test:call-caller', 'call-caller@example.invalid', 'caller'),
       ($2, 'test:call-callee-a', 'call-a@example.invalid', 'callee-a'),
       ($3, 'test:call-callee-b', 'call-b@example.invalid', 'callee-b')`,
      [callerId, calleeAId, calleeBId],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM chat_rooms WHERE id = $1", [roomId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[callerId, calleeAId, calleeBId]]);
    await pool.end();
  });

  it("replays A without releasing B locks and rejects cross-call operation reuse", async () => {
    await pool.query(
      "INSERT INTO calls (id, room_name, caller_id, callee_id, status) VALUES ($1, $2, $3, $4, 'ringing')",
      [callAId, `call-test-a-${Date.now()}`, callerId, calleeAId],
    );
    await pool.query(
      "INSERT INTO call_user_locks (user_id, call_id) VALUES ($1, $3), ($2, $3)",
      [callerId, calleeAId, callAId],
    );
    const first = await applyCallControlOperation({
      callId: callAId,
      actorUserId: callerId,
      action: "end",
      operationId: operationAId,
    });
    expect(first).toMatchObject({ transitioned: true, replayed: false });
    expect(first.call.status).toBe("cancelled");

    for (let index = 10; index < 15; index += 1) {
      const terminalReplay = await applyCallControlOperation({
        callId: callAId,
        actorUserId: callerId,
        action: "end",
        operationId: `00000000-0000-4000-8000-00000000cc${index}`,
      });
      expect(terminalReplay.transitioned).toBe(false);
    }
    const operationCount = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM call_control_operations WHERE call_id = $1",
      [callAId],
    );
    expect(operationCount.rows[0].count).toBe(1);

    await pool.query(
      "INSERT INTO calls (id, room_name, caller_id, callee_id, status) VALUES ($1, $2, $3, $4, 'ringing')",
      [callBId, `call-test-b-${Date.now()}`, callerId, calleeBId],
    );
    await pool.query(
      "INSERT INTO call_user_locks (user_id, call_id) VALUES ($1, $3), ($2, $3)",
      [callerId, calleeBId, callBId],
    );

    const replay = await applyCallControlOperation({
      callId: callAId,
      actorUserId: callerId,
      action: "end",
      operationId: operationAId,
    });
    expect(replay).toMatchObject({ transitioned: false, replayed: true });
    const locks = await pool.query<{ callId: string }>(
      "SELECT call_id AS \"callId\" FROM call_user_locks WHERE call_id = $1",
      [callBId],
    );
    expect(locks.rows).toHaveLength(2);

    await expect(applyCallControlOperation({
      callId: callBId,
      actorUserId: callerId,
      action: "end",
      operationId: operationAId,
    })).rejects.toBeInstanceOf(CallOperationConflictError);
  });

  it("rejects a mixed-generation attempt without transitioning or releasing locks", async () => {
    const storedAttempt = "00000000-0000-4000-8000-00000000aa01";
    await pool.query(
      "INSERT INTO calls (id, attempt_id, room_name, caller_id, callee_id, status, accepted_at) VALUES ($1, $2, $3, $4, $5, 'active', now())",
      [callAId, storedAttempt, `call-test-attempt-${Date.now()}`, callerId, calleeAId],
    );
    await pool.query(
      "INSERT INTO call_user_locks (user_id, call_id) VALUES ($1, $3), ($2, $3)",
      [callerId, calleeAId, callAId],
    );

    await expect(applyCallControlOperation({
      callId: callAId,
      actorUserId: callerId,
      action: "end",
      operationId: "00000000-0000-4000-8000-00000000cc20",
      attemptId: "00000000-0000-4000-8000-00000000aa02",
    })).rejects.toBeInstanceOf(CallAttemptConflictError);
    await expect(applyCallControlOperation({
      callId: callAId,
      actorUserId: callerId,
      action: "end",
      operationId: "00000000-0000-4000-8000-00000000cc21",
      enforceAttemptHeaderAfter: new Date(0),
    })).rejects.toBeInstanceOf(CallAttemptConflictError);

    const current = await pool.query<{ status: string }>("SELECT status FROM calls WHERE id = $1", [callAId]);
    const locks = await pool.query("SELECT 1 FROM call_user_locks WHERE call_id = $1", [callAId]);
    const operations = await pool.query("SELECT 1 FROM call_control_operations WHERE call_id = $1", [callAId]);
    expect(current.rows[0].status).toBe("active");
    expect(locks.rows).toHaveLength(2);
    expect(operations.rows).toHaveLength(0);
  });

  it("rejects a stale reconciliation claim before it can overwrite a healthy observation", async () => {
    await pool.query(
      `INSERT INTO calls
       (id, room_name, caller_id, callee_id, status, accepted_at, livekit_participant_count,
        livekit_participant_deficit_at, livekit_last_observed_at, livekit_reconciliation_claimed_at)
       VALUES ($1, $2, $3, $4, 'active', now() - interval '10 minutes', 0,
        now() - interval '5 minutes', now() - interval '2 minutes', now() - interval '2 minutes')`,
      [callAId, `call-test-observation-${Date.now()}`, callerId, calleeAId],
    );
    const [stale] = await db.select().from(callsTable).where(eq(callsTable.id, callAId));
    const healthyClaim = new Date();
    await pool.query(
      `UPDATE calls SET livekit_participant_count = 2,
       livekit_participant_deficit_at = NULL, livekit_last_observed_at = now(),
       livekit_reconciliation_claimed_at = $2 WHERE id = $1`,
      [callAId, healthyClaim],
    );

    const result = await recordParticipantObservation(stale, 0, new Date());
    expect(result).toBeNull();
    const current = await pool.query<{
      count: number;
      deficit: Date | null;
      claim: Date | null;
    }>(
      `SELECT livekit_participant_count AS count,
       livekit_participant_deficit_at AS deficit,
       livekit_reconciliation_claimed_at AS claim FROM calls WHERE id = $1`,
      [callAId],
    );
    expect(current.rows[0].count).toBe(2);
    expect(current.rows[0].deficit).toBeNull();
    expect(current.rows[0].claim?.getTime()).toBe(healthyClaim.getTime());
  });

  it("prunes the operation ledger in a bounded retention pass", async () => {
    await pool.query(
      "INSERT INTO calls (id, room_name, caller_id, callee_id, status, ended_at) VALUES ($1, $2, $3, $4, 'ended', now() - interval '40 days')",
      [callAId, `call-test-retention-${Date.now()}`, callerId, calleeAId],
    );
    await pool.query(
      `INSERT INTO call_control_operations
       (operation_id, call_id, actor_user_id, action, result_status, created_at)
       VALUES ($1, $2, $3, 'end', 'ended', now() - interval '40 days')`,
      [operationAId, callAId, callerId],
    );
    await expect(pruneExpiredCallControlOperations()).resolves.toBe(1);
    const remaining = await pool.query("SELECT 1 FROM call_control_operations WHERE operation_id = $1", [operationAId]);
    expect(remaining.rows).toHaveLength(0);
  });

  it("allows only one terminal transition under concurrent operations", async () => {
    await pool.query(
      "INSERT INTO calls (id, room_name, caller_id, callee_id, status, accepted_at) VALUES ($1, $2, $3, $4, 'active', now())",
      [callAId, `call-test-race-${Date.now()}`, callerId, calleeAId],
    );
    await pool.query(
      "INSERT INTO call_user_locks (user_id, call_id) VALUES ($1, $3), ($2, $3)",
      [callerId, calleeAId, callAId],
    );
    const results = await Promise.all([
      applyCallControlOperation({
        callId: callAId,
        actorUserId: callerId,
        action: "end",
        operationId: "00000000-0000-4000-8000-00000000cc02",
      }),
      applyCallControlOperation({
        callId: callAId,
        actorUserId: calleeAId,
        action: "failed",
        operationId: "00000000-0000-4000-8000-00000000cc03",
      }),
    ]);
    expect(results.filter((result) => result.transitioned)).toHaveLength(1);
    expect(["ended", "failed"]).toContain(results[0].call.status);
    const locks = await pool.query("SELECT 1 FROM call_user_locks WHERE call_id = $1", [callAId]);
    expect(locks.rows).toHaveLength(0);
  });

  it("repairs a missing call card once after the call row already committed", async () => {
    await pool.query(
      "INSERT INTO character_profiles (id, owner_user_id, type, handle, display_name) VALUES ($1, $2, 'fan', 'call-repair-test', 'caller')",
      [callerProfileId, callerId],
    );
    await pool.query(
      "INSERT INTO chat_rooms (id, type, owner_id) VALUES ($1, 'direct', $2)",
      [roomId, callerId],
    );
    await pool.query(
      "INSERT INTO chat_room_members (room_id, user_id, profile_id) VALUES ($1, $2, $4), ($1, $3, NULL)",
      [roomId, callerId, calleeAId, callerProfileId],
    );
    await pool.query(
      `INSERT INTO calls
       (id, room_name, caller_id, caller_profile_id, callee_id, chat_room_id, status, accepted_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ended', now() - interval '2 minutes', now())`,
      [callAId, `call-card-repair-${Date.now()}`, callerId, callerProfileId, calleeAId, roomId],
    );
    const { rows: calls } = await pool.query("SELECT * FROM calls WHERE id = $1", [callAId]);

    const [first, replay] = await Promise.all([
      ensureCallMessage(calls[0]),
      ensureCallMessage(calls[0]),
    ]);
    expect([first, replay].filter(Boolean)).toHaveLength(1);
    const { rows: messages } = await pool.query<{ content: string }>(
      "SELECT content FROM messages WHERE call_id = $1",
      [callAId],
    );
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0].content)).toMatchObject({ callId: callAId, status: "ended" });
    const marker = await pool.query<{ created: boolean }>(
      "SELECT call_message_created_at IS NOT NULL AS created FROM calls WHERE id = $1",
      [callAId],
    );
    expect(marker.rows[0].created).toBe(true);
  });

  it("does not manufacture historical call cards unless the creating app marked them repair-eligible", async () => {
    await pool.query(
      "INSERT INTO character_profiles (id, owner_user_id, type, handle, display_name) VALUES ($1, $2, 'fan', 'call-repair-cutoff', 'caller')",
      [callerProfileId, callerId],
    );
    await pool.query(
      "INSERT INTO chat_rooms (id, type, owner_id) VALUES ($1, 'direct', $2)",
      [roomId, callerId],
    );
    await pool.query(
      "INSERT INTO chat_room_members (room_id, user_id, profile_id) VALUES ($1, $2, $4), ($1, $3, NULL)",
      [roomId, callerId, calleeAId, callerProfileId],
    );
    await pool.query(
      `INSERT INTO calls
       (id, room_name, caller_id, caller_profile_id, callee_id, chat_room_id, status, accepted_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ended', now() - interval '30 days', now() - interval '30 days')`,
      [callAId, `call-card-history-${Date.now()}`, callerId, callerProfileId, calleeAId, roomId],
    );

    await processCallLifecycleBatch();
    let messages = await pool.query("SELECT 1 FROM messages WHERE call_id = $1", [callAId]);
    expect(messages.rows).toHaveLength(0);

    await pool.query("UPDATE calls SET call_message_repair_eligible_at = now() WHERE id = $1", [callAId]);
    await processCallLifecycleBatch();
    messages = await pool.query("SELECT 1 FROM messages WHERE call_id = $1", [callAId]);
    expect(messages.rows).toHaveLength(1);
  });
});
