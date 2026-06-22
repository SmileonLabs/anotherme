import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import {
  useAcceptCall,
  useCreateCall,
  useDeclineCall,
  useEndCall,
  useGetCall,
  useJoinCall,
  useListIncomingCalls,
  type Call,
  type CallWithCaller,
} from "@workspace/api-client-react";
import {
  joinCall,
  leaveCall,
  primeAudioPlayback,
  setMuted,
  startRingback,
  stopRingback,
  voiceCallSupported,
} from "@/lib/voiceCall";
import { useColors } from "@/hooks/useColors";
import { Avatar } from "@/components/Avatar";

type CallMode = "idle" | "outgoing" | "incoming" | "active";

interface CallContextValue {
  startCall: (calleeId: string, calleeName: string, roomId?: string) => Promise<void>;
  joinFromCard: (callId: string, peerName: string) => Promise<void>;
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
        joinFromCard: async () => {},
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
  const [connecting, setConnecting] = useState(false);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const createCall = useCreateCall();
  const acceptCall = useAcceptCall();
  const declineCall = useDeclineCall();
  const endCall = useEndCall();
  const joinCallMut = useJoinCall();

  // Poll for incoming calls when idle.
  const { data: incomingList, refetch: refetchIncoming } = useListIncomingCalls();
  useEffect(() => {
    const t = setInterval(() => refetchIncoming(), 3000);
    return () => clearInterval(t);
  }, [refetchIncoming]);

  useEffect(() => {
    if (modeRef.current !== "idle") return;
    const next = incomingList?.[0];
    if (next) {
      setIncoming(next);
      setPeerName(next.caller.nickname);
      setMode("incoming");
    }
  }, [incomingList]);

  // Poll the relevant call to detect remote accept/decline/end/expiry.
  // - outgoing/active: watch our active call
  // - incoming: watch the ringing call so we can auto-dismiss if the caller hangs up
  const watchId =
    mode === "outgoing" || mode === "active"
      ? activeCall?.id ?? ""
      : mode === "incoming"
        ? incoming?.id ?? ""
        : "";
  const { data: watched, refetch: refetchWatched } = useGetCall(watchId);
  useEffect(() => {
    if (!watchId) return;
    const t = setInterval(() => refetchWatched(), 2500);
    return () => clearInterval(t);
  }, [watchId, refetchWatched]);

  const reset = useCallback(async () => {
    stopRingback();
    await leaveCall();
    setMode("idle");
    setActiveCall(null);
    setIncoming(null);
    setPeerName("");
    setMutedState(false);
    setConnecting(false);
  }, []);

  useEffect(() => {
    if (!watched) return;
    const ended =
      watched.status === "declined" ||
      watched.status === "ended" ||
      watched.status === "missed";

    if (modeRef.current === "incoming") {
      // Caller hung up or the call expired before we answered → dismiss the modal.
      if (ended) {
        setIncoming(null);
        setMode("idle");
      }
      return;
    }

    if (watched.status === "active" && modeRef.current === "outgoing") {
      // Callee answered — stop the ringback before the live call audio begins.
      stopRingback();
      setActiveCall(watched);
      setMode("active");
    } else if (ended) {
      void reset();
    }
  }, [watched, reset]);

  const startCall = useCallback(
    async (calleeId: string, calleeName: string, roomId?: string) => {
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
      setMode("outgoing");
      setConnecting(true);
      try {
        const session = await createCall.mutateAsync({ data: { calleeId, roomId } });
        setActiveCall(session.call);
        await joinCall(session.url, session.token);
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
    async (callId: string, peer: string) => {
      if (!voiceCallSupported) return;
      // Already in a call (outgoing/active) → ignore. If a matching incoming
      // modal is up, clear it so we don't show both the modal and the overlay.
      if (modeRef.current === "outgoing" || modeRef.current === "active") return;
      if (modeRef.current === "incoming") setIncoming(null);
      // Unlock audio on the card-tap gesture, before the join await.
      primeAudioPlayback();
      setPeerName(peer);
      setMode("active");
      setConnecting(true);
      try {
        const session = await joinCallMut.mutateAsync({ id: callId });
        setActiveCall(session.call);
        await joinCall(session.url, session.token);
        setConnecting(false);
      } catch {
        await reset();
      }
    },
    [joinCallMut, reset],
  );

  const handleAccept = useCallback(async () => {
    if (!incoming) return;
    // Unlock audio on the accept-button gesture, before the accept await.
    primeAudioPlayback();
    setConnecting(true);
    try {
      const session = await acceptCall.mutateAsync({ id: incoming.id });
      setActiveCall(session.call);
      setMode("active");
      await joinCall(session.url, session.token);
      setConnecting(false);
    } catch {
      await reset();
    }
  }, [incoming, acceptCall, reset]);

  const handleDecline = useCallback(async () => {
    const id = incoming?.id;
    setIncoming(null);
    setMode("idle");
    if (id) {
      try {
        await declineCall.mutateAsync({ id });
      } catch {}
    }
  }, [incoming, declineCall]);

  const handleEnd = useCallback(async () => {
    const id = activeCall?.id;
    await reset();
    if (id) {
      try {
        await endCall.mutateAsync({ id });
      } catch {}
    }
  }, [activeCall, endCall, reset]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    setMutedState(next);
    await setMuted(next);
  }, [muted]);

  return (
    <CallContext.Provider value={{ startCall, joinFromCard, supported: voiceCallSupported }}>
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
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>수신 전화…</Text>
            <View style={styles.actionRow}>
              <CallButton color="#E5484D" icon="phone-off" label="거절" onPress={handleDecline} />
              <CallButton color="#30A46C" icon="phone" label="수락" onPress={handleAccept} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Outgoing / active call overlay */}
      <Modal visible={mode === "outgoing" || mode === "active"} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.82)" }]}>
          <View style={styles.callBody}>
            <Avatar name={peerName} size={104} />
            <Text style={[styles.name, styles.nameLight]}>{peerName}</Text>
            <Text style={styles.statusLight}>
              {mode === "outgoing" ? (connecting ? "연결 중…" : "통화 연결 중…") : "통화 중"}
            </Text>
            {connecting && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
          </View>
          <View style={styles.bottomControls}>
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
