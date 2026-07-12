import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { RoomEvent, type Room } from "livekit-client";
import {
  useAcceptCall,
  useCancelCall,
  useCreateCall,
  useDeclineCall,
  useEndCall,
  getCall,
  useGetCall,
  useJoinCall,
  useListIncomingCalls,
  type Call,
  type CallWithCaller,
} from "@workspace/api-client-react";
import {
  ensureCallKeepAlive,
  joinCall,
  leaveCall,
  prepareVideoCall,
  primeAudioPlayback,
  setCameraEnabled,
  setMuted,
  switchCamera,
  startRingback,
  startRingtone,
  stopRingback,
  stopRingtone,
  type CallMedia,
  voiceCallSupported,
} from "@/lib/voiceCall";
import { cancelIncomingCallNotification } from "@/lib/callNotifications";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";
import { CallVideoView } from "@/components/CallVideoView";
import { markCallFailed, reportCallDiagnostic } from "@/lib/callApi";
import { crossAlert } from "@/lib/crossAlert";

type CallMode = "idle" | "outgoing" | "incoming" | "joining" | "active";

const RING_TIMEOUT_MS = 45_000;
const KEEPALIVE_MIN_INTERVAL_MS = 8000;
const DISCONNECT_GRACE_MS = 12_000;

function isTerminalCallStatus(status: string | null | undefined): boolean {
  return (
    status === "declined" ||
    status === "ended" ||
    status === "missed" ||
    status === "cancelled" ||
    status === "failed"
  );
}

interface CallContextValue {
  startCall: (
    calleeId: string,
    calleeName: string,
    roomId?: string,
    media?: CallMedia,
  ) => Promise<void>;
  joinFromCard: (callId: string, peerName: string, media?: CallMedia) => Promise<boolean>;
  declineFromCard: (callId: string) => Promise<boolean>;
  supported: boolean;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();

  return (
    <CallContext.Provider
      value={{
        startCall: async () => {},
        joinFromCard: async () => false,
        declineFromCard: async () => false,
        supported: voiceCallSupported,
      }}
    >
      {isSignedIn ? <CallManager>{children}</CallManager> : children}
    </CallContext.Provider>
  );
}

function CallManager({ children }: { children: React.ReactNode }) {
  const colors = useColors();

  const [mode, setMode] = useState<CallMode>("idle");
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incoming, setIncoming] = useState<CallWithCaller | null>(null);
  const [peerName, setPeerName] = useState("");
  const [muted, setMutedState] = useState(false);
  const [callMedia, setCallMedia] = useState<CallMedia>("audio");
  const [liveRoom, setLiveRoom] = useState<Room | null>(null);
  const [cameraOn, setCameraOnState] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cameraWantedRef = useRef(true);
  const expectedDisconnectRef = useRef(false);
  const disconnectHandlingRef = useRef(false);
  const joinedCallIdRef = useRef<string | null>(null);
  const mediaJoinCallIdRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const mediaAppStateRef = useRef(AppState.currentState);
  const lastKeepAliveAtRef = useRef(0);
  const disconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectGenerationRef = useRef(0);

  const createCall = useCreateCall();
  const acceptCall = useAcceptCall();
  const declineCall = useDeclineCall();
  const cancelCall = useCancelCall();
  const endCall = useEndCall();
  const joinCallMut = useJoinCall();

  // Realtime events drive incoming calls; this is a slow fallback for reconnect gaps.
  const { data: incomingList, refetch: refetchIncoming } = useListIncomingCalls();
  useEffect(() => {
    const t = setInterval(() => refetchIncoming(), 30000);
    return () => clearInterval(t);
  }, [refetchIncoming]);

  useEffect(() => {
    if (modeRef.current !== "idle") return;
    const next = incomingList?.[0];
    if (next) {
      setIncoming(next);
      setPeerName(next.caller.nickname);
      setCallMedia(next.media ?? "audio");
      setCameraOnState((next.media ?? "audio") === "video");
      cameraWantedRef.current = (next.media ?? "audio") === "video";
      setMode("incoming");
    }
  }, [incomingList]);

  // Poll the relevant call to detect remote accept/decline/end/expiry.
  // - outgoing/joining/active: watch our active call
  // - incoming: watch the ringing call so we can auto-dismiss if the caller hangs up
  const watchId =
    mode === "outgoing" || mode === "joining" || mode === "active"
      ? activeCall?.id ?? ""
      : mode === "incoming"
        ? incoming?.id ?? ""
        : "";
  const watchPollMs = mode === "active" ? 10000 : 2500;
  const { data: watched, refetch: refetchWatched } = useGetCall(watchId);
  useEffect(() => {
    if (!watchId) return;
    const t = setInterval(() => refetchWatched(), watchPollMs);
    return () => clearInterval(t);
  }, [watchId, watchPollMs, refetchWatched]);

  // Timers and realtime events can be paused while the app is backgrounded.
  // Refresh both the call currently on screen and incoming-call fallback data as
  // soon as Android/iOS wakes the app so terminal states do not linger in UI.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const previousState = appStateRef.current;
      appStateRef.current = state;
      if (previousState !== "active" && state === "active") {
        void refetchIncoming();
        if (watchId) void refetchWatched();
      }
    });
    return () => sub.remove();
  }, [refetchIncoming, refetchWatched, watchId]);

  const clearDisconnectGrace = useCallback(() => {
    disconnectGenerationRef.current += 1;
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }
    disconnectHandlingRef.current = false;
  }, []);

  const reset = useCallback(async () => {
    clearDisconnectGrace();
    expectedDisconnectRef.current = true;
    stopRingback();
    stopRingtone();
    await Promise.allSettled([leaveCall(), cancelIncomingCallNotification()]);
    joinedCallIdRef.current = null;
    mediaJoinCallIdRef.current = null;
    lastKeepAliveAtRef.current = 0;
    setMode("idle");
    setActiveCall(null);
    setIncoming(null);
    setPeerName("");
    setCallMedia("audio");
    setLiveRoom(null);
    setCameraOnState(true);
    cameraWantedRef.current = true;
    setMutedState(false);
    setConnecting(false);
    setTimeout(() => {
      expectedDisconnectRef.current = false;
    }, 1000);
  }, [clearDisconnectGrace]);

  // A signed-out/unmounted call manager must not leave the Android foreground
  // service running after its React owner disappears.
  useEffect(() => {
    return () => {
      clearDisconnectGrace();
      expectedDisconnectRef.current = true;
      stopRingback();
      stopRingtone();
      void Promise.allSettled([leaveCall(), cancelIncomingCallNotification()]);
    };
  }, [clearDisconnectGrace]);

  const diagnosticFor = useCallback(
    (callId: string, role: string) => (phase: string, details?: Record<string, unknown>) => {
      reportCallDiagnostic(callId, { phase, platform: Platform.OS, role, details });
    },
    [],
  );

  const validateJoinResult = useCallback(
    (
      result: Awaited<ReturnType<typeof joinCall>>,
      callId: string,
      role: string,
    ) => {
      reportCallDiagnostic(callId, {
        phase: "join_result",
        platform: Platform.OS,
        role,
        details: {
          media: result.media,
          microphonePublished: result.microphonePublished,
          cameraPublished: result.cameraPublished,
        },
      });
      if (!result.microphonePublished) throw new Error("microphone_publish_failed");
      if (result.media === "video" && !result.cameraPublished) {
        throw new Error("camera_publish_failed");
      }
    },
    [],
  );

  const failCallLocally = useCallback(
    async (callId: string | null, role: string, err: unknown) => {
      if (callId) {
        reportCallDiagnostic(callId, {
          phase: "join_failed",
          platform: Platform.OS,
          role,
          details: { message: err instanceof Error ? err.message : String(err) },
        });
        await markCallFailed(callId);
      }
      await reset();
      crossAlert("통화 연결 실패", "통화 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    },
    [reset],
  );

  // Ring the incoming ringtone (벨소리) while the incoming modal is up, and stop
  // it the moment we leave the incoming state (accept/decline/timeout/cancel).
  useEffect(() => {
    if (mode === "incoming") {
      startRingtone();
      return () => stopRingtone();
    }
  }, [mode]);

  // Local safety net for missed realtime/poll updates. The server remains
  // authoritative, but the phone should never keep ringing past its ring window.
  useEffect(() => {
    if (mode !== "incoming" || !incoming?.createdAt) return;
    const createdAt = new Date(incoming.createdAt).getTime();
    if (!Number.isFinite(createdAt)) return;
    const remaining = Math.max(0, RING_TIMEOUT_MS - (Date.now() - createdAt));
    const timer = setTimeout(() => {
      if (modeRef.current !== "incoming") return;
      stopRingtone();
      void cancelIncomingCallNotification();
      setIncoming(null);
      setMode("idle");
    }, remaining);
    return () => clearTimeout(timer);
  }, [mode, incoming?.createdAt]);

  const joinAcceptedOutgoing = useCallback(
    async (call: Call) => {
      if (joinedCallIdRef.current === call.id || mediaJoinCallIdRef.current === call.id) return;
      mediaJoinCallIdRef.current = call.id;
      stopRingback();
      const media = call.media ?? callMedia;
      const isCurrentJoin = () =>
        mediaJoinCallIdRef.current === call.id && modeRef.current !== "idle";
      setActiveCall(call);
      setCallMedia(media);
      setCameraOnState(media === "video");
      cameraWantedRef.current = media === "video";
      setMode("joining");
      setConnecting(true);
      let shouldMarkFailed = false;
      try {
        const session = await joinCallMut.mutateAsync({ id: call.id });
        shouldMarkFailed = true;
        if (!isCurrentJoin()) return;
        const joinedMedia = session.call.media ?? media;
        if (joinedMedia === "video") await prepareVideoCall().catch(() => {});
        if (!isCurrentJoin()) return;
        setActiveCall(session.call);
        setCallMedia(joinedMedia);
        setCameraOnState(joinedMedia === "video");
        cameraWantedRef.current = joinedMedia === "video";
        const joined = await joinCall(session.url, session.token, {
          media: joinedMedia,
          onDiagnostic: diagnosticFor(call.id, "caller"),
        });
        if (!isCurrentJoin()) {
          await leaveCall();
          return;
        }
        validateJoinResult(joined, call.id, "caller");
        joinedCallIdRef.current = call.id;
        setLiveRoom(joined.room);
        setConnecting(false);
        setMode("active");
      } catch (err) {
        if (mediaJoinCallIdRef.current !== call.id) return;
        if (shouldMarkFailed) await failCallLocally(call.id, "caller", err);
        else await reset();
      } finally {
        if (mediaJoinCallIdRef.current === call.id) mediaJoinCallIdRef.current = null;
      }
    },
    [callMedia, diagnosticFor, failCallLocally, joinCallMut, reset, validateJoinResult],
  );

  useEffect(() => {
    if (!watched) return;
    const ended = isTerminalCallStatus(watched.status);

    if (modeRef.current === "incoming") {
      // Caller cancelled/hung up, the call expired, or another device answered →
      // dismiss the modal and any full-screen notification on this device.
      if (ended || watched.status !== "ringing") {
        stopRingtone();
        void cancelIncomingCallNotification();
        setIncoming(null);
        setMode("idle");
      }
      return;
    }

    if (watched.status === "active" && modeRef.current === "outgoing") {
      // Callee answered — only now join media so the caller does not burn CPU or
      // hold camera/mic while the other side is still ringing.
      void joinAcceptedOutgoing(watched);
      return;
    }

    if (ended) {
      void reset();
    }
  }, [watched, joinAcceptedOutgoing, reset]);

  useEffect(() => {
    if (callMedia !== "video" || mode !== "active" || connecting || !liveRoom) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !cameraWantedRef.current) return;
      void setCameraEnabled(true)
        .then((ok) => setCameraOnState(ok))
        .catch(() => {});
    });
    return () => sub.remove();
  }, [callMedia, connecting, liveRoom, mode]);

  useEffect(() => {
    if (!activeCall?.id || !liveRoom || (mode !== "outgoing" && mode !== "active")) return;
    const callId = activeCall.id;
    const report = (phase: string, details?: Record<string, unknown>) => {
      reportCallDiagnostic(callId, {
        phase,
        platform: Platform.OS,
        role: mode === "outgoing" ? "caller" : "in-call",
        details,
      });
    };
    const connectionDetails = () => ({
      appState: AppState.currentState,
      callMode: modeRef.current,
      connectionState: liveRoom.state,
    });
    const onReconnecting = () => {
      setConnecting(true);
      report("livekit_reconnecting", connectionDetails());
    };
    const onReconnected = () => {
      clearDisconnectGrace();
      setConnecting(false);
      report("livekit_reconnected", connectionDetails());
    };
    const onDisconnected = (reason?: unknown) => {
      const expected = expectedDisconnectRef.current || modeRef.current === "idle";
      report("livekit_disconnected", {
        ...connectionDetails(),
        expected,
        reason: reason == null ? undefined : String(reason),
      });
      if (expected || disconnectHandlingRef.current) return;
      const currentMode = modeRef.current;
      if (currentMode !== "outgoing" && currentMode !== "active") return;
      disconnectHandlingRef.current = true;
      setConnecting(true);
      const generation = ++disconnectGenerationRef.current;
      report("livekit_disconnect_grace_started", {
        ...connectionDetails(),
        graceMs: DISCONNECT_GRACE_MS,
      });
      disconnectGraceTimerRef.current = setTimeout(() => {
        disconnectGraceTimerRef.current = null;
        void (async () => {
          let currentCall: Call | null = null;
          try {
            currentCall = await getCall(callId);
          } catch (err) {
            report("livekit_disconnect_grace_status_check_failed", {
              message: err instanceof Error ? err.message : String(err),
            });
          }
          if (
            generation !== disconnectGenerationRef.current ||
            expectedDisconnectRef.current ||
            modeRef.current === "idle"
          ) {
            return;
          }
          if (currentCall && isTerminalCallStatus(currentCall.status)) {
            report("livekit_disconnect_grace_terminal", { status: currentCall.status });
            await reset();
            return;
          }
          // A transient transport failure must not immediately fail the shared
          // server call. Only report failure after the reconnect window expires
          // and the authoritative status is still active.
          if (currentCall?.status === "active") {
            await markCallFailed(callId);
            report("livekit_disconnect_grace_expired", { status: currentCall.status });
          } else {
            report("livekit_disconnect_grace_expired_without_status", {
              status: currentCall?.status,
            });
          }
          await reset();
          crossAlert(
            "통화 연결 끊김",
            "잠금/백그라운드 전환 중 통화 연결이 끊겼습니다. 다시 걸어주세요.",
          );
        })().finally(() => {
          if (generation === disconnectGenerationRef.current) {
            disconnectHandlingRef.current = false;
          }
        });
      }, DISCONNECT_GRACE_MS);
    };
    liveRoom.on(RoomEvent.Reconnecting, onReconnecting);
    liveRoom.on(RoomEvent.Reconnected, onReconnected);
    liveRoom.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      liveRoom.off(RoomEvent.Reconnecting, onReconnecting);
      liveRoom.off(RoomEvent.Reconnected, onReconnected);
      liveRoom.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [activeCall?.id, clearDisconnectGrace, liveRoom, mode, reset]);

  useEffect(() => {
    if (!activeCall?.id || !liveRoom || mode !== "active") return;
    const callId = activeCall.id;
    const diagnostic = (phase: string, details?: Record<string, unknown>) => {
      reportCallDiagnostic(callId, {
        phase,
        platform: Platform.OS,
        role: "in-call",
        details,
      });
    };
    const sub = AppState.addEventListener("change", (state) => {
      const previousState = mediaAppStateRef.current;
      mediaAppStateRef.current = state;
      diagnostic("app_state_change", {
        previousState,
        state,
        callMode: modeRef.current,
        connectionState: liveRoom.state,
      });
      const returnedToForeground = previousState !== "active" && state === "active";
      const now = Date.now();
      if (
        Platform.OS === "android" &&
        returnedToForeground &&
        now - lastKeepAliveAtRef.current >= KEEPALIVE_MIN_INTERVAL_MS
      ) {
        lastKeepAliveAtRef.current = now;
        void ensureCallKeepAlive(callMedia, `app_state_${state}`, diagnostic);
      }
    });
    return () => sub.remove();
  }, [activeCall?.id, callMedia, liveRoom, mode]);

  const startCall = useCallback(
    async (calleeId: string, calleeName: string, roomId?: string, media: CallMedia = "audio") => {
      if (!voiceCallSupported) {
        return;
      }
      if (modeRef.current !== "idle") return;
      // Grab media-playback permission NOW, on the genuine button gesture —
      // the createCall await below would otherwise spend the activation before
      // joinCall() can pre-authorize audio, leaving the caller silent.
      primeAudioPlayback();
      // Ringback (통화 연결음) while we wait for the callee to answer. The button
      // gesture just unlocked the AudioContext, so this actually sounds.
      startRingback();
      setPeerName(calleeName);
      setCallMedia(media);
      setCameraOnState(media === "video");
      cameraWantedRef.current = media === "video";
      setMode("outgoing");
      setConnecting(true);
      try {
        const session = await createCall.mutateAsync({ data: { calleeId, roomId, media } });
        setActiveCall(session.call);
        setConnecting(false);
      } catch {
        await reset();
      }
    },
    [createCall, reset],
  );

  // Join an existing call from the in-chat call card. Either party may tap the
  // card; the callee joining a ringing call also accepts it (server-side).
  const joinFromCard = useCallback(
    async (callId: string, peer: string, media: CallMedia = "audio") => {
      if (!voiceCallSupported) return false;
      // Already in a call (outgoing/joining/active) → ignore. If a matching incoming
      // modal is up, clear it so we don't show both the modal and the overlay.
      if (
        modeRef.current === "outgoing" ||
        modeRef.current === "joining" ||
        modeRef.current === "active"
      ) {
        return true;
      }
      if (modeRef.current === "incoming") {
        setIncoming(null);
        void cancelIncomingCallNotification();
      }
      // Unlock audio on the card-tap gesture, before the join await.
      primeAudioPlayback();
      const videoReady = media === "video" ? prepareVideoCall() : Promise.resolve();
      setPeerName(peer);
      setCallMedia(media);
      setCameraOnState(media === "video");
      cameraWantedRef.current = media === "video";
      mediaJoinCallIdRef.current = callId;
      const isCurrentJoin = () =>
        mediaJoinCallIdRef.current === callId && modeRef.current !== "idle";
      setMode("joining");
      setConnecting(true);
      let shouldMarkFailed = false;
      try {
        const session = await joinCallMut.mutateAsync({ id: callId });
        shouldMarkFailed = true;
        if (!isCurrentJoin()) return false;
        const joinedMedia = session.call.media ?? media;
        await (
          joinedMedia === "video"
            ? media === "video"
              ? videoReady
              : prepareVideoCall()
            : Promise.resolve()
        ).catch(() => {});
        if (!isCurrentJoin()) return false;
        setActiveCall(session.call);
        setCallMedia(joinedMedia);
        setCameraOnState(joinedMedia === "video");
        cameraWantedRef.current = joinedMedia === "video";
        const joined = await joinCall(session.url, session.token, {
          media: joinedMedia,
          onDiagnostic: diagnosticFor(callId, "join-card"),
        });
        if (!isCurrentJoin()) {
          await leaveCall();
          return false;
        }
        validateJoinResult(joined, callId, "join-card");
        joinedCallIdRef.current = callId;
        setLiveRoom(joined.room);
        setConnecting(false);
        setMode("active");
        return true;
      } catch (err) {
        if (mediaJoinCallIdRef.current !== callId) return false;
        if (shouldMarkFailed) await failCallLocally(callId, "join-card", err);
        else await reset();
        return false;
      } finally {
        if (mediaJoinCallIdRef.current === callId) mediaJoinCallIdRef.current = null;
      }
    },
    [diagnosticFor, failCallLocally, joinCallMut, reset, validateJoinResult],
  );

  // Decline an incoming call straight from a notification action (no modal up).
  // Records the proper "declined" terminal state server-side instead of letting
  // the call ring out to "missed".
  const declineFromCard = useCallback(
    async (callId: string) => {
      if (modeRef.current === "incoming") {
        setIncoming(null);
        setMode("idle");
        void cancelIncomingCallNotification();
      }
      try {
        await declineCall.mutateAsync({ id: callId });
        return true;
      } catch {
        return false;
      }
    },
    [declineCall],
  );

  const handleAccept = useCallback(async () => {
    if (!incoming) return;
    const currentIncoming = incoming;
    // Unlock audio on the accept-button gesture, before the accept await.
    primeAudioPlayback();
    const initialMedia = currentIncoming.media ?? "audio";
    const videoReady = initialMedia === "video" ? prepareVideoCall() : Promise.resolve();
    setIncoming(null);
    setActiveCall(currentIncoming);
    setCallMedia(initialMedia);
    setCameraOnState(initialMedia === "video");
    cameraWantedRef.current = initialMedia === "video";
    stopRingtone();
    void cancelIncomingCallNotification();
    mediaJoinCallIdRef.current = currentIncoming.id;
    const isCurrentJoin = () =>
      mediaJoinCallIdRef.current === currentIncoming.id && modeRef.current !== "idle";
    setMode("joining");
    setConnecting(true);
    let shouldMarkFailed = false;
    try {
      const session = await acceptCall.mutateAsync({ id: currentIncoming.id });
      shouldMarkFailed = true;
      if (!isCurrentJoin()) return;
      const media = session.call.media ?? currentIncoming.media ?? "audio";
      await (
        media === "video"
          ? initialMedia === "video"
            ? videoReady
            : prepareVideoCall()
          : Promise.resolve()
      ).catch(() => {});
      if (!isCurrentJoin()) return;
      setActiveCall(session.call);
      setCallMedia(media);
      setCameraOnState(media === "video");
      cameraWantedRef.current = media === "video";
      const joined = await joinCall(session.url, session.token, {
        media,
        onDiagnostic: diagnosticFor(currentIncoming.id, "callee"),
      });
      if (!isCurrentJoin()) {
        await leaveCall();
        return;
      }
      validateJoinResult(joined, currentIncoming.id, "callee");
      joinedCallIdRef.current = currentIncoming.id;
      setLiveRoom(joined.room);
      setConnecting(false);
      setMode("active");
    } catch (err) {
      if (mediaJoinCallIdRef.current !== currentIncoming.id) return;
      if (shouldMarkFailed) await failCallLocally(currentIncoming.id, "callee", err);
      else await reset();
    } finally {
      if (mediaJoinCallIdRef.current === currentIncoming.id) mediaJoinCallIdRef.current = null;
    }
  }, [incoming, acceptCall, diagnosticFor, failCallLocally, reset, validateJoinResult]);

  const handleDecline = useCallback(async () => {
    const id = incoming?.id;
    setIncoming(null);
    setMode("idle");
    void cancelIncomingCallNotification();
    if (id) {
      try {
        await declineCall.mutateAsync({ id });
      } catch {}
    }
  }, [incoming, declineCall]);

  const handleEnd = useCallback(async () => {
    const id = activeCall?.id;
    // A caller hanging up while still ringing (callee never answered) is a
    // cancel, not an end — so it records as "cancelled" rather than a 0s call.
    const wasRinging = modeRef.current === "outgoing";
    await reset();
    if (id) {
      try {
        if (wasRinging) {
          await cancelCall.mutateAsync({ id });
        } else {
          await endCall.mutateAsync({ id });
        }
      } catch {}
    }
  }, [activeCall, cancelCall, endCall, reset]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    setMutedState(next);
    await setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(async () => {
    const next = !cameraOn;
    cameraWantedRef.current = next;
    setCameraOnState(next);
    try {
      if (next) await prepareVideoCall().catch(() => {});
      const ok = await setCameraEnabled(next);
      if (next && !ok) throw new Error("camera_toggle_failed");
    } catch {
      cameraWantedRef.current = !next;
      setCameraOnState(!next);
      if (activeCall?.id) {
        reportCallDiagnostic(activeCall.id, {
          phase: "camera_toggle_failed",
          platform: Platform.OS,
          role: "in-call",
          details: { requested: next },
        });
      }
    }
  }, [activeCall?.id, cameraOn]);

  const handleSwitchCamera = useCallback(async () => {
    if (!cameraOn) return;
    try {
      await switchCamera();
    } catch {}
  }, [cameraOn]);

  const visibleMedia = mode === "incoming" ? incoming?.media ?? callMedia : callMedia;
  const isVideoCall = visibleMedia === "video";
  const showWebCallHint = Platform.OS === "web" && mode === "active";

  return (
    <CallContext.Provider
      value={{ startCall, joinFromCard, declineFromCard, supported: voiceCallSupported }}
    >
      {children}

      {/* Incoming call modal */}
      <Modal visible={mode === "incoming"} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Avatar
              name={incoming?.caller.nickname ?? ""}
              uri={incoming?.caller.profileImageUrl ?? undefined}
              size={88}
            />
            <Text style={[styles.name, { color: colors.foreground }]}>{peerName}</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              {isVideoCall ? "영상통화 수신..." : "수신 전화..."}
            </Text>
            <View style={styles.actionRow}>
              <CallButton color="#E5484D" icon="phone-off" label="거절" onPress={handleDecline} />
              <CallButton
                color="#30A46C"
                icon={isVideoCall ? "video" : "phone"}
                label="수락"
                onPress={handleAccept}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Outgoing / active call overlay */}
      <Modal visible={mode === "outgoing" || mode === "joining" || mode === "active"} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.82)" }]}>
          {isVideoCall ? (
            <View style={styles.videoCallBody}>
              <CallVideoView room={liveRoom} cameraOn={cameraOn} />
              <View style={styles.videoHeaderText}>
                <Text style={[styles.name, styles.nameLight]}>{peerName}</Text>
                <Text style={styles.statusLight}>
                  {mode === "outgoing"
                    ? connecting
                      ? "통화 생성 중..."
                      : "영상통화 연결 중..."
                    : mode === "joining" || connecting
                      ? "영상통화 연결 중..."
                      : "영상통화 중"}
                </Text>
                {showWebCallHint && (
                  <Text style={styles.webCallHint}>웹/PWA는 화면을 내리면 마이크가 멈출 수 있어요.</Text>
                )}
                {connecting && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
              </View>
            </View>
          ) : (
            <View style={styles.callBody}>
              <Avatar name={peerName} size={104} />
              <Text style={[styles.name, styles.nameLight]}>{peerName}</Text>
              <Text style={styles.statusLight}>
                {mode === "outgoing"
                  ? connecting
                    ? "통화 생성 중..."
                    : "통화 연결 중..."
                  : mode === "joining" || connecting
                    ? "통화 연결 중..."
                    : "통화 중"}
              </Text>
              {showWebCallHint && (
                <Text style={styles.webCallHint}>웹/PWA는 화면을 내리면 마이크가 멈출 수 있어요.</Text>
              )}
              {connecting && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
            </View>
          )}
          <View style={styles.bottomControls}>
            {isVideoCall && (
              <>
                <CallButton
                  color={cameraOn ? "#3A3A3A" : "#7A7A7A"}
                  icon={cameraOn ? "video" : "video-off"}
                  label={cameraOn ? "카메라" : "꺼짐"}
                  onPress={toggleCamera}
                />
                <CallButton
                  color="#3A3A3A"
                  icon="rotate-cw"
                  label="전환"
                  onPress={handleSwitchCamera}
                />
              </>
            )}
            {mode === "active" && (
              <CallButton
                color={muted ? "#7A7A7A" : "#3A3A3A"}
                icon={muted ? "mic-off" : "mic"}
                label={muted ? "음소거됨" : "마이크"}
                onPress={toggleMute}
              />
            )}
            <CallButton color="#E5484D" icon="phone-off" label="종료" onPress={handleEnd} />
          </View>
        </View>
      </Modal>
    </CallContext.Provider>
  );
}

function CallButton({
  color,
  icon,
  label,
  onPress,
}: {
  color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.btnWrap} onPress={onPress}>
      {({ pressed }) => (
        <>
          <View style={[styles.btn, { backgroundColor: color, opacity: pressed ? 0.8 : 1 }]}>
            <Feather name={icon} size={26} color="#fff" />
          </View>
          <Text style={styles.btnLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  callBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  videoCallBody: {
    flex: 1,
    width: "100%",
    paddingTop: Platform.OS === "ios" ? 72 : 48,
    paddingBottom: 24,
  },
  videoHeaderText: {
    position: "absolute",
    top: Platform.OS === "ios" ? 82 : 58,
    left: 24,
    right: 24,
    alignItems: "center",
  },
  name: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 18,
  },
  nameLight: { color: "#fff" },
  sub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  statusLight: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
  },
  webCallHint: {
    maxWidth: 280,
    marginTop: 10,
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: 48,
    marginTop: 32,
  },
  bottomControls: {
    flexDirection: "row",
    gap: 40,
    justifyContent: "center",
    paddingBottom: Platform.OS === "ios" ? 48 : 36,
  },
  btnWrap: { alignItems: "center", gap: 8 },
  btn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
});
