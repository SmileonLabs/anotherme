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
import { Room, RoomEvent, Track, type LocalVideoTrack } from "livekit-client";
import { PermissionsAndroid, Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import {
  isCallForegroundServiceAvailable,
  startCallForegroundService,
  stopCallForegroundService,
} from "@/lib/callForegroundService";

// Patch the global WebRTC objects (RTCPeerConnection, mediaDevices, …) onto the
// JS runtime so livekit-client's browser code paths work on React Native. Must
// run once, before any Room is constructed — module top-level guarantees that.
registerGlobals();

export const voiceCallSupported = true;
export type CallMedia = "audio" | "video";
export type CallDiagnostic = (phase: string, details?: Record<string, unknown>) => void;
export interface CallJoinResult {
  room: Room;
  media: CallMedia;
  microphonePublished: boolean;
  cameraPublished: boolean;
}

type Diagnostic = CallDiagnostic | undefined;

let room: Room | null = null;
let audioSessionActive = false;
let audioModeReady = false;
let cameraFacingMode: "user" | "environment" = "user";
let videoPreparePromise: Promise<void> | null = null;

let ringbackPlayer: AudioPlayer | null = null;
let ringtonePlayer: AudioPlayer | null = null;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function localMicrophoneDetails(r: Room | null = room): Record<string, unknown> {
  const pub = r?.localParticipant.getTrackPublication(Track.Source.Microphone);
  const track = pub?.track?.mediaStreamTrack;
  return {
    audioSessionActive,
    connectionState: r?.state,
    hasMicrophonePublication: !!pub,
    hasMicrophoneTrack: !!pub?.track,
    microphoneEnabled: r?.localParticipant.isMicrophoneEnabled,
    microphoneMuted: pub?.isMuted,
    microphoneTrackMuted: track?.muted,
    microphoneTrackReadyState: track?.readyState,
  };
}

function publicationDetails(
  publication: { kind?: unknown; source?: unknown; trackSid?: unknown },
  participant: { identity?: unknown; isLocal?: boolean },
  r: Room,
): Record<string, unknown> {
  return {
    connectionState: r.state,
    participantIdentity: participant.identity,
    participantIsLocal: participant.isLocal,
    source: publication.source,
    trackKind: publication.kind,
    trackSid: publication.trackSid,
    ...localMicrophoneDetails(r),
  };
}

function microphoneNeedsRepublish(r: Room): boolean {
  if (!r.localParticipant.isMicrophoneEnabled) return false;
  const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone);
  const track = pub?.track?.mediaStreamTrack;
  return !pub?.track || !!pub.isMuted || track?.readyState === "ended";
}

function preferredAudioOutputs(media: CallMedia): ("speaker" | "earpiece" | "headset" | "bluetooth")[] {
  return media === "video"
    ? ["bluetooth", "headset", "speaker", "earpiece"]
    : ["bluetooth", "headset", "earpiece"];
}

async function configureNativeAudio(
  media: CallMedia,
  diagnostic: CallDiagnostic,
  phase: string,
): Promise<void> {
  const preferredOutputList = preferredAudioOutputs(media);
  try {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList,
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
      ios: { defaultOutput: media === "video" ? "speaker" : "earpiece" },
    });
    diagnostic(phase, { media, preferredOutputList });
  } catch (err) {
    diagnostic(`${phase}_failed`, { media, message: errorMessage(err), preferredOutputList });
  }
}

async function startNativeAudioSession(diagnostic: CallDiagnostic, phase: string): Promise<void> {
  try {
    await AudioSession.startAudioSession();
    audioSessionActive = true;
    diagnostic(phase, { audioSessionActive });
  } catch (err) {
    audioSessionActive = false;
    diagnostic(`${phase}_failed`, { message: errorMessage(err) });
    throw err;
  }
}

// Allow the ring/ringback tones to sound even when the phone's hardware silent
// switch is on — an incoming or outgoing call must be audible. Best-effort and
// idempotent; we don't block the call on it.
async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  audioModeReady = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
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

function cameraOptions() {
  return { facingMode: cameraFacingMode };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function prepareVideoCall(): Promise<void> {
  if (videoPreparePromise) return videoPreparePromise;
  videoPreparePromise = (async () => {
    if (Platform.OS !== "android") return;
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
    } catch {}
  })().finally(() => {
    videoPreparePromise = null;
  });
  return videoPreparePromise;
}

async function ensureAndroidCallPermissions(media: CallMedia): Promise<void> {
  if (Platform.OS !== "android") return;
  const permissions = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ...(media === "video" ? [PermissionsAndroid.PERMISSIONS.CAMERA] : []),
  ];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  const microphoneGranted =
    result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
  if (!microphoneGranted) throw new Error("microphone_permission_denied");
  if (
    media === "video" &&
    result[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED
  ) {
    throw new Error("camera_permission_denied");
  }
}

async function enableCameraWithRetry(r: Room): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await r.localParticipant.setCameraEnabled(true, cameraOptions());
      if (r.localParticipant.getTrackPublication(Track.Source.Camera)?.track) return true;
    } catch {}
    await delay(350 + attempt * 250);
  }
  return !!r.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
}

function hasLocalTrack(r: Room, source: Track.Source): boolean {
  return !!r.localParticipant.getTrackPublication(source)?.track;
}

export async function joinCall(
  url: string,
  token: string,
  options: { media?: CallMedia; onDiagnostic?: CallDiagnostic } = {},
): Promise<CallJoinResult> {
  await leaveCall();
  await ensureAudioMode();
  const media = options.media ?? "audio";
  const diagnostic = options.onDiagnostic ?? (() => {});
  cameraFacingMode = "user";
  diagnostic("native_join_start", { media, platform: Platform.OS });
  try {
    await ensureAndroidCallPermissions(media);
    diagnostic("native_permissions_granted", { media });
  } catch (err) {
    diagnostic("native_permissions_failed", { media, message: errorMessage(err) });
    throw err;
  }

  // Activate the native audio session (configures the OS audio category for
  // two-way voice and routing). Remote participant audio is then rendered
  // automatically by @livekit/react-native — no <audio> elements or Web Audio
  // gain graph like the web build needs.
  // Voice calls default to the phone earpiece; video calls default to speaker.
  // Connected bluetooth/wired headsets still take priority on both paths.
  await configureNativeAudio(media, diagnostic, "native_audio_configured");
  try {
    await startNativeAudioSession(diagnostic, "native_audio_session_started");
  } catch {
    throw new Error("audio_session_start_failed");
  }

  const r = new Room({
    adaptiveStream: media === "video",
    dynacast: media === "video",
    videoCaptureDefaults: {
      resolution: { width: 640, height: 360, frameRate: 15 },
    },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // If the room drops for good, release the audio session so the OS earpiece/mic
  // route is handed back instead of being held open.
  r.on(RoomEvent.Reconnecting, () => {
    diagnostic("native_room_reconnecting", { connectionState: r.state });
  });
  r.on(RoomEvent.Reconnected, () => {
    diagnostic("native_room_reconnected", { connectionState: r.state });
  });
  r.on(RoomEvent.TrackMuted, (publication, participant) => {
    diagnostic("native_track_muted", publicationDetails(publication, participant, r));
  });
  r.on(RoomEvent.TrackUnmuted, (publication, participant) => {
    diagnostic("native_track_unmuted", publicationDetails(publication, participant, r));
  });
  r.on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
    diagnostic("native_local_track_unpublished", publicationDetails(publication, participant, r));
  });
  r.on(RoomEvent.LocalAudioSilenceDetected, (publication) => {
    diagnostic("native_local_audio_silence_detected", {
      source: publication.source,
      trackKind: publication.kind,
      trackSid: publication.trackSid,
      ...localMicrophoneDetails(r),
    });
  });
  r.on(RoomEvent.Disconnected, (reason?: unknown) => {
    diagnostic("native_room_disconnected", {
      connectionState: r.state,
      reason: reason == null ? undefined : String(reason),
    });
    if (room === r) {
      void Promise.allSettled([releaseAudioSession(), stopCallForegroundService()]);
      room = null;
    }
  });

  try {
    diagnostic("native_foreground_service_ready", {
      available: isCallForegroundServiceAvailable(),
      media,
    });
    await startCallForegroundService(media);
    diagnostic("native_foreground_service_started", { media });
  } catch (err) {
    diagnostic("native_foreground_service_start_failed", { media, message: errorMessage(err) });
    await releaseAudioSession();
    throw err;
  }
  try {
    await r.connect(url, token);
  } catch (err) {
    diagnostic("native_room_connect_failed", { message: errorMessage(err) });
    await Promise.allSettled([r.disconnect(), releaseAudioSession(), stopCallForegroundService()]);
    throw err;
  }
  room = r;
  diagnostic("native_room_connected", { connectionState: r.state });
  try {
    await r.localParticipant.setMicrophoneEnabled(true);
  } catch (err) {
    diagnostic("native_microphone_publish_failed", { message: errorMessage(err) });
    throw err;
  }
  const microphonePublished = hasLocalTrack(r, Track.Source.Microphone);
  diagnostic("native_microphone_publish_result", { microphonePublished });
  let cameraPublished = false;
  if (media === "video") {
    cameraPublished = await enableCameraWithRetry(r);
    diagnostic("native_camera_publish_result", { cameraPublished });
  }
  return { room: r, media, microphonePublished, cameraPublished };
}

export async function ensureCallKeepAlive(
  media: CallMedia,
  reason: string,
  onDiagnostic: Diagnostic = () => {},
): Promise<void> {
  if (Platform.OS !== "android" || !room) return;
  const r = room;
  const diagnostic = onDiagnostic ?? (() => {});
  diagnostic("native_keepalive_start", { media, reason, ...localMicrophoneDetails(r) });
  try {
    await ensureAudioMode();
  } catch {}
  await configureNativeAudio(media, diagnostic, "native_audio_keepalive_configured");
  try {
    await startCallForegroundService(media);
    diagnostic("native_foreground_service_keepalive_started", {
      media,
      reason,
      ...localMicrophoneDetails(r),
    });
  } catch (err) {
    diagnostic("native_foreground_service_keepalive_failed", {
      media,
      reason,
      message: errorMessage(err),
      ...localMicrophoneDetails(r),
    });
  }
  try {
    await startNativeAudioSession(diagnostic, "native_audio_session_keepalive_started");
  } catch {
    return;
  }
  if (microphoneNeedsRepublish(r)) {
    try {
      await r.localParticipant.setMicrophoneEnabled(false);
      await r.localParticipant.setMicrophoneEnabled(true);
      diagnostic("native_microphone_keepalive_republished", {
        reason,
        ...localMicrophoneDetails(r),
      });
    } catch (err) {
      diagnostic("native_microphone_keepalive_republish_failed", {
        reason,
        message: errorMessage(err),
        ...localMicrophoneDetails(r),
      });
    }
  }
  diagnostic("native_keepalive_done", { media, reason, ...localMicrophoneDetails(r) });
}

export async function setMuted(muted: boolean): Promise<void> {
  if (room) {
    await room.localParticipant.setMicrophoneEnabled(!muted);
  }
}

export async function setCameraEnabled(enabled: boolean): Promise<boolean> {
  if (room) {
    if (enabled) {
      await prepareVideoCall();
      return enableCameraWithRetry(room);
    } else {
      await room.localParticipant.setCameraEnabled(false, cameraOptions());
      return true;
    }
  }
  return false;
}

export async function switchCamera(): Promise<"user" | "environment"> {
  cameraFacingMode = cameraFacingMode === "user" ? "environment" : "user";
  if (room) {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track) {
      await track.restartTrack(cameraOptions());
    } else {
      await prepareVideoCall();
      await enableCameraWithRetry(room);
    }
  }
  return cameraFacingMode;
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
  await Promise.allSettled([releaseAudioSession(), stopCallForegroundService()]);
}
