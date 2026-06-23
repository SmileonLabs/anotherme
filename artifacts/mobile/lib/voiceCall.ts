// Native (iOS/Android) voice-call implementation backed by @livekit/react-native
// + @livekit/react-native-webrtc. Metro picks voiceCall.web.ts on web; this file
// is used on native builds (dev client / EAS APK — NOT Expo Go, which lacks the
// WebRTC native module). The exported surface mirrors voiceCall.web.ts exactly so
// CallProvider can stay platform-agnostic.

import {
  AudioSession,
  AndroidAudioTypePresets,
  registerGlobals,
} from "@livekit/react-native";
import { Room, RoomEvent } from "livekit-client";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

// Patch the global WebRTC objects (RTCPeerConnection, mediaDevices, …) onto the
// JS runtime so livekit-client's browser code paths work on React Native. Must
// run once, before any Room is constructed — module top-level guarantees that.
registerGlobals();

export const voiceCallSupported = true;

let room: Room | null = null;
let audioSessionActive = false;
let audioModeReady = false;

let ringbackPlayer: AudioPlayer | null = null;
let ringtonePlayer: AudioPlayer | null = null;

// Allow the ring/ringback tones to sound even when the phone's hardware silent
// switch is on — an incoming or outgoing call must be audible. Best-effort and
// idempotent; we don't block the call on it.
async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  audioModeReady = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
    });
  } catch {
    audioModeReady = false;
  }
}

function startLoop(asset: number): AudioPlayer | null {
  try {
    void ensureAudioMode();
    const player = createAudioPlayer(asset);
    player.loop = true;
    player.play();
    return player;
  } catch {
    return null;
  }
}

function stopLoop(player: AudioPlayer | null): null {
  if (player) {
    try {
      player.pause();
    } catch {}
    try {
      player.remove();
    } catch {}
  }
  return null;
}

export function primeAudioPlayback(): void {
  // No-op on native. Mobile browsers gate audio playback behind a user gesture
  // (the web build's primeAudioPlayback unlocks the AudioContext on that
  // gesture); native has no such autoplay restriction, so there is nothing to
  // unlock. Kept for interface parity with voiceCall.web.ts.
  void ensureAudioMode();
}

export function startRingback(): void {
  stopRingback();
  ringbackPlayer = startLoop(require("../assets/sounds/ringback.wav"));
}

export function stopRingback(): void {
  ringbackPlayer = stopLoop(ringbackPlayer);
}

export function startRingtone(): void {
  stopRingtone();
  ringtonePlayer = startLoop(require("../assets/sounds/ringtone.wav"));
}

export function stopRingtone(): void {
  ringtonePlayer = stopLoop(ringtonePlayer);
}

export async function joinCall(url: string, token: string): Promise<void> {
  await leaveCall();
  await ensureAudioMode();

  // Activate the native audio session (configures the OS audio category for
  // two-way voice and routing). Remote participant audio is then rendered
  // automatically by @livekit/react-native — no <audio> elements or Web Audio
  // gain graph like the web build needs.
  // Route the call to the EARPIECE (수신부) by default, like a normal phone
  // call held to the ear — NOT the loudspeaker. LiveKit's default Android
  // preferredOutputList auto-selects "speaker" before "earpiece", and the iOS
  // defaultOutput is also "speaker", so without this a 1:1 voice call would
  // blast out of the loudspeaker. A connected bluetooth/wired headset still
  // takes priority over the earpiece. Best-effort and isolated: if configuring
  // the route fails on some device we must STILL start the audio session below
  // (otherwise the call would have no audio at all), just with default routing.
  try {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ["bluetooth", "headset", "earpiece"],
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
      ios: { defaultOutput: "earpiece" },
    });
  } catch {}
  try {
    await AudioSession.startAudioSession();
    audioSessionActive = true;
  } catch {
    audioSessionActive = false;
  }

  const r = new Room({
    // A 1:1 voice call has no video; disable adaptive stream / dynacast which
    // only matter for video and add needless signaling.
    adaptiveStream: false,
    dynacast: false,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // If the room drops for good, release the audio session so the OS earpiece/mic
  // route is handed back instead of being held open.
  r.on(RoomEvent.Disconnected, () => {
    if (room === r) {
      void releaseAudioSession();
      room = null;
    }
  });

  await r.connect(url, token);
  await r.localParticipant.setMicrophoneEnabled(true);
  room = r;
}

export async function setMuted(muted: boolean): Promise<void> {
  if (room) {
    await room.localParticipant.setMicrophoneEnabled(!muted);
  }
}

async function releaseAudioSession(): Promise<void> {
  if (!audioSessionActive) return;
  audioSessionActive = false;
  try {
    await AudioSession.stopAudioSession();
  } catch {}
}

export async function leaveCall(): Promise<void> {
  const r = room;
  room = null;
  if (r) {
    try {
      await r.disconnect();
    } catch {}
  }
  await releaseAudioSession();
}
