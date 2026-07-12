import { describe, expect, it } from "vitest";
import { TrackSource } from "livekit-server-sdk";
import {
  CALL_TOKEN_TTL_SECONDS,
  callTokenGrant,
  callDurationSec,
  isLiveCallStatus,
  isTerminalCallStatus,
  publishSourcesForCallMedia,
} from "./callLifecycle";

describe("call lifecycle", () => {
  it("recognizes immutable terminal states only", () => {
    for (const status of ["ended", "declined", "missed", "cancelled", "failed"]) {
      expect(isTerminalCallStatus(status)).toBe(true);
    }
    expect(isTerminalCallStatus("ringing")).toBe(false);
    expect(isTerminalCallStatus("active")).toBe(false);
    expect(isLiveCallStatus("ringing")).toBe(true);
    expect(isLiveCallStatus("active")).toBe(true);
    expect(isLiveCallStatus("ended")).toBe(false);
  });

  it("uses a short token lifetime and limits media publishing to the call type", () => {
    expect(CALL_TOKEN_TTL_SECONDS).toBe(120);
    expect(publishSourcesForCallMedia("audio")).toEqual([TrackSource.MICROPHONE]);
    expect(publishSourcesForCallMedia("video")).toEqual([TrackSource.MICROPHONE, TrackSource.CAMERA]);
    expect(callTokenGrant("call", "audio", true)).toMatchObject({
      canPublish: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE],
    });
    const ringingGrant = callTokenGrant("call", "video", false);
    expect(ringingGrant).toMatchObject({
      canPublish: false,
      canPublishData: false,
    });
    expect(ringingGrant.canPublishSources).toBeUndefined();
  });

  it("calculates duration only after accept and never returns a negative value", () => {
    const acceptedAt = new Date("2026-07-07T00:00:00.000Z");
    expect(callDurationSec(acceptedAt, new Date("2026-07-07T00:00:31.600Z"))).toBe(32);
    expect(callDurationSec(acceptedAt, new Date("2026-07-06T23:59:59.000Z"))).toBe(0);
    expect(callDurationSec(null, new Date())).toBeNull();
    expect(callDurationSec(acceptedAt, null)).toBeNull();
  });
});
