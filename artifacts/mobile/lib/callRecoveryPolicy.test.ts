// @ts-nocheck -- executed directly by Node's type-stripping test runner.
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAudioPath,
  classifyVideoPath,
  connectionRecoverySignal,
  shouldAttemptFinalRejoin,
  type CallMediaSnapshot,
} from "./callRecoveryPolicy.ts";

const ready: CallMediaSnapshot = {
  participantCount: 1,
  localMicrophonePublished: true,
  localMicrophoneMuted: false,
  localMicrophoneLive: true,
  remoteMicrophonePublished: true,
  remoteMicrophoneSubscribed: true,
  remoteMicrophoneMuted: false,
  remoteMicrophoneLive: true,
  remoteCameraPublished: true,
  remoteCameraSubscribed: true,
  remoteCameraMuted: false,
  remoteCameraLive: true,
  playbackAllowed: true,
};

test("camera readiness is independent from a usable audio path", () => {
  const cameraMissing = {
    ...ready,
    remoteCameraPublished: false,
    remoteCameraSubscribed: false,
    remoteCameraLive: false,
  };
  assert.equal(classifyAudioPath(cameraMissing), "ready");
  assert.equal(classifyVideoPath(cameraMissing, true), "waiting_for_camera");
});

test("muted and playback-blocked audio are distinguishable", () => {
  assert.equal(classifyAudioPath({ ...ready, localMicrophoneMuted: true }), "local_muted");
  assert.equal(
    classifyAudioPath({ ...ready, localMicrophoneLive: false }),
    "local_microphone_missing",
  );
  assert.equal(classifyAudioPath({ ...ready, remoteMicrophoneMuted: true }), "remote_muted");
  assert.equal(classifyAudioPath({ ...ready, playbackAllowed: false }), "playback_blocked");
});

test("final rejoin is fenced to one unexpected active-call attempt", () => {
  const base = {
    expectedDisconnect: false,
    mode: "active",
    serverStatus: "active",
    finalRejoinAttempts: 0,
  };
  assert.equal(shouldAttemptFinalRejoin(base), true);
  assert.equal(shouldAttemptFinalRejoin({ ...base, finalRejoinAttempts: 1 }), false);
  assert.equal(shouldAttemptFinalRejoin({ ...base, serverStatus: "ended" }), false);
  assert.equal(shouldAttemptFinalRejoin({ ...base, expectedDisconnect: true }), false);
  assert.equal(shouldAttemptFinalRejoin({ ...base, disconnectReason: "PARTICIPANT_REMOVED" }), false);
  assert.equal(shouldAttemptFinalRejoin({ ...base, disconnectReason: "CLIENT_INITIATED" }), false);
  assert.equal(shouldAttemptFinalRejoin({ ...base, disconnectReason: "ROOM_CLOSED" }), false);
  assert.equal(shouldAttemptFinalRejoin({ ...base, disconnectReason: "USER_REJECTED" }), false);
});

test("listener attachment bridges already-transitioned LiveKit room states", () => {
  assert.equal(connectionRecoverySignal("connected"), null);
  assert.equal(connectionRecoverySignal("reconnecting"), "reconnecting");
  assert.equal(connectionRecoverySignal("signalReconnecting"), "reconnecting");
  assert.equal(connectionRecoverySignal("disconnected"), "disconnected");
});
