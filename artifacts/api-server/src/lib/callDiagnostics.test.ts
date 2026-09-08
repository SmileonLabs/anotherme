import { describe, expect, it } from "vitest";
import {
  callDiagnosticPhaseSchema,
  callDiagnosticPlatformSchema,
  callDiagnosticRoleSchema,
  sanitizeCallDiagnosticDetails,
} from "./callDiagnostics";

describe("call diagnostic privacy boundary", () => {
  it("removes credentials, message content, SDP, candidates and URLs", () => {
    expect(sanitizeCallDiagnosticDetails({
      phaseDurationMs: 123,
      token: "secret",
      messageBody: "private conversation",
      localSdp: "v=0",
      iceCandidate: "candidate:...",
      endpointUrl: "https://private.example/path",
      participantIdentity: "private-user",
      userId: "private-user-id",
      roomName: "private-room",
      "private note alice@example.com": 1,
      disguised: "Bearer private-token",
      connectionState: "reconnecting",
    })).toEqual({ phaseDurationMs: 123, connectionState: "reconnecting" });
  });

  it("bounds key count, strings, arrays and rejects nested objects", () => {
    const details: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`metric${index}`, index]),
    );
    details.longValue = "x".repeat(500);
    const limited = sanitizeCallDiagnosticDetails(details)!;
    expect(Object.keys(limited)).toHaveLength(20);

    expect(sanitizeCallDiagnosticDetails({
      longValue: "x".repeat(500),
      states: Array.from({ length: 20 }, (_, index) => `state-${index}`),
      nested: { unsafe: "value" },
    })).toEqual({
      longValue: "x".repeat(200),
      states: Array.from({ length: 10 }, (_, index) => `state-${index}`),
    });
  });

  it("accepts lifecycle identifiers but rejects free-form text in log labels", () => {
    expect(callDiagnosticPhaseSchema.safeParse("livekit.reconnect_started:1").success).toBe(true);
    expect(callDiagnosticPlatformSchema.safeParse("ios").success).toBe(true);
    expect(callDiagnosticRoleSchema.safeParse("join-card").success).toBe(true);
    for (const unsafe of ["private message", "user@example.com", "line\nbreak", "한글 본문"]) {
      expect(callDiagnosticPhaseSchema.safeParse(unsafe).success).toBe(false);
    }
  });
});
