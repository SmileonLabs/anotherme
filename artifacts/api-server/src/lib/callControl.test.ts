import { beforeAll, describe, expect, it } from "vitest";
import type { Call } from "@workspace/db";

process.env.DATABASE_URL ??= "postgres://anotherme:test@127.0.0.1:5432/anotherme";

let terminalStatusForControl: typeof import("./callControl").terminalStatusForControl;
let callControlOperationMatches: typeof import("./callControl").callControlOperationMatches;
let callAttemptMatches: typeof import("./callControl").callAttemptMatches;

beforeAll(async () => {
  ({ terminalStatusForControl, callControlOperationMatches, callAttemptMatches } = await import("./callControl"));
});

function call(status: string, callerId = "caller"): Pick<Call, "status" | "callerId"> {
  return { status, callerId };
}

describe("call control policy", () => {
  it("keeps every terminal state immutable", () => {
    for (const status of ["ended", "declined", "missed", "cancelled", "failed"]) {
      expect(terminalStatusForControl(call(status), "caller", "failed")).toBeNull();
      expect(terminalStatusForControl(call(status), "caller", "end")).toBeNull();
    }
  });

  it("does not let a late cancel or decline terminate an accepted call", () => {
    expect(terminalStatusForControl(call("active"), "caller", "cancel")).toBeNull();
    expect(terminalStatusForControl(call("active"), "callee", "decline")).toBeNull();
    expect(terminalStatusForControl(call("active"), "caller", "end")).toBe("ended");
  });

  it("classifies caller hangup while ringing as cancellation", () => {
    expect(terminalStatusForControl(call("ringing"), "caller", "end")).toBe("cancelled");
    expect(terminalStatusForControl(call("ringing"), "callee", "decline")).toBe("declined");
  });

  it("accepts only an exact call operation replay", () => {
    const existing = {
      callId: "call-a",
      actorUserId: "caller",
      attemptId: "attempt-a",
      action: "end",
    } as const;
    expect(callControlOperationMatches(existing, existing)).toBe(true);
    expect(callControlOperationMatches(existing, { ...existing, callId: "call-b" })).toBe(false);
    expect(callControlOperationMatches(existing, { ...existing, attemptId: "attempt-b" })).toBe(false);
    expect(callControlOperationMatches(existing, { ...existing, action: "failed" })).toBe(false);
  });

  it("always fences a supplied mismatched attempt ID", () => {
    const tracked = { attemptId: "attempt-b", createdAt: new Date("2026-09-02T00:00:00Z") };
    expect(callAttemptMatches(tracked, "attempt-b")).toBe(true);
    expect(callAttemptMatches(tracked, "attempt-a")).toBe(false);
  });

  it("bounds missing-header compatibility by the configured call creation cutoff", () => {
    const cutoff = new Date("2026-09-01T00:00:00Z");
    expect(callAttemptMatches(
      { attemptId: "attempt-b", createdAt: new Date("2026-08-31T23:59:59Z") },
      undefined,
      cutoff,
    )).toBe(true);
    expect(callAttemptMatches(
      { attemptId: "attempt-b", createdAt: cutoff },
      undefined,
      cutoff,
    )).toBe(false);
  });

  it("keeps pre-attempt legacy rows callable", () => {
    expect(callAttemptMatches(
      { attemptId: null, createdAt: new Date("2026-09-02T00:00:00Z") },
      "legacy-client-attempt",
      new Date("2026-09-01T00:00:00Z"),
    )).toBe(true);
  });
});
