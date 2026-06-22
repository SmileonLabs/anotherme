import { CustomScrollView } from "@/components/CustomScroll";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClanWarQueryKey,
  getListClanWarsQueryKey,
  useAcceptClanWar,
  useCancelClanWar,
  useCompleteClanWar,
  useGetClanWar,
  useGetMyClan,
  useSubmitClanWarArgument,
} from "@workspace/api-client-react";
import type {
  ClanWarDetail,
  ClanWarParticipant,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";
import { WAR_STATUS_LABEL, WAR_STATUS_TONE, warOutcomeLabel } from "@/lib/clanWar";

const SUBMISSION_MAX = 1000;

export default function ClanWarDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const warId = Array.isArray(params.id) ? params.id[0] : params.id;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: myClan } = useGetMyClan();
  const myClanId = myClan?.clan.id ?? null;
  const canManage = myClan?.myRole === "owner" || myClan?.myRole === "elder";

  const {
    data: war,
    isLoading,
    isError,
    refetch,
  } = useGetClanWar(warId, {
    query: { enabled: !!warId, queryKey: getGetClanWarQueryKey(warId) },
  });

  const [draft, setDraft] = React.useState("");

  const accept = useAcceptClanWar();
  const submit = useSubmitClanWarArgument();
  const complete = useCompleteClanWar();
  const cancel = useCancelClanWar();

  const invalidate = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetClanWarQueryKey(warId) }),
      queryClient.invalidateQueries({ queryKey: getListClanWarsQueryKey() }),
    ]);
  }, [queryClient, warId]);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    try {
      await fn();
      await invalidate();
    } catch (err) {
      crossAlert("오류", (err as { message?: string })?.message ?? fallback);
    }
  };

  const onSubmit = async () => {
    const content = draft.trim();
    if (content.length < 5) {
      crossAlert("확인", "주장은 5자 이상 입력해 주세요.");
      return;
    }
    await run(async () => {
      await submit.mutateAsync({ id: warId, data: { content } });
      setDraft("");
    }, "주장을 제출하지 못했어요.");
  };

  const onComplete = () => {
    crossAlert("결과 확정", "AI 심판이 양측 주장을 평가해 승패를 정합니다. 확정 후에는 되돌릴 수 없어요.", [
      { text: "취소", style: "cancel" },
      {
        text: "확정",
        onPress: () =>
          run(() => complete.mutateAsync({ id: warId }), "가문전을 종료하지 못했어요."),
      },
    ]);
  };

  const onCancel = () => {
    crossAlert("가문전 취소", "이 가문전을 취소할까요?", [
      { text: "닫기", style: "cancel" },
      {
        text: "취소하기",
        style: "destructive",
        onPress: () =>
          run(() => cancel.mutateAsync({ id: warId }), "가문전을 취소하지 못했어요."),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.muted }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (isError || !war) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.muted }]}>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          가문전을 불러오지 못했어요.
        </Text>
        <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  const tone = WAR_STATUS_TONE(war.status, colors);
  const outcome = warOutcomeLabel(war, myClanId);
  const isParticipantClan = !!war.mySide;
  const canSubmit =
    isParticipantClan && (war.status === "matched" || war.status === "active") && !war.mySubmission;
  const canAccept = war.status === "open" && canManage && !isParticipantClan;
  const canComplete =
    canManage && isParticipantClan && (war.status === "matched" || war.status === "active");
  const canCancel =
    canManage &&
    myClanId === war.challengerClanId &&
    war.status !== "completed" &&
    war.status !== "cancelled";

  const pending =
    accept.isPending || submit.isPending || complete.isPending || cancel.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={[styles.badge, { backgroundColor: `${tone}1f`, alignSelf: "flex-start" }]}>
          <Text style={[styles.badgeText, { color: tone }]}>
            {WAR_STATUS_LABEL[war.status] ?? war.status}
          </Text>
        </View>
        <Text style={[styles.topic, { color: colors.foreground }]}>{war.topic}</Text>

        <View style={[styles.scoreCard, { backgroundColor: colors.background }]}>
          <SideCol
            name={war.challengerClanName ?? "도전 가문"}
            score={war.challengerScore}
            isWinner={war.status === "completed" && war.winnerClanId === war.challengerClanId}
            colors={colors}
          />
          <Text style={[styles.vs, { color: colors.mutedForeground }]}>VS</Text>
          <SideCol
            name={war.opponentClanName ?? "상대 모집 중"}
            score={war.opponentScore}
            isWinner={war.status === "completed" && war.winnerClanId === war.opponentClanId}
            colors={colors}
          />
        </View>
        {outcome ? (
          <Text style={[styles.outcome, { color: colors.primary }]}>우리 가문: {outcome}</Text>
        ) : null}

        {war.result ? (
          <View style={[styles.resultCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>AI 심판 총평</Text>
            <Text style={[styles.resultBody, { color: colors.foreground }]}>{war.result.judgeSummary}</Text>
            <ResultFeedback label="도전 가문" text={war.result.challengerFeedback} colors={colors} />
            <ResultFeedback label="상대 가문" text={war.result.opponentFeedback} colors={colors} />
          </View>
        ) : null}

        {canAccept ? (
          <Pressable
            onPress={() => run(() => accept.mutateAsync({ id: warId }), "도전을 수락하지 못했어요.")}
            disabled={pending}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.actionText}>도전 수락</Text>
          </Pressable>
        ) : null}

        {war.mySubmission ? (
          <View style={[styles.mineCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>내 주장</Text>
            <Text style={[styles.mineBody, { color: colors.foreground }]}>{war.mySubmission}</Text>
          </View>
        ) : canSubmit ? (
          <View style={styles.submitWrap}>
            <View style={styles.fieldHead}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>내 주장 작성</Text>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                {draft.trim().length}/{SUBMISSION_MAX}
              </Text>
            </View>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraft(t.slice(0, SUBMISSION_MAX))}
              placeholder="주제에 대한 당신의 주장을 설득력 있게 작성해 주세요. (한 번만 제출할 수 있어요)"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
            />
            <Pressable
              onPress={onSubmit}
              disabled={pending}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="send" size={15} color="#fff" />
              <Text style={styles.actionText}>{submit.isPending ? "제출 중..." : "주장 제출"}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 22 }]}>
          참가자 {war.participants.length}명
        </Text>
        {war.participants.length > 0 ? (
          <View style={[styles.listCard, { backgroundColor: colors.background }]}>
            {war.participants.map((p, i) => (
              <ParticipantRow
                key={p.userId}
                p={p}
                first={i === 0}
                completed={war.status === "completed"}
                colors={colors}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.empty, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>아직 참가자가 없어요.</Text>
          </View>
        )}

        {canComplete ? (
          <Pressable
            onPress={onComplete}
            disabled={pending}
            style={[styles.actionBtn, { backgroundColor: colors.foreground, marginTop: 22 }]}
          >
            {complete.isPending ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <Feather name="award" size={16} color={colors.background} />
                <Text style={[styles.actionText, { color: colors.background }]}>결과 확정 (AI 심판)</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {canCancel ? (
          <Pressable
            onPress={onCancel}
            disabled={pending}
            style={[styles.cancelBtn, { borderColor: colors.destructive }]}
          >
            <Text style={[styles.cancelText, { color: colors.destructive }]}>가문전 취소</Text>
          </Pressable>
        ) : null}
      </CustomScrollView>
    </View>
  );
}

function SideCol({
  name,
  score,
  isWinner,
  colors,
}: {
  name: string;
  score: number;
  isWinner: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.sideCol}>
      <Text
        style={[styles.sideName, { color: isWinner ? colors.primary : colors.foreground }]}
        numberOfLines={2}
      >
        {name}
      </Text>
      <Text style={[styles.sideScore, { color: isWinner ? colors.primary : colors.foreground }]}>
        {score}
      </Text>
      {isWinner ? <Feather name="award" size={16} color={colors.primary} /> : null}
    </View>
  );
}

function ResultFeedback({
  label,
  text,
  colors,
}: {
  label: string;
  text: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.feedbackRow}>
      <Text style={[styles.feedbackLabel, { color: colors.primary }]}>{label}</Text>
      <Text style={[styles.feedbackBody, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

function ParticipantRow({
  p,
  first,
  completed,
  colors,
}: {
  p: ClanWarParticipant;
  first: boolean;
  completed: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const sideLabel = p.side === "challenger" ? "도전" : "상대";
  return (
    <View
      style={[
        styles.row,
        { borderTopColor: colors.border, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth },
      ]}
    >
      <View style={[styles.sideTag, { backgroundColor: `${colors.primary}14` }]}>
        <Text style={[styles.sideTagText, { color: colors.primary }]}>{sideLabel}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
          {p.displayName ?? "익명"}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {p.hasSubmitted ? "제출 완료" : "미제출"}
          {completed && p.contributionSummary ? ` · ${p.contributionSummary}` : ""}
        </Text>
      </View>
      {completed ? (
        <Text style={[styles.rowScore, { color: colors.foreground }]}>{p.score}</Text>
      ) : p.hasSubmitted ? (
        <Feather name="check-circle" size={16} color={colors.primary} />
      ) : (
        <Feather name="clock" size={16} color={colors.mutedForeground} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 14 },
  muted: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  topic: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 12, marginBottom: 16, lineHeight: 28 },
  scoreCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 18,
  },
  sideCol: { flex: 1, alignItems: "center", gap: 6 },
  sideName: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  sideScore: { fontSize: 30, fontFamily: "Inter_700Bold" },
  vs: { fontSize: 13, fontFamily: "Inter_700Bold", paddingHorizontal: 10 },
  outcome: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center", marginTop: 12 },
  resultCard: { borderRadius: 16, padding: 16, marginTop: 16, gap: 10 },
  resultBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  feedbackRow: { gap: 4 },
  feedbackLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  feedbackBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  actionText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  mineCard: { borderRadius: 14, padding: 16, marginTop: 18, gap: 8 },
  mineBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  submitWrap: { marginTop: 18 },
  fieldHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 120,
    textAlignVertical: "top",
  },
  listCard: { borderRadius: 14, marginTop: 10, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  sideTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sideTagText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowScore: { fontSize: 16, fontFamily: "Inter_700Bold" },
  empty: {
    alignItems: "center",
    padding: 24,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  cancelBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
