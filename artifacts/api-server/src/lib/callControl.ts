import { and, eq, inArray } from "drizzle-orm";
import {
  callControlOperationsTable,
  callUserLocksTable,
  callsTable,
  db,
  type Call,
  type CallControlOperation,
} from "@workspace/db";
import {
  isLiveCallStatus,
  isTerminalCallStatus,
  type TerminalCallStatus,
} from "./callLifecycle";

export type CallControlAction = "end" | "cancel" | "decline" | "failed";

export class CallControlAccessError extends Error {
  constructor() {
    super("Call not found");
    this.name = "CallControlAccessError";
  }
}

export class CallOperationConflictError extends Error {
  constructor() {
    super("Idempotency key was already used for another call operation");
    this.name = "CallOperationConflictError";
  }
}

export class CallAttemptConflictError extends Error {
  constructor() {
    super("Call attempt identifier does not match this call");
    this.name = "CallAttemptConflictError";
  }
}

export type CallControlResult = {
  call: Call;
  transitioned: boolean;
  replayed: boolean;
};

export function callControlOperationMatches(
  existing: Pick<CallControlOperation, "callId" | "actorUserId" | "attemptId" | "action">,
  requested: {
    callId: string;
    actorUserId: string;
    attemptId?: string;
    action: CallControlAction;
  },
): boolean {
  return (
    existing.callId === requested.callId &&
    existing.actorUserId === requested.actorUserId &&
    existing.attemptId === (requested.attemptId ?? null) &&
    existing.action === requested.action
  );
}

/**
 * Rows created before attempt IDs were introduced remain callable. Once a call
 * has a durable attempt ID, any supplied generation ID must match it exactly.
 * A missing header is accepted only for calls created before the configured
 * rollout cutoff (or while operators intentionally leave the cutoff unset).
 */
export function callAttemptMatches(
  call: Pick<Call, "attemptId" | "createdAt">,
  requestedAttemptId?: string,
  enforceHeaderAfter?: Date | null,
): boolean {
  if (!call.attemptId) return true;
  if (requestedAttemptId) return call.attemptId === requestedAttemptId;
  return !enforceHeaderAfter || call.createdAt < enforceHeaderAfter;
}

function actorCanPerform(call: Call, actorUserId: string, action: CallControlAction): boolean {
  if (action === "cancel") return call.callerId === actorUserId;
  if (action === "decline") return call.calleeId === actorUserId;
  return call.callerId === actorUserId || call.calleeId === actorUserId;
}

/**
 * Resolve a terminal target without mutating a call. Terminal calls are immutable,
 * and cancel/decline never convert a call that already became active.
 */
export function terminalStatusForControl(
  call: Pick<Call, "status" | "callerId">,
  actorUserId: string,
  action: CallControlAction,
): TerminalCallStatus | null {
  if (isTerminalCallStatus(call.status)) return null;
  if (action === "cancel") return call.status === "ringing" ? "cancelled" : null;
  if (action === "decline") return call.status === "ringing" ? "declined" : null;
  if (action === "failed") return isLiveCallStatus(call.status) ? "failed" : null;
  if (!isLiveCallStatus(call.status)) return null;
  return call.status === "ringing" && call.callerId === actorUserId ? "cancelled" : "ended";
}

function terminalUpdate(status: TerminalCallStatus, now: Date) {
  const repair = { terminalMessageRepairEligibleAt: now };
  if (status === "declined") return { ...repair, status, declinedAt: now, endedAt: now };
  if (status === "missed") return { ...repair, status, missedAt: now, endedAt: now };
  if (status === "cancelled") return { ...repair, status, cancelledAt: now, endedAt: now };
  return { ...repair, status, endedAt: now };
}

/**
 * Worker-only transition. The status compare-and-set and call-specific lock
 * release share one transaction, so a delayed transition for call A cannot
 * release user locks now owned by call B.
 */
export async function transitionCallToTerminal(
  callId: string,
  fromStatuses: readonly ("ringing" | "active")[],
  status: TerminalCallStatus,
  options?: { reconciliationClaimedAt?: Date },
): Promise<Call | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(callsTable)
      .set(terminalUpdate(status, now))
      .where(
        and(
          eq(callsTable.id, callId),
          inArray(callsTable.status, [...fromStatuses]),
          ...(options?.reconciliationClaimedAt
            ? [eq(callsTable.livekitReconciliationClaimedAt, options.reconciliationClaimedAt)]
            : []),
        ),
      )
      .returning();
    if (updated) {
      await tx.delete(callUserLocksTable).where(eq(callUserLocksTable.callId, updated.id));
    }
    return updated;
  });
}

/**
 * Applies a client terminal operation exactly once when an operation UUID is
 * supplied. The durable operation claim, guarded state transition and lock
 * release commit atomically. Retrying the same UUID is a read-only replay.
 */
export async function applyCallControlOperation(args: {
  callId: string;
  actorUserId: string;
  action: CallControlAction;
  operationId?: string;
  attemptId?: string;
  enforceAttemptHeaderAfter?: Date | null;
}): Promise<CallControlResult> {
  return db.transaction(async (tx) => {
    const [call] = await tx
      .select()
      .from(callsTable)
      .where(eq(callsTable.id, args.callId))
      .for("update");
    if (!call || !actorCanPerform(call, args.actorUserId, args.action)) {
      throw new CallControlAccessError();
    }
    if (!callAttemptMatches(call, args.attemptId, args.enforceAttemptHeaderAfter)) {
      throw new CallAttemptConflictError();
    }

    if (args.operationId) {
      const [existing] = await tx
        .select()
        .from(callControlOperationsTable)
        .where(eq(callControlOperationsTable.operationId, args.operationId));
      if (existing) {
        if (!callControlOperationMatches(existing, args)) {
          throw new CallOperationConflictError();
        }
        return { call, transitioned: false, replayed: true };
      }
    }

    const target = terminalStatusForControl(call, args.actorUserId, args.action);
    // A terminal call is already idempotent by state. Likewise cancel/decline
    // against an active call is a no-op. Do not create an unbounded durable row
    // for every fresh UUID sent after the transition has already completed.
    if (!target || !isLiveCallStatus(call.status)) {
      return { call, transitioned: false, replayed: false };
    }

    if (args.operationId) {
      const [claimed] = await tx
        .insert(callControlOperationsTable)
        .values({
          operationId: args.operationId,
          callId: args.callId,
          actorUserId: args.actorUserId,
          attemptId: args.attemptId,
          action: args.action,
        })
        .onConflictDoNothing({ target: callControlOperationsTable.operationId })
        .returning({ operationId: callControlOperationsTable.operationId });

      if (!claimed) {
        const [existing] = await tx
          .select()
          .from(callControlOperationsTable)
          .where(eq(callControlOperationsTable.operationId, args.operationId));
        if (!existing || !callControlOperationMatches(existing, args)) {
          throw new CallOperationConflictError();
        }
        return { call, transitioned: false, replayed: true };
      }
    }
    let result = call;
    let transitioned = false;
    if (isLiveCallStatus(call.status)) {
      const [updated] = await tx
        .update(callsTable)
        .set(terminalUpdate(target, new Date()))
        .where(and(eq(callsTable.id, call.id), eq(callsTable.status, call.status)))
        .returning();
      if (updated) {
        // This call-id fence is deliberately stronger than deleting by user id.
        // A late operation for A can never remove locks inserted for B.
        await tx.delete(callUserLocksTable).where(eq(callUserLocksTable.callId, updated.id));
        result = updated;
        transitioned = true;
      } else {
        const [current] = await tx.select().from(callsTable).where(eq(callsTable.id, call.id));
        if (current) result = current;
      }
    }

    if (args.operationId) {
      await tx
        .update(callControlOperationsTable)
        .set({ resultStatus: result.status })
        .where(eq(callControlOperationsTable.operationId, args.operationId));
    }
    return { call: result, transitioned, replayed: false };
  });
}
