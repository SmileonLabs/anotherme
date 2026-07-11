import { describe, expect, it } from "vitest";
import { callDurationSec, isTerminalCallStatus } from "./callLifecycle";

describe("call lifecycle", () => {
  it("recognizes immutable terminal states only", () => {
    for (const status of ["ended", "declined", "missed", "cancelled", "failed"]) {
      expect(isTerminalCallStatus(status)).toBe(true);
    }
    expect(isTerminalCallStatus("ringing")).toBe(false);
    expect(isTerminalCallStatus("active")).toBe(false);
  });

  it("calculates duration only after accept and never returns a negative value", () => {
    const acceptedAt = new Date("2026-07-07T00:00:00.000Z");
    expect(callDurationSec(acceptedAt, new Date("2026-07-07T00:00:31.600Z"))).toBe(32);
    expect(callDurationSec(acceptedAt, new Date("2026-07-06T23:59:59.000Z"))).toBe(0);
    expect(callDurationSec(null, new Date())).toBeNull();
    expect(callDurationSec(acceptedAt, null)).toBeNull();
  });
});
