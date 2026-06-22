import { CustomScrollView } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAnalyzeMyPersona,
  useGetClanRankings,
  useGetMe,
  useGetMyClan,
  useGetMyPersona,
  useGetMyPersonaCard,
  useGetMyQuests,
  useGetMyRewardsSummary,
  useGetPersonaRankings,
  useListClanWars,
  useListIncomingFriendRequests,
  type Quest,
} from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";

/** Dark overlay over the hero background image so foreground text stays legible. */
const HERO_OVERLAY = [
  "rgba(12,10,28,0.45)",
  "rgba(12,10,28,0.55)",
  "rgba(12,10,28,0.82)",
] as const;
const BONUS_GRADIENT = ["#3B2A6B", "#5B3FA0"] as const;

/** Mockup hero stats (order + Korean label) mapped to PersonaStats keys. */
const HERO_STATS: {
  key: "conviction" | "logic" | "decisiveness" | "empathy" | "knowledge";
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}[] = [
  { key: "conviction", label: "설득력", icon: "message-circle", color: "#A78BFA" },
  { key: "logic", label: "논리성", icon: "cpu", color: "#60A5FA" },
  { key: "decisiveness", label: "전략성", icon: "target", color: "#34D399" },
  { key: "empathy", label: "공감력", icon: "heart", color: "#F472B6" },
  { key: "knowledge", label: "지식", icon: "book-open", color: "#FBBF24" },
];

/** Stat metadata for the "최근 성장 변화" aggregation (covers every PersonaStats key). */
const GROWTH_STAT_META: Record<
  string,
  { label: string; icon: keyof typeof Feather.glyphMap; color: string }
> = {
  conviction: { label: "설득력", icon: "message-circle", color: "#A78BFA" },
  logic: { label: "논리성", icon: "cpu", color: "#60A5FA" },
  decisiveness: { label: "전략성", icon: "target", color: "#34D399" },
  empathy: { label: "공감력", icon: "heart", color: "#F472B6" },
  knowledge: { label: "지식", icon: "book-open", color: "#FBBF24" },
  wit: { label: "위트", icon: "zap", color: "#FB923C" },
  emotion: { label: "감정", icon: "droplet", color: "#FB7185" },
};

const STAT_ORDER = [
  "conviction",
  "logic",
  "decisiveness",
  "empathy",
  "knowledge",
  "wit",
  "emotion",
];

function questIcon(q: Quest): keyof typeof Feather.glyphMap {
  const s = `${q.key} ${q.title}`;
  if (/배틀|battle/i.test(s)) return "mic";
  if (/던전|dungeon/i.test(s)) return "compass";
  if (/가문|clan/i.test(s)) return "shield";
  if (/분석|analyze|persona|자아/i.test(s)) return "cpu";
  if (/대화|채팅|chat|메시지/i.test(s)) return "message-circle";
  return "target";
}

function questColor(q: Quest): string {
  const icon = questIcon(q);
  if (icon === "mic") return "#C084FC";
  if (icon === "compass") return "#34D399";
  if (icon === "shield") return "#FBBF24";
  if (icon === "cpu") return "#60A5FA";
  if (icon === "message-circle") return "#38BDF8";
  return "#A78BFA";
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: me } = useGetMe();
  const { data: persona, refetch: refetchPersona } = useGetMyPersona();
  const { data: card, refetch: refetchCard } = useGetMyPersonaCard();
  const { data: quests = [], refetch: refetchQuests } = useGetMyQuests();
  const { data: myClan, refetch: refetchClan } = useGetMyClan();
  const { data: clanRanking, refetch: refetchClanRank } = useGetClanRankings({
    type: "overall",
  });
  const { data: wars = [], refetch: refetchWars } = useListClanWars({
    status: "active",
  });
  const { data: ranking, refetch: refetchRanking } = useGetPersonaRankings({
    type: "overall",
    limit: 5,
  });
  const { data: incomingRequests = [], refetch: refetchRequests } =
    useListIncomingFriendRequests();
  const { data: rewardsSummary, refetch: refetchRewards } =
    useGetMyRewardsSummary();

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);

  const { mutate: analyze, isPending: isAnalyzing } = useAnalyzeMyPersona({
    mutation: {
      onMutate: () => setAnalysisError(null),
      onSuccess: () => {
        refetchPersona();
        refetchCard();
      },
      onError: (err: unknown) => {
        const data = (err as { data?: { message?: string } } | null)?.data;
        setAnalysisError(
          data?.message ?? "분석에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
      },
    },
  });

  const refetchAll = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchPersona(),
        refetchCard(),
        refetchQuests(),
        refetchClan(),
        refetchClanRank(),
        refetchWars(),
        refetchRanking(),
        refetchRequests(),
        refetchRewards(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    refetchPersona,
    refetchCard,
    refetchQuests,
    refetchClan,
    refetchClanRank,
    refetchWars,
    refetchRanking,
    refetchRequests,
    refetchRewards,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      refetchPersona();
      refetchQuests();
      refetchRewards();
      refetchRequests();
    }, [refetchPersona, refetchQuests, refetchRewards, refetchRequests]),
  );

  const hasRequests = incomingRequests.length > 0;
  const level = persona?.level ?? 1;
  const xpInto = persona?.xpIntoLevel ?? 0;
  const xpFor = persona?.xpForNextLevel ?? 100;
  const xpProgress = Math.min(100, Math.round((xpInto / (xpFor || 1)) * 100));
  const archetype = card?.archetype ?? "성장하는 자아";
  const motto =
    card?.motto ?? "활동을 쌓을수록 또 다른 내가 깨어납니다.";

  const dailyQuests = quests
    .filter((q) => q.type === "daily")
    .slice(0, 3);
  const allDailyDone =
    dailyQuests.length > 0 && dailyQuests.every((q) => q.completed);

  // Aggregate recent stat changes + earned XP for "최근 성장 변화".
  const { growthRows, growthExp } = React.useMemo(() => {
    const totals: Record<string, number> = {};
    let exp = 0;
    for (const ev of persona?.recentEvents ?? []) {
      exp += ev.expDelta ?? 0;
      for (const [k, v] of Object.entries(ev.statChanges ?? {})) {
        if (!v) continue;
        totals[k] = (totals[k] ?? 0) + (v as number);
      }
    }
    const rows = STAT_ORDER.filter((k) => (totals[k] ?? 0) > 0)
      .map((k) => ({ key: k, value: totals[k], meta: GROWTH_STAT_META[k] }))
      .slice(0, 5);
    return { growthRows: rows, growthExp: exp };
  }, [persona?.recentEvents]);

  const clan = myClan?.clan;
  const clanRank = clanRanking?.myClanRank?.rank;
  const activeWar = wars[0];
  const rankItems = ranking?.items?.slice(0, 5) ?? [];

  const NAV: {
    key: string;
    title: string;
    tagline: string;
    desc: string;
    cta: string;
    icon: keyof typeof Feather.glyphMap;
    grad: readonly [string, string];
    accent: string;
    onPress: () => void;
  }[] = [
    {
      key: "battle",
      title: "토크배틀",
      tagline: "말로 싸워라",
      desc: "AI·친구와 말빨 대결",
      cta: "시작하기",
      icon: "mic",
      grad: ["#2E1650", "#4A2389"],
      accent: "#C084FC",
      onPress: () => router.push("/(tabs)/battle"),
    },
    {
      key: "dungeon",
      title: "던전",
      tagline: "선택으로 성장하라",
      desc: "AI 던전 마스터와 모험",
      cta: "입장하기",
      icon: "compass",
      grad: ["#0E3327", "#155C41"],
      accent: "#34D399",
      onPress: () => router.push("/(tabs)/dungeon"),
    },
    {
      key: "persona",
      title: "또 다른 나",
      tagline: "정체성을 확인하라",
      desc: "성장과 분석 확인하기",
      cta: "보기",
      icon: "user",
      grad: ["#0E2B47", "#1A4E7A"],
      accent: "#38BDF8",
      onPress: () => router.push("/(tabs)/persona"),
    },
    {
      key: "clan",
      title: "가문",
      tagline: "함께 성장하라",
      desc: "가문 기억과 지혜",
      cta: "입장하기",
      icon: "shield",
      grad: ["#3A2A0C", "#6E5113"],
      accent: "#FBBF24",
      onPress: () => router.push("/clan"),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text
            style={[styles.greeting, { color: colors.foreground }]}
            numberOfLines={1}
          >
            안녕하세요, {me?.nickname ?? "회원"}님 👋
          </Text>
          <Text style={[styles.greetingSub, { color: colors.mutedForeground }]}>
            오늘의 Another Me
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="알림"
            hitSlop={8}
            onPress={() => router.push("/friends/requests")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="bell" size={22} color={colors.foreground} />
            {hasRequests ? (
              <View style={[styles.iconDot, { borderColor: colors.background }]} />
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="친구"
            hitSlop={8}
            onPress={() => router.push("/friends")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="users" size={22} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityLabel="설정"
            hitSlop={8}
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="settings" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      <CustomScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refetchAll}
            tintColor={colors.primary}
          />
        }
      >
        {/* Persona hero card */}
        <ImageBackground
          source={require("../../assets/images/persona-card-bg.png")}
          imageStyle={styles.heroBgImage}
          style={styles.hero}
        >
          <LinearGradient
            colors={HERO_OVERLAY}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroTop}>
            <View style={styles.heroInfo}>
              <View style={styles.archetypeRow}>
                <Text style={styles.archetype}>{archetype}</Text>
                <Feather name="chevron-down" size={14} color="#B7B0E8" />
              </View>
              <Text style={styles.heroLevel}>Lv. {level}</Text>
              <View style={styles.xpTrack}>
                <View style={[styles.xpFill, { width: `${xpProgress}%` }]} />
              </View>
              <Text style={styles.xpText}>
                {xpInto.toLocaleString()} / {xpFor.toLocaleString()} XP
              </Text>
            </View>

            <View style={styles.heroAvatarWrap}>
              <View style={styles.heroAvatarGlow} />
              <View style={styles.heroAvatarRing}>
                <Avatar
                  uri={me?.profileImageUrl}
                  name={me?.nickname ?? "나"}
                  size={92}
                />
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.heroStats}>
            {HERO_STATS.map((s) => (
              <View key={s.key} style={styles.heroStatRow}>
                <Feather name={s.icon} size={15} color={s.color} />
                <Text style={styles.heroStatLabel}>{s.label}</Text>
                <Text style={styles.heroStatValue}>
                  {persona?.stats?.[s.key] ?? 0}
                </Text>
              </View>
            ))}
          </View>

          {/* Motto */}
          <Text style={styles.heroMotto} numberOfLines={2}>
            “{motto}”
          </Text>

          {analysisError ? (
            <Text style={styles.heroError}>{analysisError}</Text>
          ) : null}

          <Pressable
            onPress={() => analyze()}
            disabled={isAnalyzing}
            style={({ pressed }) => [
              styles.analyzeBtn,
              { opacity: isAnalyzing ? 0.7 : pressed ? 0.85 : 1 },
            ]}
          >
            {isAnalyzing ? (
              <ActivityIndicator size="small" color="#E9E5FF" />
            ) : (
              <Feather name="refresh-cw" size={14} color="#E9E5FF" />
            )}
            <Text style={styles.analyzeBtnText}>
              {isAnalyzing ? "분석 중…" : "분석 업데이트"}
            </Text>
          </Pressable>
        </ImageBackground>

        {/* Daily quests */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              오늘의 성장 퀘스트
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => router.push("/quests")}
              style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                모두 보기
              </Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {dailyQuests.length === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              오늘의 퀘스트를 불러오는 중이에요.
            </Text>
          ) : (
            <View style={styles.questRow}>
              {dailyQuests.map((q) => {
                const c = questColor(q);
                const ratio = Math.min(
                  100,
                  Math.round((q.progress / (q.target || 1)) * 100),
                );
                return (
                  <View key={q.key} style={styles.questCell}>
                    <View style={[styles.questIcon, { backgroundColor: `${c}22` }]}>
                      <Feather name={questIcon(q)} size={18} color={c} />
                    </View>
                    <Text
                      style={[styles.questTitle, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {q.title}
                    </Text>
                    <View
                      style={[
                        styles.questTrack,
                        { backgroundColor: colors.border },
                      ]}
                    >
                      <View
                        style={{
                          width: `${ratio}%`,
                          height: "100%",
                          borderRadius: 3,
                          backgroundColor: q.completed ? "#34D399" : c,
                        }}
                      />
                    </View>
                    <Text style={[styles.questProgress, { color: colors.mutedForeground }]}>
                      {q.progress} / {q.target}
                    </Text>
                    <Text style={[styles.questReward, { color: c }]}>
                      +{q.rewardExp} XP
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <Pressable onPress={() => router.push("/quests")}>
            {({ pressed }) => (
              <LinearGradient
                colors={BONUS_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.bonusBanner, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Feather name="gift" size={15} color="#FBE6A6" />
                <Text style={styles.bonusText}>
                  {allDailyDone
                    ? "오늘 퀘스트를 모두 완료했어요! 보상을 받아보세요"
                    : "퀘스트를 완료하고 성장 보상을 받아보세요"}
                </Text>
                <Feather name="chevron-right" size={15} color="#EDE7FF" />
              </LinearGradient>
            )}
          </Pressable>
        </View>

        {/* Navigation cards */}
        <View style={styles.navGrid}>
          {NAV.map((n) => (
            <Pressable
              key={n.key}
              onPress={n.onPress}
              style={({ pressed }) => [styles.navWrap, { opacity: pressed ? 0.9 : 1 }]}
            >
              <LinearGradient
                colors={n.grad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.navCard, { borderColor: `${n.accent}40` }]}
              >
                <View style={[styles.navIcon, { backgroundColor: `${n.accent}26` }]}>
                  <Feather name={n.icon} size={20} color={n.accent} />
                </View>
                <Text style={styles.navTitle}>{n.title}</Text>
                <Text style={[styles.navTagline, { color: n.accent }]}>
                  {n.tagline}
                </Text>
                <Text style={styles.navDesc} numberOfLines={2}>
                  {n.desc}
                </Text>
                <View style={[styles.navCta, { backgroundColor: `${n.accent}26` }]}>
                  <Text style={[styles.navCtaText, { color: n.accent }]}>{n.cta}</Text>
                </View>
              </LinearGradient>
            </Pressable>
          ))}
        </View>

        {/* Recent growth changes */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              최근 성장 변화
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => router.push("/(tabs)/persona")}
              style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                성장 기록 보기
              </Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {growthRows.length === 0 && growthExp === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              아직 성장 변화가 없어요. 활동할수록 또 다른 내가 깨어납니다.
            </Text>
          ) : (
            <>
              {growthRows.map((r) => (
                <View key={r.key} style={styles.growthRow}>
                  <Feather name={r.meta.icon} size={15} color={r.meta.color} />
                  <Text style={[styles.growthLabel, { color: colors.foreground }]}>
                    {r.meta.label}
                  </Text>
                  <Text style={styles.growthDelta}>+{r.value}</Text>
                  <Feather name="arrow-up" size={13} color="#34D399" />
                </View>
              ))}
              {growthExp > 0 ? (
                <View
                  style={[
                    styles.growthExpRow,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <Feather name="zap" size={15} color="#FBBF24" />
                  <Text style={[styles.growthLabel, { color: colors.foreground }]}>
                    획득 EXP
                  </Text>
                  <Text style={[styles.growthExp]}>+{growthExp.toLocaleString()}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* My clan */}
        {clan ? (
          <Pressable
            onPress={() => router.push("/clan")}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                소속 가문
              </Text>
              <View style={styles.moreBtn}>
                <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                  가문 홈으로
                </Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </View>
            </View>
            <View style={styles.clanRow}>
              <View style={[styles.clanEmblem, { backgroundColor: "#3A2A0C" }]}>
                <Feather name="shield" size={22} color="#FBBF24" />
              </View>
              <View style={styles.clanInfo}>
                <Text style={[styles.clanName, { color: colors.foreground }]} numberOfLines={1}>
                  {clan.name}
                </Text>
                <Text style={[styles.clanMeta, { color: colors.mutedForeground }]}>
                  가문 레벨 {clan.level} · {clan.exp.toLocaleString()} EXP
                </Text>
              </View>
              {clanRank ? (
                <View style={styles.clanRankBox}>
                  <Text style={[styles.clanRankValue, { color: colors.foreground }]}>
                    {clanRank}위
                  </Text>
                  <Text style={[styles.clanRankLabel, { color: colors.mutedForeground }]}>
                    가문 랭킹
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        ) : null}

        {/* Next clan war */}
        {clan && activeWar ? (
          <Pressable
            onPress={() => router.push("/clan/wars")}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                진행 중인 가문전
              </Text>
              <View style={styles.moreBtn}>
                <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                  자세히 보기
                </Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </View>
            </View>
            <Text style={[styles.warTopic, { color: colors.foreground }]} numberOfLines={1}>
              {activeWar.topic}
            </Text>
            <View style={styles.warScoreRow}>
              <View style={styles.warSide}>
                <Text style={[styles.warSideLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {activeWar.challengerClanName ?? "우리 가문"}
                </Text>
                <Text style={[styles.warScore, { color: colors.primary }]}>
                  {activeWar.challengerScore}
                </Text>
              </View>
              <Text style={[styles.warVs, { color: colors.mutedForeground }]}>VS</Text>
              <View style={styles.warSide}>
                <Text style={[styles.warSideLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {activeWar.opponentClanName ?? "상대 가문"}
                </Text>
                <Text style={[styles.warScore, { color: colors.foreground }]}>
                  {activeWar.opponentScore}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {/* Weekly top ranking */}
        {rankItems.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                이번 주 TOP 랭킹
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => router.push("/profile/ranking")}
                style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                  더 보기
                </Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {rankItems.map((item, i) => (
              <View
                key={item.userId}
                style={[
                  styles.rankRow,
                  {
                    borderTopColor: colors.border,
                    borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rankNum,
                    { color: item.rank <= 3 ? "#FBBF24" : colors.mutedForeground },
                  ]}
                >
                  {item.rank}
                </Text>
                <Avatar uri={item.avatarUrl} name={item.displayName} size={36} />
                <View style={styles.rankInfo}>
                  <Text style={[styles.rankName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  <Text style={[styles.rankLevel, { color: colors.mutedForeground }]}>
                    Lv.{item.level}
                  </Text>
                </View>
                <View style={styles.rankScoreBox}>
                  <Feather name="award" size={13} color="#FBBF24" />
                  <Text style={[styles.rankScore, { color: colors.foreground }]}>
                    {item.score.toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  greeting: { fontSize: 18, fontFamily: "Inter_700Bold" },
  greetingSub: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { padding: 6 },
  iconDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
  },

  scrollContent: { paddingHorizontal: 16, gap: 14 },

  // Hero
  hero: {
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(147,140,255,0.25)",
    overflow: "hidden",
    backgroundColor: "#0C0A1C",
  },
  heroBgImage: {
    borderRadius: 20,
    resizeMode: "cover",
  },
  heroTop: { flexDirection: "row", alignItems: "center" },
  heroInfo: { flex: 1 },
  archetypeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  archetype: { color: "#B7B0E8", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  heroLevel: {
    color: "#FFFFFF",
    fontSize: 38,
    fontFamily: "Inter_800ExtraBold",
    marginTop: 2,
  },
  xpTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    marginTop: 8,
  },
  xpFill: { height: "100%", borderRadius: 4, backgroundColor: "#8A7CF6" },
  xpText: {
    color: "#A9A2D6",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 6,
  },
  heroAvatarWrap: {
    width: 116,
    height: 116,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarGlow: {
    position: "absolute",
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "rgba(124,92,252,0.22)",
  },
  heroAvatarRing: {
    padding: 4,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(147,140,255,0.55)",
    backgroundColor: "rgba(124,92,252,0.12)",
  },
  heroStats: { marginTop: 18, gap: 10 },
  heroStatRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroStatLabel: {
    flex: 1,
    color: "#D9D4F2",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  heroMotto: {
    color: "#C9C2EC",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 18,
    lineHeight: 19,
  },
  heroError: {
    color: "#FCA5A5",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 8,
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    alignSelf: "center",
    marginTop: 14,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(147,140,255,0.5)",
    backgroundColor: "rgba(124,92,252,0.18)",
  },
  analyzeBtnText: {
    color: "#E9E5FF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  // Generic card
  card: {
    borderRadius: 18,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  moreBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  moreText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyHint: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
    paddingVertical: 6,
  },

  // Quests
  questRow: { flexDirection: "row", gap: 10 },
  questCell: { flex: 1, alignItems: "center" },
  questIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  questTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    minHeight: 32,
  },
  questTrack: {
    width: "100%",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 6,
  },
  questProgress: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 5,
  },
  questReward: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  bonusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  bonusText: {
    flex: 1,
    color: "#EDE7FF",
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
  },

  // Nav grid
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  navWrap: { width: "47.8%", flexGrow: 1 },
  navCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 172,
  },
  navIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  navTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  navTagline: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
    marginTop: 3,
  },
  navDesc: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 6,
    lineHeight: 17,
    flex: 1,
  },
  navCta: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  navCtaText: { fontSize: 13, fontFamily: "Inter_700Bold" },

  // Growth
  growthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
  },
  growthLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  growthDelta: { color: "#34D399", fontSize: 14, fontFamily: "Inter_700Bold" },
  growthExpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 11,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  growthExp: { color: "#FBBF24", fontSize: 14, fontFamily: "Inter_800ExtraBold" },

  // Clan
  clanRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  clanEmblem: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  clanInfo: { flex: 1 },
  clanName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  clanMeta: { fontSize: 12.5, fontFamily: "Inter_500Medium", marginTop: 3 },
  clanRankBox: { alignItems: "flex-end" },
  clanRankValue: { fontSize: 18, fontFamily: "Inter_800ExtraBold" },
  clanRankLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },

  // War
  warTopic: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  warScoreRow: { flexDirection: "row", alignItems: "center" },
  warSide: { flex: 1, alignItems: "center" },
  warSideLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  warScore: { fontSize: 26, fontFamily: "Inter_800ExtraBold" },
  warVs: { fontSize: 13, fontFamily: "Inter_700Bold", paddingHorizontal: 10 },

  // Ranking
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },
  rankNum: {
    width: 20,
    textAlign: "center",
    fontSize: 15,
    fontFamily: "Inter_800ExtraBold",
  },
  rankInfo: { flex: 1 },
  rankName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rankLevel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  rankScoreBox: { flexDirection: "row", alignItems: "center", gap: 4 },
  rankScore: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
