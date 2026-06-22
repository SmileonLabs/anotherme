import { CustomScrollView } from "@/components/CustomScroll";
import { EmptyState } from "@/components/EmptyState";
import { useRouter } from "expo-router";
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
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

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

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.muted },
        ]}
      >
        <Pressable
          accessibilityLabel="뒤로"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>퀘스트</Text>
        <View style={styles.headerBtn} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.muted }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={styles.tabItem}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {t.label}
              </Text>
              <View
                style={[
                  styles.tabUnderline,
                  { backgroundColor: active ? colors.primary : "transparent" },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <CustomScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
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
                활동으로 잠금 해제하고 어나더 미 EXP를 받으세요.
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
                <Text style={[styles.intro, { color: colors.mutedForeground }]}>
                  {tab === "daily"
                    ? "매일 0시(KST)에 초기화돼요."
                    : "매주 월요일 0시(KST)에 초기화돼요."}
                </Text>
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
    </View>
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
    <View style={[styles.card, { backgroundColor: colors.background }]}>
      <View style={styles.cardTop}>
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
        style={[
          styles.progressTrack,
          { backgroundColor: colors.muted },
        ]}
      >
        <View
          style={{
            width: `${ratio}%`,
            height: "100%",
            borderRadius: 4,
            backgroundColor: quest.completed ? "#00B488" : colors.primary,
          }}
        />
      </View>

      <View style={styles.cardBottom}>
        <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
          {Math.min(quest.progress, quest.target)} / {quest.target}
        </Text>
        <ClaimButton
          completed={quest.completed}
          claimed={quest.rewardClaimed}
          claiming={claiming}
          colors={colors}
          onClaim={onClaim}
        />
      </View>
    </View>
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
        name="zap"
        size={11}
        color={claimed ? colors.mutedForeground : colors.primary}
      />
      <Text
        style={[
          styles.rewardText,
          { color: claimed ? colors.mutedForeground : colors.primary },
        ]}
      >
        +{exp} EXP
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  tabItem: { flex: 1, alignItems: "center", paddingTop: 4 },
  tabLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", paddingBottom: 10 },
  tabUnderline: { height: 2, width: "100%", borderRadius: 1 },
  scroll: { padding: 16, gap: 12 },
  intro: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  center: { paddingVertical: 80, alignItems: "center", gap: 14 },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyWrap: { paddingVertical: 80 },
  card: { borderRadius: 16, padding: 16, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardInfo: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  rewardText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
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
