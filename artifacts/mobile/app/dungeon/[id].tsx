import { CustomScrollView } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAbandonLifeQuest,
  useChooseLifeQuestOption,
  useGetLifeQuest,
  type LifeQuest,
  type LifeQuestChoice,
  type LifeQuestChooseResult,
  type PersonaStatChanges,
} from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { useColors } from "@/hooks/useColors";
import { RISK_META, statEntries, themeMeta } from "@/constants/lifeQuest";

function StatDeltas({
  stats,
  color,
}: {
  stats: PersonaStatChanges | undefined | null;
  color: string;
}) {
  const entries = statEntries(stats as Record<string, number | undefined> | undefined | null);
  if (entries.length === 0) return null;
  return (
    <View style={styles.statRow}>
      {entries.map((e) => (
        <View key={e.key} style={[styles.statChip, { borderColor: color + "55", backgroundColor: color + "14" }]}>
          <Text style={[styles.statChipText, { color }]}>
            {e.label} +{e.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function LifeQuestPlayScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: quest, error, isLoading, refetch } = useGetLifeQuest(id, {
    query: { queryKey: ["lifeQuest", id] },
  });
  const choose = useChooseLifeQuestOption();
  const abandon = useAbandonLifeQuest();

  const [result, setResult] = useState<LifeQuestChooseResult | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dungeon");
  };

  const onChoose = async (choice: LifeQuestChoice, stageNumber: number) => {
    if (choose.isPending) return;
    try {
      const res = await choose.mutateAsync({
        id,
        data: { stageNumber, choiceId: choice.id },
      });
      setResult(res);
    } catch {
      crossAlert("오류", "선택을 처리하지 못했어요. 다시 시도해주세요.");
    }
  };

  const onContinue = async () => {
    setResult(null);
    await refetch();
  };

  const onAbandon = () => {
    crossAlert("퀘스트 그만두기", "지금 그만두면 이 퀘스트는 종료돼요. 계속할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "그만두기",
        style: "destructive",
        onPress: async () => {
          try {
            await abandon.mutateAsync({ id });
            goBack();
          } catch {
            crossAlert("오류", "처리하지 못했어요. 다시 시도해주세요.");
          }
        },
      },
    ]);
  };

  const renderHeader = (title: string) => (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.headerBtn}>
        <Feather name="chevron-left" size={26} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerBtn} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          상황을 준비하고 있어요…
        </Text>
      </View>
    );
  }

  if (error || !quest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {renderHeader("라이프 퀘스트")}
        <View style={[styles.center, { flex: 1, gap: 12 }]}>
          <Feather name="alert-circle" size={36} color={colors.mutedForeground} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            퀘스트를 불러오지 못했어요.
          </Text>
          <Pressable onPress={goBack} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.primaryBtnText}>돌아가기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const tMeta = themeMeta(quest.theme);
  const isDone = quest.status !== "active" || quest.currentStageIndex >= quest.stages.length;

  if (isDone) {
    return (
      <CompletionView
        quest={quest}
        colors={colors}
        insets={insets}
        renderHeader={renderHeader}
        onClose={goBack}
      />
    );
  }

  const stage = quest.stages[quest.currentStageIndex]!;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader(quest.title)}
      <CustomScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressRow}>
          <View style={[styles.themePill, { backgroundColor: tMeta.color + "1A" }]}>
            <Feather name={tMeta.icon} size={13} color={tMeta.color} />
            <Text style={[styles.themePillText, { color: tMeta.color }]}>{tMeta.label}</Text>
          </View>
          <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
            {quest.currentStageIndex + 1} / {quest.stages.length} 단계
          </Text>
        </View>

        <Text style={[styles.goalLabel, { color: colors.mutedForeground }]}>목표</Text>
        <Text style={[styles.goalText, { color: colors.foreground }]}>{quest.goal}</Text>

        <View style={[styles.stageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.stageTitle, { color: colors.foreground }]}>{stage.title}</Text>
          <Text style={[styles.stageSituation, { color: colors.foreground }]}>{stage.situation}</Text>
        </View>

        <Text style={[styles.chooseLabel, { color: colors.mutedForeground }]}>
          어떻게 할까요?
        </Text>

        {stage.choices.map((c) => {
          const risk = RISK_META[c.riskLevel];
          return (
            <Pressable
              key={c.id}
              onPress={() => onChoose(c, stage.stageNumber)}
              disabled={choose.isPending}
              style={({ pressed }) => [
                styles.choiceCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pressed || choose.isPending ? 0.7 : 1,
                },
              ]}
            >
              <View style={styles.choiceHeader}>
                <Text style={[styles.choiceLabel, { color: colors.foreground }]}>{c.label}</Text>
                {risk ? (
                  <View style={[styles.riskPill, { backgroundColor: risk.color + "1A" }]}>
                    <Text style={[styles.riskText, { color: risk.color }]}>{risk.label}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.choiceDesc, { color: colors.mutedForeground }]}>{c.description}</Text>
            </Pressable>
          );
        })}

        <Pressable onPress={onAbandon} disabled={abandon.isPending} style={styles.abandonBtn}>
          <Text style={[styles.abandonText, { color: colors.mutedForeground }]}>퀘스트 그만두기</Text>
        </Pressable>
      </CustomScrollView>

      {choose.isPending ? (
        <View style={styles.pendingOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      {result && !result.completed ? (
        <ResultSheet
          result={result}
          colors={colors}
          insets={insets}
          themeColor={tMeta.color}
          onContinue={onContinue}
        />
      ) : null}

      {result && result.completed ? (
        <CompletionView
          quest={result.quest}
          colors={colors}
          insets={insets}
          renderHeader={renderHeader}
          onClose={goBack}
          lastResult={result}
        />
      ) : null}
    </View>
  );
}

function ResultSheet({
  result,
  colors,
  insets,
  themeColor,
  onContinue,
}: {
  result: LifeQuestChooseResult;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number };
  themeColor: string;
  onContinue: () => void;
}) {
  return (
    <View style={styles.sheetBackdrop}>
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={[styles.sheetIcon, { backgroundColor: themeColor + "1A" }]}>
          <Feather name="check" size={22} color={themeColor} />
        </View>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>결과</Text>
        <Text style={[styles.sheetBody, { color: colors.foreground }]}>{result.resultText}</Text>
        <StatDeltas stats={result.statChanges} color={themeColor} />
        {result.expEarned > 0 ? (
          <Text style={[styles.expText, { color: colors.mutedForeground }]}>
            +{result.expEarned} XP
          </Text>
        ) : null}
        <Pressable onPress={onContinue} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.primaryBtnText}>계속하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CompletionView({
  quest,
  colors,
  insets,
  renderHeader,
  onClose,
  lastResult,
}: {
  quest: LifeQuest;
  colors: ReturnType<typeof useColors>;
  insets: { top: number; bottom: number };
  renderHeader: (title: string) => React.ReactNode;
  onClose: () => void;
  lastResult?: LifeQuestChooseResult;
}) {
  const tMeta = themeMeta(quest.theme);
  const succeeded = quest.status === "completed";
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader("완료")}
      <CustomScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.completeHero}>
          <View style={[styles.completeIcon, { backgroundColor: tMeta.color + "1A" }]}>
            <Feather name={succeeded ? "award" : "flag"} size={34} color={tMeta.color} />
          </View>
          <Text style={[styles.completeTitle, { color: colors.foreground }]}>
            {succeeded ? "퀘스트 완료!" : "퀘스트 종료"}
          </Text>
          <Text style={[styles.completeSub, { color: colors.mutedForeground }]}>{quest.title}</Text>
        </View>

        {lastResult ? (
          <View style={[styles.stageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.stageSituation, { color: colors.foreground }]}>{lastResult.resultText}</Text>
            <StatDeltas stats={lastResult.statChanges} color={tMeta.color} />
          </View>
        ) : null}

        <Text style={[styles.goalLabel, { color: colors.mutedForeground }]}>돌아보기</Text>
        <Text style={[styles.goalText, { color: colors.foreground }]}>{quest.summary}</Text>

        <View style={styles.timeline}>
          {quest.stages.map((s, i) => {
            const chosen = s.choices.find((c) => c.id === s.chosenChoiceId);
            return (
              <View key={s.stageNumber} style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: tMeta.color }]}>
                  <Text style={styles.timelineNum}>{i + 1}</Text>
                </View>
                <View style={styles.timelineBody}>
                  <Text style={[styles.timelineStage, { color: colors.mutedForeground }]}>{s.title}</Text>
                  {chosen ? (
                    <Text style={[styles.timelineChoice, { color: colors.foreground }]}>{chosen.label}</Text>
                  ) : (
                    <Text style={[styles.timelineChoice, { color: colors.mutedForeground }]}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <Pressable onPress={onClose} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.primaryBtnText}>완료</Text>
        </Pressable>
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_700Bold" },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  themePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  themePillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  goalLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  goalText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 18 },
  stageCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 22, gap: 10 },
  stageTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  stageSituation: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 23 },
  chooseLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  choiceCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 15, marginBottom: 10, gap: 6 },
  choiceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  choiceLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  choiceDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  riskPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  riskText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  abandonBtn: { alignItems: "center", paddingVertical: 18, marginTop: 6 },
  abandonText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  pendingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 22, gap: 12, alignItems: "center" },
  sheetIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetBody: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 23, textAlign: "center" },
  expText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  statChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  statChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  primaryBtn: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, marginTop: 8, alignSelf: "stretch" },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  completeHero: { alignItems: "center", gap: 10, paddingVertical: 24 },
  completeIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  completeTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  completeSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  timeline: { marginTop: 14, marginBottom: 8, gap: 14 },
  timelineItem: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  timelineNum: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  timelineBody: { flex: 1, gap: 2 },
  timelineStage: { fontSize: 12, fontFamily: "Inter_400Regular" },
  timelineChoice: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
