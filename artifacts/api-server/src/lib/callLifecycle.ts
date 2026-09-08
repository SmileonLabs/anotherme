import { TrackSource, type VideoGrant } from "livekit-server-sdk";

export type CallMedia = "audio" | "video";

export const CALL_TOKEN_TTL_SECONDS = 120;

export const terminalCallStatuses = ["ended", "declined", "missed", "cancelled", "failed"] as const;

export type TerminalCallStatus = (typeof terminalCallStatuses)[number];

export function isTerminalCallStatus(status: string): status is TerminalCallStatus {
  return (
    status === "ended" ||
    status === "declined" ||
    status === "missed" ||
    status === "cancelled" ||
    status === "failed"
  );
}

export function isLiveCallStatus(status: string): status is "ringing" | "active" {
  return status === "ringing" || status === "active";
}

export function publishSourcesForCallMedia(media: CallMedia): TrackSource[] {
  return media === "video"
    ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
    : [TrackSource.MICROPHONE];
}

export function callTokenGrant(room: string, media: CallMedia, canPublish: boolean): VideoGrant {
  return {
    roomJoin: true,
    room,
    canPublish,
    canSubscribe: true,
    canPublishData: false,
    ...(canPublish ? { canPublishSources: publishSourcesForCallMedia(media) } : {}),
  };
}

export function callDurationSec(acceptedAt: Date | null | undefined, endedAt: Date | null | undefined): number | null {
  if (!acceptedAt || !endedAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - acceptedAt.getTime()) / 1000));
}
