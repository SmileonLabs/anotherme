import { CustomScrollView } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getListRoomsQueryKey,
  useCancelBattle,
  useFetchRoomMessages,
  useGetBattleState,
  useGetMe,
  useMarkRoomRead,
  useRestartBattle,
  useSetBattleReady,
  useSubmitBattleTurn,
  type BattleState,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageBubble } from "@/components/MessageBubble";
import { crossAlert } from "@/lib/crossAlert";
import { useColors } from "@/hooks/useColors";

const MAX_UTTERANCE = 1000;

function sideLabel(side: string): string {
  if (side === "pro") return "찬성";
  if (side === "con") return "반대";
  return "";
}

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function BattleScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: me } = useGetMe();
  const {
    data: battle,
    error: battleError,
    refetch: refetchBattle,
  } = useGetBattleState(id, {
    query: { queryKey: ["battle", id] },
  });
  const { data: messages = [], refetch: refetchMessages } = useFetchRoomMessages(id);

  const setReady = useSetBattleReady();
  const submitTurn = useSubmitBattleTurn();
  const restart = useRestartBattle();
  const cancel = useCancelBattle();
  const markRead = useMarkRoomRead();
  const queryClient = useQueryClient();

  // The newest persisted (non-temp) message id. Battle rooms appear in the chat
  // list with an unread badge, but this screen never advanced the read pointer —
  // so opening a battle never cleared its "1". Mark read off the latest real
  // message (excluding optimistic temp ids) and refresh the rooms list so the
  // badge clears on view, mirroring the chat screen.
  const lastRealMessageId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!String(messages[i].id).startsWith("temp-")) return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!id || !me || !lastRealMessageId) return;
    markRead.mutate(
      { id, data: { messageId: lastRealMessageId } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() });
        },
        onError: () => {
          // Best-effort: a failed read-mark just leaves the badge to the next
          // poll. Swallow so it never surfaces as an unhandled mutation.
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRealMessageId, id, me?.id]);

  // The host can cancel a waiting battle, which deletes the room. After that,
  // every participant's battle fetch 403/404s — bounce out to the chat list so
  // nobody is stuck on an infinite spinner. React Query keeps the last good
  // `battle` data on a refetch error, so we must key off the error status (not
  // `battle` being absent), and only treat 403/404 as "room gone" to avoid
  // bouncing on transient network errors.
  const cancelledRef = useRef(false);
  useEffect(() => {
    if (cancelledRef.current) return;
    const status = (battleError as { status?: number } | null)?.status;
    if (status !== 403 && status !== 404) return;
    cancelledRef.current = true;
    crossAlert("배틀 종료", "토크배틀이 취소되었습니다.");
    router.replace("/(tabs)/chats");
  }, [battleError, router]);

  const [draft, setDraft] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const autoSubmitted = useRef<number>(-1);
  const scrollRef = useRef<ScrollView>(null);

  // Poll battle state + messages every 3s (matches the rest of the app).
  useEffect(() => {
    const t = setInterval(() => {
      void refetchBattle();
      void refetchMessages();
    }, 3000);
    return () => clearInterval(t);
  }, [refetchBattle, refetchMessages]);

  // Local 1s ticker so the countdown is smooth between polls.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  const phase = battle?.phase ?? "waiting";
  const myId = me?.id;
  const isMyTurn = phase === "active" && battle?.currentSpeakerUserId === myId;

  // Server-authoritative remaining time, ticked locally from turnStartedAt.
  let remaining = 0;
  if (battle?.phase === "active" && battle.turnStartedAt) {
    const elapsed = (nowTick - new Date(battle.turnStartedAt).getTime()) / 1000;
    remaining = Math.max(0, Math.ceil(battle.timeLimitSeconds - elapsed));
  }

  const doSubmit = async (content: string) => {
    if (!id || submitTurn.isPending) return;
    try {
      await submitTurn.mutateAsync({ id, data: { content } });
      setDraft("");
      await Promise.all([refetchBattle(), refetchMessages()]);
    } catch {
      // 턴이 이미 넘어갔을 수 있음 — 최신 상태로 동기화
      void refetchBattle();
    }
  };

  // Auto-submit the current draft (or forfeit) when my turn's clock runs out.
  useEffect(() => {
    if (!isMyTurn || !battle) return;
    if (remaining > 0) return;
    if (autoSubmitted.current === battle.turnIndex) return;
    autoSubmitted.current = battle.turnIndex;
    void doSubmit(draft.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, remaining, battle?.turnIndex]);

  if (!battle) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/chats");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            ⚔️ 토크배틀
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {battle.topic}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {phase === "waiting" && (
        <WaitingRoom
          battle={battle}
          myId={myId}
          colors={colors}
          pending={setReady.isPending}
          cancelPending={cancel.isPending}
          onReady={async () => {
            try {
              await setReady.mutateAsync({ id });
              void refetchBattle();
            } catch {
              crossAlert("오류", "준비 상태를 변경하지 못했습니다");
            }
          }}
          onCancel={() => {
            crossAlert("배틀 취소", "토크배틀 신청을 취소할까요? 대화방이 삭제됩니다.", [
              { text: "닫기", style: "cancel" },
              {
                text: "신청 취소",
                style: "destructive",
                onPress: async () => {
                  try {
                    cancelledRef.current = true;
                    await cancel.mutateAsync({ id });
                    router.replace("/(tabs)/chats");
                  } catch {
                    cancelledRef.current = false;
                    crossAlert("오류", "취소하지 못했습니다");
                  }
                },
              },
            ]);
          }}
        />
      )}

      {phase !== "waiting" && (
        <>
          <BattleStatusStrip battle={battle} remaining={remaining} myId={myId} colors={colors} />

          <CustomScrollView
            ref={scrollRef}
            style={styles.transcript}
            contentContainerStyle={{ paddingVertical: 12 }}
          >
            {messages.map((m: Message) => {
              const isMe = m.senderId === myId;
              return (
                <MessageBubble
                  key={m.id}
                  content={m.content}
                  type={m.type}
                  isMe={isMe}
                  senderName={m.sender?.nickname}
                  senderAvatar={m.sender?.profileImageUrl ?? null}
                  showSender={!isMe && m.type !== "system"}
                  time={formatMsgTime(m.createdAt)}
                  isDM={m.type === "system"}
                />
              );
            })}
          </CustomScrollView>

          {phase === "ended" ? (
            <ResultBar
              battle={battle}
              myId={myId}
              colors={colors}
              insets={insets}
              pending={restart.isPending}
              onRestart={async () => {
                try {
                  await restart.mutateAsync({ id });
                  void refetchBattle();
                } catch {
                  crossAlert("오류", "다시 시작하지 못했습니다");
                }
              }}
              onExit={goBack}
            />
          ) : (
            <TurnInput
              isMyTurn={isMyTurn}
              draft={draft}
              setDraft={setDraft}
              colors={colors}
              insets={insets}
              pending={submitTurn.isPending}
              waitingName={
                battle.participants.find((p) => p.userId === battle.currentSpeakerUserId)?.name ??
                "상대"
              }
              waitingIsAI={
                !!battle.participants.find((p) => p.userId === battle.currentSpeakerUserId)?.isAI
              }
              onSend={() => {
                const c = draft.trim();
                if (c) void doSubmit(c);
              }}
            />
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

type Colors = ReturnType<typeof useColors>;

function WaitingRoom({
  battle,
  myId,
  colors,
  pending,
  cancelPending,
  onReady,
  onCancel,
}: {
  battle: BattleState;
  myId?: string;
  colors: Colors;
  pending: boolean;
  cancelPending: boolean;
  onReady: () => void;
  onCancel: () => void;
}) {
  const me = battle.participants.find((p) => p.userId === myId);
  const iAmReady = !!me?.ready;
  const isHost = !!myId && battle.hostUserId === myId;
  const aiOpponent = battle.participants.find((p) => p.isAI);
  return (
    <View style={styles.waitWrap}>
      <View style={[styles.topicCard, { backgroundColor: colors.accent }]}>
        <Text style={[styles.topicCardLabel, { color: colors.mutedForeground }]}>오늘의 주제</Text>
        <Text style={[styles.topicCardText, { color: colors.foreground }]}>{battle.topic}</Text>
      </View>

      <Text style={[styles.waitHint, { color: colors.mutedForeground }]}>
        {aiOpponent
          ? `${aiOpponent.name} 님과의 토론을 준비하고 있어요. 곧 시작됩니다!`
          : "두 사람이 모두 준비하면 찬성/반대가 무작위로 배정되고 게임이 시작됩니다."}
      </Text>

      {battle.participants.map((p) => (
        <View key={p.userId} style={[styles.waitRow, { borderColor: colors.border }]}>
          <Text style={[styles.waitName, { color: colors.foreground }]}>
            {p.isAI ? "🤖 " : ""}
            {p.name}
            {p.userId === myId ? " (나)" : ""}
          </Text>
          <View
            style={[
              styles.readyBadge,
              { backgroundColor: p.ready ? colors.primary : colors.muted },
            ]}
          >
            <Text
              style={[
                styles.readyBadgeText,
                { color: p.ready ? "#fff" : colors.mutedForeground },
              ]}
            >
              {p.ready ? "준비 완료" : "대기 중"}
            </Text>
          </View>
        </View>
      ))}

      {aiOpponent ? (
        <View style={[styles.readyBtn, { backgroundColor: colors.muted, flexDirection: "row", gap: 10 }]}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={[styles.readyBtnText, { color: colors.mutedForeground }]}>
            배틀을 준비하고 있어요...
          </Text>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.readyBtn,
            {
              backgroundColor: iAmReady ? colors.muted : colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={onReady}
          disabled={pending || iAmReady}
        >
          <Text
            style={[
              styles.readyBtnText,
              { color: iAmReady ? colors.mutedForeground : "#fff" },
            ]}
          >
            {iAmReady ? "상대를 기다리는 중..." : "✋ 준비 완료"}
          </Text>
        </Pressable>
      )}

      {!aiOpponent && isHost && (
        <Pressable
          style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
          onPress={onCancel}
          disabled={cancelPending}
        >
          {cancelPending ? (
            <ActivityIndicator color="#E5484D" size="small" />
          ) : (
            <Text style={[styles.cancelBtnText, { color: "#E5484D" }]}>배틀 신청 취소</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function BattleStatusStrip({
  battle,
  remaining,
  myId,
  colors,
}: {
  battle: BattleState;
  remaining: number;
  myId?: string;
  colors: Colors;
}) {
  const speaker = battle.participants.find((p) => p.userId === battle.currentSpeakerUserId);
  const isMyTurn = battle.currentSpeakerUserId === myId;
  const speakerIsAI = !!speaker?.isAI;
  const low = remaining <= 10;
  return (
    <View style={[styles.strip, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
      <View style={styles.stripRow}>
        <Text style={[styles.stripRound, { color: colors.foreground }]}>
          라운드 {Math.max(1, battle.round)} / {battle.totalRounds}
        </Text>
        {battle.phase === "active" &&
          (speakerIsAI ? (
            <Text style={[styles.stripTimer, { color: colors.mutedForeground, fontSize: 14 }]}>
              🤖 생각 중...
            </Text>
          ) : (
            <Text style={[styles.stripTimer, { color: low ? "#E5484D" : colors.primary }]}>
              ⏱ {remaining}s
            </Text>
          ))}
      </View>
      <View style={styles.scoreRow}>
        {battle.participants.map((p) => (
          <View key={p.userId} style={styles.scoreItem}>
            <Text style={[styles.scoreName, { color: colors.foreground }]} numberOfLines={1}>
              {sideLabel(p.side) ? `[${sideLabel(p.side)}] ` : ""}
              {p.name}
            </Text>
            <Text style={[styles.scoreVal, { color: colors.primary }]}>{p.totalScore}점</Text>
          </View>
        ))}
      </View>
      {battle.phase === "active" && (
        <Text style={[styles.turnHint, { color: isMyTurn ? colors.primary : colors.mutedForeground }]}>
          {isMyTurn ? "🎤 당신의 발언 차례입니다" : `${speaker?.name ?? "상대"} 님의 발언 차례`}
        </Text>
      )}
    </View>
  );
}

function TurnInput({
  isMyTurn,
  draft,
  setDraft,
  colors,
  insets,
  pending,
  waitingName,
  waitingIsAI,
  onSend,
}: {
  isMyTurn: boolean;
  draft: string;
  setDraft: (s: string) => void;
  colors: Colors;
  insets: { bottom: number };
  pending: boolean;
  waitingName: string;
  waitingIsAI: boolean;
  onSend: () => void;
}) {
  if (!isMyTurn) {
    return (
      <View
        style={[
          styles.inputBar,
          { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
        ]}
      >
        <Text style={[styles.waitingTurn, { color: colors.mutedForeground }]}>
          {waitingIsAI
            ? `🤖 ${waitingName} 님이 생각 중...`
            : `${waitingName} 님의 발언을 기다리는 중...`}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.inputBar,
        { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
      ]}
    >
      <TextInput
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.muted },
        ]}
        value={draft}
        onChangeText={setDraft}
        placeholder="당신의 주장을 펼치세요..."
        placeholderTextColor={colors.mutedForeground}
        maxLength={MAX_UTTERANCE}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={() => {
          if (draft.trim() && !pending) onSend();
        }}
      />
      <Pressable
        style={({ pressed }) => [
          styles.sendBtn,
          { backgroundColor: draft.trim() ? colors.primary : colors.muted, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={onSend}
        disabled={!draft.trim() || pending}
      >
        {pending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Feather name="send" size={18} color={draft.trim() ? "#fff" : colors.mutedForeground} />
        )}
      </Pressable>
    </View>
  );
}

function ResultBar({
  battle,
  myId,
  colors,
  insets,
  pending,
  onRestart,
  onExit,
}: {
  battle: BattleState;
  myId?: string;
  colors: Colors;
  insets: { bottom: number };
  pending: boolean;
  onRestart: () => void;
  onExit: () => void;
}) {
  const isDraw = !battle.winnerUserId;
  const iWon = battle.winnerUserId && battle.winnerUserId === myId;
  const title = isDraw ? "🤝 무승부!" : iWon ? "🏆 승리!" : "😢 패배";
  const winnerName = battle.participants.find((p) => p.userId === battle.winnerUserId)?.name;
  return (
    <View
      style={[
        styles.resultBar,
        { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
      ]}
    >
      <Text style={[styles.resultTitle, { color: colors.foreground }]}>{title}</Text>
      {!isDraw && (
        <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
          승자: {winnerName}
        </Text>
      )}
      <View style={styles.resultScores}>
        {battle.participants.map((p) => (
          <Text key={p.userId} style={[styles.resultScore, { color: colors.foreground }]}>
            {sideLabel(p.side) ? `[${sideLabel(p.side)}] ` : ""}
            {p.name} — {p.totalScore}점
          </Text>
        ))}
      </View>
      <View style={styles.resultBtns}>
        <Pressable
          style={({ pressed }) => [
            styles.resultBtn,
            { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={onExit}
        >
          <Text style={[styles.resultBtnText, { color: colors.foreground }]}>채팅으로</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.resultBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={onRestart}
          disabled={pending}
        >
          {pending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.resultBtnText, { color: "#fff" }]}>🔄 다시하기</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 32, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Waiting room
  waitWrap: { flex: 1, padding: 16, gap: 12 },
  topicCard: { padding: 18, borderRadius: 16 },
  topicCardLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  topicCardText: { fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 25 },
  waitHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  waitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  waitName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  readyBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  readyBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  readyBtn: { marginTop: 8, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  readyBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cancelBtn: { height: 44, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Status strip
  strip: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  stripRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stripRound: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stripTimer: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scoreRow: { flexDirection: "row", gap: 12 },
  scoreItem: { flex: 1 },
  scoreName: { fontSize: 13, fontFamily: "Inter_500Medium" },
  scoreVal: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 1 },
  turnHint: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },

  // Transcript
  transcript: { flex: 1, paddingHorizontal: 12 },

  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 0,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  waitingTurn: { flex: 1, textAlign: "center", fontSize: 14, fontFamily: "Inter_500Medium", paddingVertical: 12 },

  // Result
  resultBar: { paddingHorizontal: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  resultTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  resultSub: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  resultScores: { gap: 3, marginVertical: 8, alignItems: "center" },
  resultScore: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resultBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  resultBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  resultBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
