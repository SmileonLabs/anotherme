import { CustomScrollView } from "@/components/CustomScroll";
import { EmptyState } from "@/components/EmptyState";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetMyAchievementsQueryKey,
  getGetMyQuestsQueryKey,
  getGetMyRewardsSummaryQueryKey,
  useClaimAchievementReward,
  useClaimQuestReward,
  useGetMyAchievements,
  useGetMyQuests,
  type Achievement,
  type Quest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { NeonBackdrop } from "@/components/NeonUI";
import { playModeQueryKey } from "@/hooks/usePlayMode";

type TabKey = "daily" | "weekly" | "achievements";

const TABS: { key: TabKey; label: string }[] = [
  { key: "daily", label: "일일" },
  { key: "weekly", label: "주간" },
  { key: "achievements", label: "업적" },
];

const CATEGORY_ICON: Record<Achievement["category"], keyof typeof Feather.glyphMap> = {
  chat: "message-circle",
  battle: "mic",
  dungeon: "compass",
  clan: "shield",
  persona: "user",
};

export default function QuestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [tab, setTab] = React.useState<TabKey>("daily");

  const {
    data: quests = [],
    isLoading: questsLoading,
    isError: questsError,
    refetch: refetchQuests,
    isRefetching: questsRefetching,
  } = useGetMyQuests();
  const {
    data: achievements = [],
    isLoading: achLoading,
    isError: achError,
    refetch: refetchAchievements,
    isRefetching: achRefetching,
  } = useGetMyAchievements();

  const [claimingKey, setClaimingKey] = React.useState<string | null>(null);

  const invalidateAll = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetMyQuestsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMyAchievementsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMyRewardsSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: playModeQueryKey });
  }, [queryClient]);

  const { mutate: claimQuest } = useClaimQuestReward({
    mutation: {
      onMutate: (v) => setClaimingKey(`quest:${v.questKey}`),
      onSettled: () => setClaimingKey(null),
      onSuccess: invalidateAll,
    },
  });
  const { mutate: claimAchievement } = useClaimAchievementReward({
    mutation: {
      onMutate: (v) => setClaimingKey(`ach:${v.achievementKey}`),
      onSettled: () => setClaimingKey(null),
      onSuccess: invalidateAll,
    },
  });

  const dailyQuests = quests.filter((q) => q.type === "daily");
  const weeklyQuests = quests.filter((q) => q.type === "weekly");

  const refetchActive =
    tab === "achievements" ? refetchAchievements : refetchQuests;
  const isRefetching =
    tab === "achievements" ? achRefetching : questsRefetching;
  const missionTarget = dailyQuests.reduce((sum, quest) => sum + Math.max(quest.target, 1), 0);
  const missionProgress = dailyQuests.reduce((sum, quest) => sum + Math.min(quest.progress, quest.target), 0);
  const torimiaProgress = missionTarget > 0 ? Math.min(100, Math.round((missionProgress / missionTarget) * 100)) : 0;

  return (
    <NeonBackdrop style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>미션</Text>
      </View>

      <CustomScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetchActive}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.missionHero}>
          <Image
            source={require("../../assets/images/torimia-portal-scene.png")}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="right"
          />
          <LinearGradient
            colors={["rgba(5,4,13,0.98)", "rgba(7,5,20,0.82)", "rgba(7,4,18,0.12)"]}
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.heroGlow} />
          <View style={styles.missionHeroCopy}>
            <Text style={styles.missionHeroTitle}>토로미아 문 열기 미션</Text>
            <Text style={styles.missionHeroBody}>1000스타를 소모하여{`\n`}메타버스로 캐릭터를 전송합니다.</Text>
            <Text style={styles.missionPercent}>{torimiaProgress}%</Text>
            <View style={styles.missionTrack}><View style={[styles.missionFill, { width: `${torimiaProgress}%` }]} /></View>
            <Text style={styles.missionRemain}>토로미아 문 열 자격까지 {Math.max(0, 100 - torimiaProgress)}% 남았어요</Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/dungeon")}
            style={({ pressed }) => [styles.gateButton, pressed && { opacity: 0.78 }]}
          >
            <Text style={styles.gateButtonText}>문 열기 시도</Text>
            <Feather name="chevron-right" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tabItem, active && styles.tabItemActive]}>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "achievements" ? (
          achLoading ? (
            <Loading colors={colors} />
          ) : achError ? (
            <ErrorBlock colors={colors} onRetry={refetchAchievements} />
          ) : achievements.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="award"
                title="업적이 없어요"
                subtitle="활동을 쌓으면 업적이 열립니다."
              />
            </View>
          ) : (
            <>
              <Text style={[styles.intro, { color: colors.mutedForeground }]}>
                  STAR 미션과 활동으로 잠금 해제하고 FAN XP 보상을 받으세요.
              </Text>
              {achievements.map((a) => (
                <AchievementRow
                  key={a.key}
                  achievement={a}
                  colors={colors}
                  claiming={claimingKey === `ach:${a.key}`}
                  onClaim={() => claimAchievement({ achievementKey: a.key })}
                />
              ))}
            </>
          )
        ) : questsLoading ? (
          <Loading colors={colors} />
        ) : questsError ? (
          <ErrorBlock colors={colors} onRetry={refetchQuests} />
        ) : (
          (() => {
            const list = tab === "daily" ? dailyQuests : weeklyQuests;
            if (list.length === 0) {
              return (
                <View style={styles.emptyWrap}>
                  <EmptyState
                    icon="check-circle"
                    title="퀘스트가 없어요"
                    subtitle="잠시 후 다시 확인해 주세요."
                  />
                </View>
              );
            }
            return (
              <>
                <Text style={styles.listTitle}>{tab === "daily" ? "데일리 미션" : "주간 미션"}</Text>
                {list.map((q) => (
                  <QuestRow
                    key={q.key}
                    quest={q}
                    colors={colors}
                    claiming={claimingKey === `quest:${q.key}`}
                    onClaim={() => claimQuest({ questKey: q.key })}
                  />
                ))}
              </>
            );
          })()
        )}
      </CustomScrollView>
    </NeonBackdrop>
  );
}

function Loading({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function ErrorBlock({
  colors,
  onRetry,
}: {
  colors: ReturnType<typeof useColors>;
  onRetry: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
        불러오지 못했어요.
      </Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function questIcon(quest: Quest): keyof typeof Feather.glyphMap {
  const source = `${quest.key} ${quest.title} ${quest.description}`.toLocaleLowerCase();
  if (source.includes("대화") || source.includes("chat") || source.includes("talk")) return "message-circle";
  if (source.includes("게시") || source.includes("post") || source.includes("feed")) return "edit-3";
  if (source.includes("좋아요") || source.includes("응원") || source.includes("reaction")) return "star";
  if (source.includes("배틀") || source.includes("battle")) return "mic";
  if (source.includes("분석") || source.includes("analysis")) return "activity";
  return "zap";
}

function QuestRow({
  quest,
  colors,
  claiming,
  onClaim,
}: {
  quest: Quest;
  colors: ReturnType<typeof useColors>;
  claiming: boolean;
  onClaim: () => void;
}) {
  const ratio = Math.min(100, Math.round((quest.progress / (quest.target || 1)) * 100));
  return (
    <LinearGradient
      colors={["rgba(11,11,27,0.99)", "rgba(5,6,18,0.99)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <View style={styles.questIconWrap}>
          <Feather name={questIcon(quest)} size={34} color="#B24CFF" />
          <View pointerEvents="none" style={styles.questIconGlow} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {quest.title}
          </Text>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {quest.description}
          </Text>
        </View>
        <RewardBadge
          exp={quest.rewardExp}
          colors={colors}
          claimed={quest.rewardClaimed}
        />
      </View>

      <View
        style={styles.progressTrack}
      >
        <View
          style={{
            width: `${ratio}%`,
            height: "100%",
            borderRadius: 4,
            backgroundColor: quest.completed ? "#35E6E0" : "#5918FF",
          }}
        />
      </View>

      <View style={styles.cardBottom}>
        <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
          {Math.min(quest.progress, quest.target)} / {quest.target}
        </Text>
        {quest.completed || quest.rewardClaimed ? (
          <ClaimButton
            completed={quest.completed}
            claimed={quest.rewardClaimed}
            claiming={claiming}
            colors={colors}
            onClaim={onClaim}
          />
        ) : null}
      </View>
    </LinearGradient>
  );
}

function AchievementRow({
  achievement,
  colors,
  claiming,
  onClaim,
}: {
  achievement: Achievement;
  colors: ReturnType<typeof useColors>;
  claiming: boolean;
  onClaim: () => void;
}) {
  const icon = CATEGORY_ICON[achievement.category] ?? "award";
  return (
    <View style={[styles.card, { backgroundColor: colors.background }]}>
      <View style={styles.cardTop}>
        <View
          style={[
            styles.achIcon,
            {
              backgroundColor: achievement.unlocked
                ? `${colors.primary}18`
                : colors.muted,
            },
          ]}
        >
          <Feather
            name={achievement.unlocked ? icon : "lock"}
            size={18}
            color={achievement.unlocked ? colors.primary : colors.mutedForeground}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {achievement.title}
          </Text>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {achievement.description}
          </Text>
        </View>
        <RewardBadge
          exp={achievement.rewardExp}
          colors={colors}
          claimed={achievement.rewardClaimed}
        />
      </View>

      <View style={styles.cardBottom}>
        <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
          {achievement.unlocked ? "달성 완료" : "미달성"}
        </Text>
        <ClaimButton
          completed={achievement.unlocked}
          claimed={achievement.rewardClaimed}
          claiming={claiming}
          colors={colors}
          onClaim={onClaim}
        />
      </View>
    </View>
  );
}

function RewardBadge({
  exp,
  colors,
  claimed,
}: {
  exp: number;
  colors: ReturnType<typeof useColors>;
  claimed: boolean;
}) {
  return (
    <View
      style={[
        styles.rewardBadge,
        { backgroundColor: claimed ? colors.muted : `${colors.primary}14` },
      ]}
    >
      <Feather
        name="star"
        size={15}
        color={claimed ? colors.mutedForeground : colors.primary}
      />
      <Text
        style={[
          styles.rewardText,
          { color: claimed ? colors.mutedForeground : colors.primary },
        ]}
      >
        +{exp} STAR
      </Text>
    </View>
  );
}

function ClaimButton({
  completed,
  claimed,
  claiming,
  colors,
  onClaim,
}: {
  completed: boolean;
  claimed: boolean;
  claiming: boolean;
  colors: ReturnType<typeof useColors>;
  onClaim: () => void;
}) {
  if (claimed) {
    return (
      <View style={[styles.claimBtn, styles.claimedBtn, { borderColor: colors.border }]}>
        <Feather name="check" size={14} color={colors.mutedForeground} />
        <Text style={[styles.claimedText, { color: colors.mutedForeground }]}>받음</Text>
      </View>
    );
  }
  const disabled = !completed || claiming;
  return (
    <Pressable
      onPress={onClaim}
      disabled={disabled}
      style={({ pressed }) => [
        styles.claimBtn,
        {
          backgroundColor: completed ? colors.foreground : colors.muted,
          opacity: disabled && !claiming ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {claiming ? (
        <ActivityIndicator size="small" color={colors.background} />
      ) : (
        <Text
          style={[
            styles.claimText,
            { color: completed ? colors.background : colors.mutedForeground },
          ]}
        >
          {completed ? "보상 받기" : "진행 중"}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 12,
  },
  headerTitle: { color: "#F7F5FF", fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  tabBar: {
    height: 38,
    flexDirection: "row",
    gap: 5,
    padding: 3,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(112,62,169,0.30)",
    backgroundColor: "rgba(8,7,19,0.92)",
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 17 },
  tabItemActive: { backgroundColor: "rgba(84,32,165,0.36)", borderWidth: 1, borderColor: "rgba(177,76,255,0.42)" },
  tabLabel: { color: "#777181", fontSize: 11, fontFamily: "Inter_500Medium" },
  tabLabelActive: { color: "#E8DCFF", fontFamily: "Inter_700Bold" },
  scroll: { paddingHorizontal: 5, gap: 10 },
  missionHero: { minHeight: 290, borderRadius: 16, borderWidth: 1, borderColor: "rgba(177,76,255,0.58)", overflow: "hidden", backgroundColor: "#070512" },
  heroGlow: { position: "absolute", right: 45, top: 26, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(103,39,255,0.12)" },
  missionHeroCopy: { width: "54%", paddingLeft: 28, paddingTop: 27, zIndex: 1 },
  missionHeroTitle: { color: "#F7F5FF", fontFamily: "Inter_700Bold", fontSize: 23, lineHeight: 30 },
  missionHeroBody: { color: "#A9A3BA", fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 19, marginTop: 14 },
  missionPercent: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 46, lineHeight: 55, marginTop: 22, textShadowColor: "rgba(178,76,255,0.35)", textShadowRadius: 10 },
  missionTrack: { width: "100%", height: 10, borderRadius: 5, backgroundColor: "rgba(100,91,133,0.24)", overflow: "hidden", marginTop: 5 },
  missionFill: { height: "100%", borderRadius: 5, backgroundColor: "#5918FF" },
  missionRemain: { color: "#8E879A", fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 10 },
  gateButton: { position: "absolute", right: 14, bottom: 18, width: "38%", height: 48, paddingHorizontal: 16, borderRadius: 25, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#4F12E8", borderWidth: 1, borderColor: "#8A52FF", shadowColor: "#6D28FF", shadowOpacity: 0.55, shadowRadius: 12 },
  gateButtonText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  listTitle: { color: "#F0ECF5", fontFamily: "Inter_700Bold", fontSize: 17, marginTop: 7, marginBottom: 2 },
  intro: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  center: { paddingVertical: 80, alignItems: "center", gap: 14 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyWrap: { paddingVertical: 80 },
  card: { minHeight: 140, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(61,56,113,0.48)", padding: 18, gap: 12, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 15 },
  cardInfo: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  cardDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 3 },
  questIconWrap: { width: 72, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(59,20,113,0.25)" },
  questIconGlow: { position: "absolute", width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(164,59,255,0.14)", shadowColor: "#B24CFF", shadowOpacity: 0.9, shadowRadius: 14 },
  achIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(177,76,255,0.64)",
  },
  rewardText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(83,78,111,0.16)" },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 92,
  },
  claimText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  claimedBtn: { backgroundColor: "transparent", borderWidth: StyleSheet.hairlineWidth },
  claimedText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
