export const INITIAL_REMOTE_AUDIO_OBSERVE_MS = 30_000;
export const CALL_STATUS_CONFIRM_DELAYS_MS = [0, 1_500, 4_000] as const;
export const MAX_FINAL_REJOIN_ATTEMPTS = 1;

export type ConnectionRecoverySignal = "reconnecting" | "disconnected" | null;

export function connectionRecoverySignal(state: unknown): ConnectionRecoverySignal {
  const normalized = String(state ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (normalized === "reconnecting" || normalized === "signalreconnecting") {
    return "reconnecting";
  }
  return normalized === "disconnected" ? "disconnected" : null;
}

const NON_RECOVERABLE_REASON =
  /client.?initiated|duplicate.?identity|participant.?removed|room.?(deleted|closed)|user.?(unavailable|rejected)/i;

export interface CallMediaSnapshot {
  participantCount: number;
  localMicrophonePublished: boolean;
  localMicrophoneMuted: boolean;
  localMicrophoneLive: boolean;
  remoteMicrophonePublished: boolean;
  remoteMicrophoneSubscribed: boolean;
  remoteMicrophoneMuted: boolean;
  remoteMicrophoneLive: boolean;
  remoteCameraPublished: boolean;
  remoteCameraSubscribed: boolean;
  remoteCameraMuted: boolean;
  remoteCameraLive: boolean;
  playbackAllowed: boolean;
}

export type AudioPathState =
  | "local_microphone_missing"
  | "local_muted"
  | "waiting_for_participant"
  | "waiting_for_remote_microphone"
  | "remote_muted"
  | "waiting_for_audio_subscription"
  | "remote_audio_track_unavailable"
  | "playback_blocked"
  | "ready";

export type VideoPathState =
  | "not_requested"
  | "waiting_for_camera"
  | "remote_camera_off"
  | "waiting_for_video_subscription"
  | "remote_video_track_unavailable"
  | "ready";

export function classifyAudioPath(snapshot: CallMediaSnapshot): AudioPathState {
  if (!snapshot.localMicrophonePublished || !snapshot.localMicrophoneLive) {
    return "local_microphone_missing";
  }
  if (snapshot.localMicrophoneMuted) return "local_muted";
  if (snapshot.participantCount === 0) return "waiting_for_participant";
  if (!snapshot.remoteMicrophonePublished) return "waiting_for_remote_microphone";
  if (snapshot.remoteMicrophoneMuted) return "remote_muted";
  if (!snapshot.remoteMicrophoneSubscribed) return "waiting_for_audio_subscription";
  if (!snapshot.remoteMicrophoneLive) return "remote_audio_track_unavailable";
  if (!snapshot.playbackAllowed) return "playback_blocked";
  return "ready";
}

export function classifyVideoPath(
  snapshot: CallMediaSnapshot,
  videoRequested: boolean,
): VideoPathState {
  if (!videoRequested) return "not_requested";
  if (!snapshot.remoteCameraPublished) return "waiting_for_camera";
  if (snapshot.remoteCameraMuted) return "remote_camera_off";
  if (!snapshot.remoteCameraSubscribed) return "waiting_for_video_subscription";
  if (!snapshot.remoteCameraLive) return "remote_video_track_unavailable";
  return "ready";
}

export function shouldAttemptFinalRejoin(args: {
  expectedDisconnect: boolean;
  mode: string;
  serverStatus?: string | null;
  finalRejoinAttempts: number;
  disconnectReason?: unknown;
}): boolean {
  if (args.expectedDisconnect || args.mode !== "active") return false;
  if (args.serverStatus !== "active") return false;
  if (args.finalRejoinAttempts >= MAX_FINAL_REJOIN_ATTEMPTS) return false;
  const reason = args.disconnectReason == null ? "" : String(args.disconnectReason);
  return !NON_RECOVERABLE_REASON.test(reason);
}
