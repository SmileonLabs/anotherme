import { describe, expect, it } from "vitest";
import {
  classifyLiveKitRoomLookupError,
  decideCallPresence,
  type CallPresencePolicy,
} from "./callReconciliation";

const policy: CallPresencePolicy = {
  initialConnectionGraceMs: 10_000,
  emptyRoomGraceMs: 20_000,
  singleParticipantGraceMs: 40_000,
};
const acceptedAt = new Date("2026-09-06T00:00:00.000Z");

describe("call presence reconciliation", () => {
  it("distinguishes a missing room from transient LiveKit failures", () => {
    expect(classifyLiveKitRoomLookupError({ code: 5 })).toBe("missing");
    expect(classifyLiveKitRoomLookupError({ code: "not_found" })).toBe("missing");
    expect(classifyLiveKitRoomLookupError({ status: 404 })).toBe("missing");
    expect(classifyLiveKitRoomLookupError(new Error("room not found"))).toBe("missing");
    expect(classifyLiveKitRoomLookupError({ status: 429 })).toBe("retry");
    expect(classifyLiveKitRoomLookupError({ status: 503 })).toBe("retry");
    expect(classifyLiveKitRoomLookupError(new Error("request timed out"))).toBe("retry");
  });
  it("never terminates during the initial connection grace", () => {
    const observedAt = new Date("2026-09-06T00:00:05.000Z");
    expect(decideCallPresence({
      acceptedAt,
      observedAt,
      expectedParticipantCount: 0,
      previousParticipantCount: 0,
      previousDeficitSince: new Date("2026-09-06T00:00:00.000Z"),
      policy,
    })).toMatchObject({ shouldTerminate: false, reason: "initial-grace" });
  });

  it("requires repeated authoritative empty-room observations across the grace", () => {
    const first = decideCallPresence({
      acceptedAt,
      observedAt: new Date("2026-09-06T00:00:15.000Z"),
      expectedParticipantCount: 0,
      previousParticipantCount: null,
      previousDeficitSince: null,
      policy,
    });
    expect(first).toMatchObject({ shouldTerminate: false, reason: "empty-grace" });

    expect(decideCallPresence({
      acceptedAt,
      observedAt: new Date("2026-09-06T00:00:36.000Z"),
      expectedParticipantCount: 0,
      previousParticipantCount: first.participantCount,
      previousDeficitSince: first.deficitSince,
      policy,
    })).toMatchObject({ shouldTerminate: true, reason: "stale-room" });
  });

  it("does not overlap initial connection and empty-room grace windows", () => {
    const duringInitial = decideCallPresence({
      acceptedAt,
      observedAt: new Date("2026-09-06T00:00:01.000Z"),
      expectedParticipantCount: 0,
      previousParticipantCount: null,
      previousDeficitSince: null,
      policy,
    });
    const afterInitial = decideCallPresence({
      acceptedAt,
      observedAt: new Date("2026-09-06T00:00:25.000Z"),
      expectedParticipantCount: 0,
      previousParticipantCount: 0,
      previousDeficitSince: duringInitial.deficitSince,
      policy,
    });
    expect(afterInitial.shouldTerminate).toBe(false);
    expect(afterInitial.deficitSince).toEqual(new Date("2026-09-06T00:00:10.000Z"));
    expect(decideCallPresence({
      acceptedAt,
      observedAt: new Date("2026-09-06T00:00:31.000Z"),
      expectedParticipantCount: 0,
      previousParticipantCount: 0,
      previousDeficitSince: afterInitial.deficitSince,
      policy,
    }).shouldTerminate).toBe(true);
  });

  it("resets the grace when a participant joins and clears it when both are present", () => {
    const observedAt = new Date("2026-09-06T00:00:50.000Z");
    const one = decideCallPresence({
      acceptedAt,
      observedAt,
      expectedParticipantCount: 1,
      previousParticipantCount: 0,
      previousDeficitSince: new Date("2026-09-06T00:00:10.000Z"),
      policy,
    });
    expect(one).toMatchObject({ shouldTerminate: false, reason: "single-participant-grace" });
    expect(one.deficitSince).toEqual(observedAt);

    expect(decideCallPresence({
      acceptedAt,
      observedAt,
      expectedParticipantCount: 2,
      previousParticipantCount: 1,
      previousDeficitSince: one.deficitSince,
      policy,
    })).toMatchObject({ shouldTerminate: false, deficitSince: null, reason: "healthy" });
  });

  it("does not use heartbeat absence as evidence", () => {
    const decision = decideCallPresence({
      acceptedAt,
      observedAt: new Date("2026-09-06T01:00:00.000Z"),
      expectedParticipantCount: 2,
      previousParticipantCount: 0,
      previousDeficitSince: acceptedAt,
      policy,
    });
    expect(decision).toMatchObject({ shouldTerminate: false, reason: "healthy" });
  });
});
