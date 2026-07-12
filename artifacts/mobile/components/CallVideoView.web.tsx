import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  RoomEvent,
  Track,
  type LocalVideoTrack,
  type RemoteVideoTrack,
  type Room,
} from "livekit-client";
import { useColors } from "@/hooks/useColors";

type VideoTrackLike = LocalVideoTrack | RemoteVideoTrack;

export function CallVideoView({
  room,
  cameraOn,
}: {
  room: Room | null;
  cameraOn: boolean;
}) {
  const [tracks, setTracks] = useState(() => findVideoTracks(room));

  useEffect(() => {
    if (!room) {
      setTracks(findVideoTracks(null));
      return;
    }
    const update = () => setTracks(findVideoTracks(room));
    update();
    const events = [
      RoomEvent.TrackPublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackSubscriptionFailed,
      RoomEvent.TrackSubscriptionPermissionChanged,
      RoomEvent.TrackSubscriptionStatusChanged,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
    ];
    events.forEach((event) => room.on(event, update));
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      update();
      if (ticks >= 20) clearInterval(timer);
    }, 500);
    return () => {
      clearInterval(timer);
      events.forEach((event) => room.off(event, update));
    };
  }, [room]);

  return (
    <View style={styles.wrap}>
      {tracks.remote ? (
        <VideoElement track={tracks.remote} style={videoFillStyle} />
      ) : (
        <VideoPlaceholder label={room ? "상대방 영상을 기다리는 중..." : "영상 연결 중..."} />
      )}
      {cameraOn && tracks.local ? (
        <View style={styles.localPreview}>
          <VideoElement track={tracks.local} muted mirror style={videoFillStyle} />
        </View>
      ) : null}
    </View>
  );
}

function findVideoTracks(room: Room | null): { local: VideoTrackLike | null; remote: VideoTrackLike | null } {
  if (!room) return { local: null, remote: null };
  const local = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack ?? null;
  let remote: VideoTrackLike | null = null;
  for (const participant of room.remoteParticipants.values()) {
    const track = participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (track) {
      remote = track;
      break;
    }
  }
  return { local, remote };
}

function VideoElement({
  track,
  muted = false,
  mirror = false,
  style,
}: {
  track: VideoTrackLike;
  muted?: boolean;
  mirror?: boolean;
  style: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.autoplay = true;
    el.playsInline = true;
    el.muted = muted;
    track.attach(el);
    void el.play().catch(() => {});
    return () => {
      track.detach(el);
    };
  }, [muted, track]);

  return (
    <video
      ref={ref}
      style={{ ...style, transform: mirror ? "scaleX(-1)" : undefined }}
    />
  );
}

function VideoPlaceholder({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.placeholder, { backgroundColor: colors.muted }]}>
      <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const videoFillStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#050505",
  },
  localPreview: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 108,
    height: 152,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "#111",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  placeholderText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
