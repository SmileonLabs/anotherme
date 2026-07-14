import { CustomScrollView } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useGetClanRankings,
  useGetMe,
  useGetMyClan,
  useGetMyPersona,
  useGetMyQuests,
  useListClanWars,
  useListIncomingFriendRequests,
  type Quest,
} from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { NeonBackdrop } from "@/components/NeonUI";
import { neon } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { dailyTalkRewardStatusQueryKey } from "@/hooks/useDailyTalkReward";
import { usePlayMode } from "@/hooks/usePlayMode";
import { pvtWalletQueryKey } from "@/hooks/usePvtWallet";
import { useStarFeed, type StarFeedPost } from "@/hooks/useStarFeed";
import { useOpenBibiOfficialRoom } from "@/hooks/useBibiOfficial";

const BONUS_GRADIENT = ["#3B2A6B", "#5B3FA0"] as const;
const FAN_CHARACTER_IMAGE = require("../../assets/images/fan.png");
const FAN_CARD_BG_IMAGE = require("../../assets/images/fan_bg.png");
const STAR_CHARACTER_IMAGE = require("../../assets/images/star-character-cutout.png");
const TORIMIA_PORTAL_SCENE_IMAGE = require("../../assets/images/torimia-portal-scene.png");
const MISSION_STAR_POINTS = [
  { left: "12%" as const, top: "22%" as const, size: 1.5, opacity: 0.72 },
  { left: "29%" as const, top: "12%" as const, size: 1, opacity: 0.42 },
  { left: "47%" as const, top: "31%" as const, size: 1.4, opacity: 0.58 },
  { left: "68%" as const, top: "18%" as const, size: 1, opacity: 0.48 },
  { left: "84%" as const, top: "37%" as const, size: 1.5, opacity: 0.7 },
  { left: "18%" as const, top: "57%" as const, size: 1, opacity: 0.36 },
  { left: "75%" as const, top: "68%" as const, size: 1.2, opacity: 0.44 },
] as const;

const HOME_NAV_ITEMS: Array<{
  key: string;
  title: string;
  tagline: string;
  desc: string;
  cta: string;
  icon: keyof typeof Feather.glyphMap;
  grad: readonly [string, string];
  accent: string;
  route: string;
}> = [
  { key: "battle", title: "토크배틀", tagline: "말로 증명하라", desc: "AI 심판이 판정하는 3라운드 토론", cta: "시작하기", icon: "mic", grad: ["#2E1650", "#4A2389"], accent: "#C084FC", route: "/(tabs)/battle" },
  { key: "dungeon", title: "STAR 미션", tagline: "선택으로 성장하라", desc: "현실 같은 선택 시뮬레이션", cta: "시작하기", icon: "compass", grad: ["#0E3327", "#155C41"], accent: "#34D399", route: "/(tabs)/dungeon" },
  { key: "persona", title: "또 다른 나", tagline: "정체성을 확인하라", desc: "성장과 분석 확인하기", cta: "보기", icon: "user", grad: ["#0E2B47", "#1A4E7A"], accent: "#38BDF8", route: "/(tabs)/persona" },
  { key: "clan", title: "팬클럽", tagline: "함께 성장하라", desc: "팬클럽 기억과 지혜", cta: "입장하기", icon: "shield", grad: ["#3A2A0C", "#6E5113"], accent: "#FBBF24", route: "/clan" },
];

const HomeNavigationGrid = React.memo(function HomeNavigationGrid() {
  const router = useRouter();
  return (
    <View style={styles.navGrid}>
      {HOME_NAV_ITEMS.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => router.push(item.route as never)}
          style={({ pressed }) => [styles.navWrap, { opacity: pressed ? 0.9 : 1 }]}
        >
          <LinearGradient
            colors={item.grad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.navCard, { borderColor: `${item.accent}40` }]}
          >
            <View style={[styles.navIcon, { backgroundColor: `${item.accent}26` }]}>
              <Feather name={item.icon} size={20} color={item.accent} />
            </View>
            <Text style={styles.navTitle}>{item.title}</Text>
            <Text style={[styles.navTagline, { color: item.accent }]}>{item.tagline}</Text>
            <Text style={styles.navDesc} numberOfLines={2}>{item.desc}</Text>
            <View style={[styles.navCta, { backgroundColor: `${item.accent}26` }]}>
              <Text style={[styles.navCtaText, { color: item.accent }]}>{item.cta}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      ))}
    </View>
  );
});

type RankingScope = "persona" | "fan" | "star" | "battle";
type PlayModeChoice = "fan" | "star";

interface ServiceRankingItem {
  id: string;
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  title: string;
  subTitle: string;
  badgeLabel: string;
  score: number;
  primaryStatLabel: string;
  primaryStatValue: number;
}

interface ServiceRankingResult {
  scope: RankingScope;
  type: string;
  items: ServiceRankingItem[];
  myRank: {
    rank: number;
    score: number;
    pointsToNextRank: number;
  } | null;
}

interface PersonaOntologyProfile {
  evidenceSummary: string[];
  traitTags?: string[];
  communicationStyles?: string[];
  capabilities?: string[];
  conflictStyles?: string[];
  confidence: number;
}

const RANK_SCOPE_META: Record<
  RankingScope,
  { label: string; icon: keyof typeof Feather.glyphMap; color: string }
> = {
  persona: { label: "자아", icon: "user", color: "#60A5FA" },
  fan: { label: "FAN", icon: "heart", color: "#F472B6" },
  star: { label: "STAR", icon: "star", color: "#FBBF24" },
  battle: { label: "배틀", icon: "mic", color: "#C084FC" },
};

const STAR_STAT_META = [
  { key: "charm", label: "매력" },
  { key: "stagePresence", label: "무대감" },
  { key: "bond", label: "유대" },
  { key: "lore", label: "세계관" },
] as const;

function questIcon(q: Quest): keyof typeof Feather.glyphMap {
  const s = `${q.key} ${q.title}`;
  if (/배틀|battle/i.test(s)) return "mic";
  if (/던전|dungeon/i.test(s)) return "compass";
  if (/팬클럽|가문|clan/i.test(s)) return "shield";
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

function starStageLabel(stage: "aspiring" | "promoted" | undefined): string {
  if (stage === "promoted") return "공식 STAR";
  return "연습생 STAR";
}

function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * (level - 1) * level;
}

function rankLabel(result: ServiceRankingResult | undefined): string {
  return result?.myRank ? `${result.myRank.rank}위` : "진입 전";
}

function formatCompactNumber(value: number | undefined): string {
  const safe = value ?? 0;
  if (safe >= 10000) return `${Math.floor(safe / 1000) / 10}만`;
  return safe.toLocaleString();
}

function feedKindLabel(kind: StarFeedPost["kind"]): string {
  if (kind === "star") return "공식 STAR 기록";
  if (kind === "fan") return "FAN 응원글";
  if (kind === "growth") return "성장 기록";
  if (kind === "profile_update") return "프로필 업데이트";
  if (kind === "talk_diary") return "오늘의 대화 일기";
  if (kind === "event") return "이벤트";
  return "공식 소식";
}

function useHomeRanking(scope: RankingScope) {
  return useQuery({
    queryKey: ["home-service-ranking", scope],
    queryFn: () =>
      customFetch<ServiceRankingResult>(`/api/users/rankings?scope=${scope}&type=overall&limit=5`, {
        responseType: "json",
      }),
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: me, refetch: refetchMe } = useGetMe();
  const { data: persona, refetch: refetchPersona } = useGetMyPersona();
  const { data: quests = [], refetch: refetchQuests } = useGetMyQuests();
  const {
    mode,
    fanProfile,
    equippedStar,
    starUnlocked,
    isChanging: isChangingMode,
    refetch: refetchPlayMode,
    setMode,
  } = usePlayMode();
  const { posts: feedPosts, refetch: refetchFeed } = useStarFeed();
  const openBibiOfficialRoom = useOpenBibiOfficialRoom();
  const { data: myClan, refetch: refetchClan } = useGetMyClan();
  const { data: clanRanking, refetch: refetchClanRank } = useGetClanRankings({
    type: "overall",
  });
  const { data: wars = [], refetch: refetchWars } = useListClanWars({
    status: "active",
  });
  const { data: personaRankingData, refetch: refetchPersonaRanking } = useHomeRanking("persona");
  const { data: fanRankingData, refetch: refetchFanRanking } = useHomeRanking("fan");
  const { data: starRankingData, refetch: refetchStarRanking } = useHomeRanking("star");
  const { data: battleRankingData, refetch: refetchBattleRanking } = useHomeRanking("battle");
  const { data: incomingRequests = [], refetch: refetchRequests } =
    useListIncomingFriendRequests();

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [selectedPlayMode, setSelectedPlayMode] = React.useState<PlayModeChoice>("fan");

  React.useEffect(() => {
    if (mode === "star" && equippedStar) {
      setSelectedPlayMode("star");
    } else if (mode === "fan") {
      setSelectedPlayMode("fan");
    }
  }, [mode, equippedStar]);

  const refetchAll = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchMe(),
        refetchPersona(),
        refetchQuests(),
        refetchPlayMode(),
        refetchFeed(),
        refetchClan(),
        refetchClanRank(),
        refetchWars(),
        refetchPersonaRanking(),
        refetchFanRanking(),
        refetchStarRanking(),
        refetchBattleRanking(),
        refetchRequests(),
        queryClient.invalidateQueries({ queryKey: dailyTalkRewardStatusQueryKey }),
        queryClient.invalidateQueries({ queryKey: pvtWalletQueryKey }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    refetchMe,
    refetchPersona,
    refetchQuests,
    refetchPlayMode,
    refetchFeed,
    refetchClan,
    refetchClanRank,
    refetchWars,
    refetchPersonaRanking,
    refetchFanRanking,
    refetchStarRanking,
    refetchBattleRanking,
    refetchRequests,
    queryClient,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      refetchMe();
      refetchPersona();
      refetchQuests();
      refetchPlayMode();
      refetchFeed();
      refetchClan();
      refetchClanRank();
      refetchWars();
      refetchPersonaRanking();
      refetchFanRanking();
      refetchStarRanking();
      refetchBattleRanking();
      refetchRequests();
      void queryClient.invalidateQueries({ queryKey: dailyTalkRewardStatusQueryKey });
      void queryClient.invalidateQueries({ queryKey: pvtWalletQueryKey });
    }, [
      refetchMe,
      refetchPersona,
      refetchQuests,
      refetchPlayMode,
      refetchFeed,
      refetchClan,
      refetchClanRank,
      refetchWars,
      refetchPersonaRanking,
      refetchFanRanking,
      refetchStarRanking,
      refetchBattleRanking,
      refetchRequests,
      queryClient,
    ]),
  );

  const hasRequests = incomingRequests.length > 0;

  const dailyQuests = quests
    .filter((q) => q.type === "daily")
    .slice(0, 3);
  const allDailyDone =
    dailyQuests.length > 0 && dailyQuests.every((q) => q.completed);

  const ontologyProfile = (persona as typeof persona & { ontologyProfile?: PersonaOntologyProfile | null } | undefined)?.ontologyProfile ?? null;
  const syncEvidence = ontologyProfile?.evidenceSummary?.slice(0, 3) ?? [];
  const syncSignals = ontologyProfile
    ? Array.from(new Set([
        ...(ontologyProfile.communicationStyles ?? []),
        ...(ontologyProfile.traitTags ?? []),
        ...(ontologyProfile.capabilities ?? []),
        ...(ontologyProfile.conflictStyles ?? []),
      ])).slice(0, 3)
    : [];

  const clan = myClan?.clan;
  const clanRank = clanRanking?.myClanRank?.rank;
  const activeWar = wars[0];
  const rankItems = battleRankingData?.items?.slice(0, 5) ?? [];
  const latestFeedPosts = feedPosts.slice(0, 2);
  const starStage = equippedStar ? starStageLabel(equippedStar.stage) : null;
  const activePlayMode = selectedPlayMode;
  const activeLevel = activePlayMode === "star" ? equippedStar?.level ?? 1 : fanProfile?.level ?? 1;
  const activeXp = activePlayMode === "star" ? equippedStar?.xp ?? 0 : fanProfile?.xp ?? 0;
  const activeXpLabel = activePlayMode === "star" ? "STAR XP" : "FAN XP";
  const activeXpFloor = xpToReachLevel(activeLevel);
  const activeXpForNext = xpToReachLevel(activeLevel + 1) - activeXpFloor;
  const activeXpInto = Math.max(0, activeXp - activeXpFloor);
  const activeXpProgress = Math.min(100, Math.round((activeXpInto / (activeXpForNext || 1)) * 100));
  const activeCardStatus = activePlayMode === "star"
    ? equippedStar
      ? `${equippedStar.displayName} 보유`
      : starUnlocked
        ? "NFT 장착 필요"
        : "NFT 등록 필요"
    : "FAN 모드";
  const activeCardBgImage = FAN_CARD_BG_IMAGE;
  const activeImageSource = activePlayMode === "fan"
    ? FAN_CHARACTER_IMAGE
    : equippedStar?.imageUrl
      ? { uri: equippedStar.imageUrl }
      : STAR_CHARACTER_IMAGE;
  const activeStats = activePlayMode === "star"
    ? [
        { label: "매력", value: equippedStar?.stats.charm ?? 0, icon: "heart" as const, color: "#F472B6" },
        { label: "무대감", value: equippedStar?.stats.stagePresence ?? 0, icon: "star" as const, color: "#A78BFA" },
        { label: "유대", value: equippedStar?.stats.bond ?? 0, icon: "message-circle" as const, color: "#38BDF8" },
        { label: "세계관", value: equippedStar?.stats.lore ?? 0, icon: "book-open" as const, color: "#FACC15" },
      ]
    : [
        { label: "친밀도", value: fanProfile?.level ?? 1, icon: "heart" as const, color: "#F472B6" },
        { label: "팬심", value: fanProfile?.stats.fanPower ?? 0, icon: "star" as const, color: "#A78BFA" },
        { label: "응원력", value: fanProfile?.stats.supportPower ?? 0, icon: "volume-2" as const, color: "#38BDF8" },
        { label: "공감력", value: fanProfile?.stats.empathy ?? 0, icon: "message-circle" as const, color: "#5EEAD4" },
        { label: "스토리", value: fanProfile?.stats.story ?? 0, icon: "book-open" as const, color: "#FACC15" },
      ];
  const openStarRegistration = () => {
    router.push({ pathname: "/(tabs)/persona", params: { focus: "star-nft" } } as never);
  };
  const handleModeSelect = (nextMode: PlayModeChoice) => {
    setSelectedPlayMode(nextMode);
    if (nextMode === "star" && (!starUnlocked || !equippedStar)) {
      return;
    }
    void setMode(nextMode);
  };
  const playPrimaryLabel = activePlayMode === "star"
    ? equippedStar
      ? "STAR 미션"
      : starUnlocked
        ? "NFT 장착하기"
        : "NFT 등록하기"
    : "응원하기";
  const playPrimaryIcon: keyof typeof Feather.glyphMap = activePlayMode === "star"
    ? equippedStar
      ? "compass"
      : "star"
    : "heart";
  const handlePlayPrimaryPress = () => {
    if (activePlayMode === "star") {
      if (equippedStar) {
        router.push("/(tabs)/dungeon" as never);
      } else {
        openStarRegistration();
      }
      return;
    }
    router.push("/(tabs)/feed" as never);
  };
  const handleOpenBibiChat = async () => {
    try {
      const result = await openBibiOfficialRoom.mutateAsync();
      router.push({ pathname: "/chat/[id]", params: { id: result.room.id } });
    } catch {
      router.push("/(tabs)/chats" as never);
    }
  };
  const todayMissions = [
    {
      key: "daily_battle",
      title: "오늘의 토크베틀",
      description: "AI 상대와 주제로 대결하고\n승부를 기록해요",
      icon: "zap" as const,
      color: "#A855F7",
      gradient: ["rgba(64,16,112,0.86)", "rgba(14,5,35,0.98)", "rgba(5,4,18,1)"] as const,
      onPress: () => router.push("/(tabs)/battle" as never),
    },
    {
      key: "daily_clan",
      title: "팬 응원하기",
      description: "비비에게 응원의\n메시지를 보내요",
      icon: "heart" as const,
      color: "#F04CCB",
      gradient: ["rgba(85,8,73,0.66)", "rgba(13,5,28,0.98)", "rgba(5,4,18,1)"] as const,
      onPress: () => router.push("/(tabs)/feed" as never),
    },
    {
      key: "daily_dungeon",
      title: "성장 재료 수집",
      description: "STAR 미션으로 성장\n재료를 모아요",
      icon: "target" as const,
      color: "#35E6E0",
      gradient: ["rgba(0,66,83,0.68)", "rgba(4,15,35,0.98)", "rgba(5,4,18,1)"] as const,
      onPress: () => router.push("/(tabs)/dungeon" as never),
    },
  ];
  const showLegacyHomeSections: boolean = false;
  const rankSummaries = [
    { scope: "persona" as const, result: personaRankingData },
    { scope: "fan" as const, result: fanRankingData },
    { scope: "star" as const, result: starRankingData },
    { scope: "battle" as const, result: battleRankingData },
  ];

  return (
    <NeonBackdrop style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.brand}>Another Me</Text>
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
        {/* FAN / STAR growth card */}
        <View style={styles.playCard}>
          <ExpoImage
            source={activeCardBgImage}
            style={[StyleSheet.absoluteFill, styles.playCardBg]}
            contentFit="cover"
          />
          <LinearGradient
            colors={["rgba(9,6,28,0.62)", "rgba(17,9,45,0.34)", "rgba(6,5,20,0.82)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.playCardHeader}>
            <View style={styles.modeSwitchWrap}>
              <Pressable
                onPress={() => handleModeSelect("star")}
                disabled={isChangingMode}
                style={[
                  styles.modeSwitchChip,
                  activePlayMode === "star" && styles.modeSwitchChipActive,
                ]}
              >
                <Feather name="star" size={13} color={activePlayMode === "star" ? "#fff" : "#8E85B7"} />
                <Text style={[styles.modeSwitchText, activePlayMode === "star" && styles.modeSwitchTextActive]}>STAR</Text>
              </Pressable>
              <Pressable
                onPress={() => handleModeSelect("fan")}
                disabled={isChangingMode}
                style={[
                  styles.modeSwitchChip,
                  activePlayMode === "fan" && styles.modeSwitchChipActive,
                ]}
              >
                <Feather name="heart" size={13} color={activePlayMode === "fan" ? "#fff" : "#8E85B7"} />
                <Text style={[styles.modeSwitchText, activePlayMode === "fan" && styles.modeSwitchTextActive]}>FAN</Text>
              </Pressable>
            </View>
            <View style={styles.playStatusWrap}>
              <Text style={styles.playStatusText}>{activeCardStatus}</Text>
              <Feather name="info" size={13} color="#8E85B7" />
            </View>
          </View>

          <View style={styles.playCardBody}>
            <View style={styles.playInfoCol}>
              <Text style={styles.playLevel}>Lv. {activeLevel}</Text>
              <View style={styles.playXpTrack}>
                <View style={[styles.playXpFill, { width: `${activeXpProgress}%` }]} />
              </View>
              <Text style={styles.playXpText}>
                {activeXpInto.toLocaleString()} / {activeXpForNext.toLocaleString()} {activeXpLabel}
              </Text>

              <View style={styles.playStatList}>
                {activeStats.map((stat) => (
                  <View key={stat.label} style={styles.playStatRow}>
                    <Feather name={stat.icon} size={18} color={stat.color} />
                    <Text style={styles.playStatLabel}>{stat.label}</Text>
                    <Text style={styles.playStatValue}>{stat.value.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.playCharacterCol, activePlayMode === "star" && styles.playCharacterColStar]}>
              {activeImageSource ? (
                <>
                  <View style={styles.playOrbitOuter} />
                  <View style={styles.playOrbitInner} />
                  <View style={styles.playCharacterGlow} />
                  <ExpoImage
                    source={activeImageSource}
                    style={activePlayMode === "star" ? styles.playStarImage : styles.playFanImage}
                    contentFit="contain"
                    contentPosition="center"
                  />
                </>
              ) : (
                <View style={styles.playFallbackAvatar}>
                  <Feather name="heart" size={52} color="#E8DDFF" />
                </View>
              )}
              <View style={styles.playPlatform} />
            </View>
          </View>

          <View style={styles.playCardActions}>
            <Pressable
              onPress={() => router.push("/profile/ranking")}
              style={({ pressed }) => [styles.playActionGhost, { opacity: pressed ? 0.72 : 1 }]}
            >
              <Feather name="bar-chart-2" size={15} color="#E8DDFF" />
              <Text style={styles.playActionGhostText}>상세 성장 리포트</Text>
              <Feather name="chevron-right" size={15} color="#8E85B7" />
            </Pressable>
            <Pressable
              onPress={handlePlayPrimaryPress}
              style={({ pressed }) => [styles.playActionPrimary, { opacity: pressed ? 0.86 : 1 }]}
            >
              <Feather name={playPrimaryIcon} size={15} color="#fff" />
              <Text style={styles.playActionPrimaryText} numberOfLines={1}>
                {playPrimaryLabel}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Daily quests */}
        <View style={styles.missionSection}>
          <View style={styles.cardHeader}>
            <Text style={styles.missionSectionTitle}>오늘의 미션</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="비비와의 대화 바로가기"
              onPress={() => void handleOpenBibiChat()}
              style={({ pressed }) => [styles.bibiChatShortcut, { opacity: pressed ? 0.72 : 1 }]}
            >
              <LinearGradient
                colors={["rgba(18,17,49,0.98)", "rgba(8,7,25,0.98)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bibiChatShortcutInner}
              >
                <Feather name="message-circle" size={16} color="#B8A8FF" />
                <Text style={styles.bibiChatShortcutText}>비비와의 대화</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <View style={styles.questRow}>
            {todayMissions.map((mission, index) => {
              const quest = dailyQuests.find((item) => item.key === mission.key);
              const progress = quest?.progress ?? 0;
              const target = quest?.target ?? (mission.key === "daily_dungeon" ? 3 : 1);
              const ratio = Math.min(100, Math.round((progress / Math.max(target, 1)) * 100));
              return (
                <Pressable
                  key={mission.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${mission.title} 바로가기`}
                  onPress={mission.onPress}
                  style={({ pressed }) => [styles.missionCard, { borderColor: `${mission.color}66`, opacity: pressed ? 0.78 : 1 }]}
                >
                  <LinearGradient
                    pointerEvents="none"
                    colors={mission.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.82, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    {MISSION_STAR_POINTS.map((star, starIndex) => (
                      <View
                        key={starIndex}
                        style={[
                          styles.missionStar,
                          {
                            left: star.left,
                            top: star.top,
                            width: star.size,
                            height: star.size,
                            opacity: star.opacity,
                            backgroundColor: mission.color,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <View style={[styles.missionIconGlow, { backgroundColor: `${mission.color}20` }]}>
                    <Feather name={mission.icon} size={21} color={mission.color} />
                  </View>
                  <Text style={styles.missionTitle}>{mission.title}</Text>
                  <Text style={styles.missionDescription}>{mission.description}</Text>
                  <View style={styles.missionTrack}>
                    <View style={[styles.missionFill, { width: `${ratio}%`, backgroundColor: mission.color }]} />
                  </View>
                  <Text style={styles.missionProgress}>{progress} / {target}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="토로미아 문으로 가기"
          onPress={() => router.push("/(tabs)/dungeon" as never)}
          style={({ pressed }) => [styles.torimiaBanner, { opacity: pressed ? 0.84 : 1 }]}
        >
          <LinearGradient
            colors={["#150827", "#090518", "#12113A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <ExpoImage
            source={TORIMIA_PORTAL_SCENE_IMAGE}
            style={styles.torimiaPortalScene}
            contentFit="contain"
            contentPosition="left center"
          />
          <View style={styles.torimiaCopy}>
            <Text style={styles.torimiaTitle}>토로미아로 가는 첫 걸음</Text>
            <Text style={styles.torimiaBody}>성장을 완료한 비비는{`\n`}토로미아 세계로 진입할 수 있어요.</Text>
            <View style={styles.torimiaButton}>
              <Text style={styles.torimiaButtonText}>토로미아 문으로 가기</Text>
              <Feather name="chevron-right" size={16} color="#EADFFF" />
            </View>
          </View>
        </Pressable>

        {/* Recent Another Me sync changes */}
        {showLegacyHomeSections && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              오늘 동기화 효과
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => router.push("/(tabs)/persona")}
              style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                동기화 기록 보기
              </Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {!ontologyProfile || syncEvidence.length === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              Talk to Earn 보상을 받으면 원문 없이 오늘 대화 요약이 Another Me에 반영돼요.
            </Text>
          ) : (
            <>
              <View style={[styles.syncPreviewBox, { backgroundColor: colors.muted }]}>
                <View style={[styles.syncPreviewIcon, { backgroundColor: `${colors.primary}18` }]}>
                  <Feather name="cpu" size={16} color={colors.primary} />
                </View>
                <View style={styles.syncPreviewBody}>
                  <Text style={[styles.syncPreviewTitle, { color: colors.foreground }]}>Another Me 신뢰도 {ontologyProfile.confidence}%</Text>
                  <Text style={[styles.syncPreviewSub, { color: colors.mutedForeground }]}>최근 요약과 평가가 반영된 상태예요.</Text>
                </View>
              </View>
              {syncSignals.length > 0 ? (
                <View style={styles.syncChipRow}>
                  {syncSignals.map((item) => (
                    <View key={item} style={[styles.syncChip, { backgroundColor: `${colors.primary}14` }]}>
                      <Text style={[styles.syncChipText, { color: colors.primary }]}>+ {item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {syncEvidence.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.syncEvidenceRow}>
                  <View style={[styles.syncEvidenceDot, { backgroundColor: index === 0 ? colors.primary : colors.border }]} />
                  <Text style={[styles.syncEvidenceText, { color: colors.mutedForeground }]} numberOfLines={2}>{item}</Text>
                </View>
              ))}
            </>
          )}
        </View>
        )}

        {/* STAR status */}
        {showLegacyHomeSections && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>STAR 진행 상태</Text>
            <Pressable
              hitSlop={8}
              onPress={() => router.push(equippedStar ? "/(tabs)/dungeon" : "/(tabs)/persona")}
              style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                {equippedStar ? "미션으로" : "인증/장착"}
              </Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {equippedStar ? (
            <View style={styles.starStatusWrap}>
              <View style={[styles.starAvatar, { backgroundColor: `${colors.primary}18` }]}>
                {equippedStar.imageUrl ? (
                  <ExpoImage source={{ uri: equippedStar.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Feather name="star" size={22} color="#FBBF24" />
                )}
              </View>
              <View style={styles.starStatusBody}>
                <Text style={[styles.starStatusTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {equippedStar.displayName} · {starStage}
                </Text>
                <Text style={[styles.starStatusSub, { color: colors.mutedForeground }]}>
                  Lv.{equippedStar.level} · {equippedStar.xp.toLocaleString()} STAR XP
                </Text>
                <View style={styles.starStatRow}>
                  {STAR_STAT_META.map((stat) => (
                    <View key={stat.key} style={[styles.starStatChip, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.starStatValue, { color: colors.foreground }]}>
                        {equippedStar.stats[stat.key]}
                      </Text>
                      <Text style={[styles.starStatLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.starEmptyRow}>
              <View style={[styles.starEmptyIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Feather name="star" size={20} color={colors.primary} />
              </View>
              <View style={styles.starStatusBody}>
                <Text style={[styles.starStatusTitle, { color: colors.foreground }]}>STAR NFT 장착이 필요해요</Text>
                <Text style={[styles.starStatusSub, { color: colors.mutedForeground }]}>
                  STAR NFT를 인증하면 연습생 STAR 미션과 캐릭터 랭킹이 열립니다.
                </Text>
              </View>
            </View>
          )}
        </View>
        )}

        {/* Feed spotlight */}
        {showLegacyHomeSections && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>공개 성장 기록</Text>
            <Pressable
              hitSlop={8}
              onPress={() => router.push("/(tabs)/feed" as never)}
              style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={[styles.moreText, { color: colors.mutedForeground }]}>피드 보기</Text>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {latestFeedPosts.length > 0 ? (
            <View style={styles.feedList}>
              {latestFeedPosts.map((post) => (
                <View key={post.id} style={[styles.feedPreview, { borderColor: colors.border }]}>
                  <Text style={[styles.feedKind, { color: post.kind === "star" ? "#FBBF24" : colors.primary }]}>
                    {feedKindLabel(post.kind)}
                  </Text>
                  <Text style={[styles.feedTitle, { color: colors.foreground }]} numberOfLines={1}>{post.title}</Text>
                  <Text style={[styles.feedBody, { color: colors.mutedForeground }]} numberOfLines={2}>{post.body}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Pressable
              onPress={() => router.push("/(tabs)/feed" as never)}
              style={({ pressed }) => [styles.feedEmpty, { borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}
            >
              <Feather name="edit-3" size={18} color={colors.primary} />
              <Text style={[styles.feedEmptyText, { color: colors.foreground }]}>첫 FAN 응원글을 남겨보세요</Text>
              <Text style={[styles.feedEmptySub, { color: colors.mutedForeground }]}>토크배틀과 STAR 활동이 피드 기록으로 이어집니다.</Text>
            </Pressable>
          )}
        </View>
        )}

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
                소속 팬클럽
              </Text>
              <View style={styles.moreBtn}>
                <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                  팬클럽 홈으로
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
                  팬클럽 레벨 {clan.level} · {clan.exp.toLocaleString()} Clan EXP
                </Text>
              </View>
              {clanRank ? (
                <View style={styles.clanRankBox}>
                  <Text style={[styles.clanRankValue, { color: colors.foreground }]}>
                    {clanRank}위
                  </Text>
                  <Text style={[styles.clanRankLabel, { color: colors.mutedForeground }]}>
                    팬클럽 랭킹
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
                진행 중인 팬클럽전
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
                  {activeWar.challengerClanName ?? "우리 팬클럽"}
                </Text>
                <Text style={[styles.warScore, { color: colors.primary }]}>
                  {activeWar.challengerScore}
                </Text>
              </View>
              <Text style={[styles.warVs, { color: colors.mutedForeground }]}>VS</Text>
              <View style={styles.warSide}>
                <Text style={[styles.warSideLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {activeWar.opponentClanName ?? "상대 팬클럽"}
                </Text>
                <Text style={[styles.warScore, { color: colors.foreground }]}>
                  {activeWar.opponentScore}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {/* Cumulative top ranking */}
        {rankItems.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                토크배틀 TOP 랭킹
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
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(157, 99, 255, 0.18)",
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  brand: { color: neon.cyan, fontFamily: "Inter_800ExtraBold", fontSize: 24, marginBottom: 18, letterSpacing: -0.7, textShadowColor: "rgba(125,211,252,0.38)", textShadowRadius: 12 },
  greeting: { fontSize: 22, fontFamily: "Inter_500Medium", letterSpacing: -0.5 },
  greetingSub: { fontSize: 13.5, fontFamily: "Inter_500Medium", marginTop: 7 },
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

  scrollContent: { paddingHorizontal: 16, gap: 18 },

  // FAN / STAR growth card
  playCard: {
    minHeight: 382,
    borderRadius: 24,
    overflow: "hidden",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(170,78,255,0.58)",
    backgroundColor: "#090717",
  },
  playCardBg: { opacity: 0.9 },
  playCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modeSwitchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 3,
    backgroundColor: "rgba(10,8,28,0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(139,92,246,0.28)",
  },
  modeSwitchChip: {
    minWidth: 66,
    height: 30,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  modeSwitchChipActive: { backgroundColor: "#6D35F6" },
  modeSwitchText: { color: "#8E85B7", fontSize: 11, fontFamily: "Inter_800ExtraBold" },
  modeSwitchTextActive: { color: "#fff" },
  playStatusWrap: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  playStatusText: { color: "#B8AFD7", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  playCardBody: { flex: 1, flexDirection: "row", marginTop: 12 },
  playInfoCol: { width: "43%", zIndex: 3, paddingLeft: 3 },
  playLevel: { color: "#fff", fontSize: 43, fontFamily: "Inter_800ExtraBold", letterSpacing: -1.6, textShadowColor: "rgba(255,255,255,0.25)", textShadowRadius: 8 },
  playXpTrack: {
    height: 8,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.10)",
    marginTop: 8,
  },
  playXpFill: { height: "100%", borderRadius: 6, backgroundColor: "#8B5CF6" },
  playXpText: { color: "#A79ACB", fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 7 },
  playStatList: { marginTop: 22, gap: 14 },
  playStatRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  playStatLabel: { flex: 1, color: "#D9D3EB", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  playStatValue: { color: "#fff", fontSize: 14, fontFamily: "Inter_800ExtraBold" },
  playCharacterCol: {
    flex: 1,
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginTop: -8,
    marginRight: -14,
  },
  playCharacterColStar: { marginTop: -12 },
  playOrbitOuter: {
    position: "absolute",
    width: 188,
    height: 188,
    borderRadius: 94,
    borderWidth: 2,
    borderColor: "rgba(139,92,246,0.42)",
  },
  playOrbitInner: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(216,180,254,0.34)",
  },
  playCharacterGlow: {
    position: "absolute",
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: "rgba(109,53,246,0.28)",
  },
  playStarImage: { width: 178, height: 244, marginRight: -8, marginTop: -2, zIndex: 2 },
  playFanImage: { width: 236, height: 304, marginRight: -16, marginTop: -18, zIndex: 2 },
  playFallbackAvatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.24)",
    borderWidth: 2,
    borderColor: "rgba(216,180,254,0.62)",
  },
  playPlatform: {
    position: "absolute",
    bottom: 14,
    width: 142,
    height: 32,
    borderRadius: 71,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.62)",
    backgroundColor: "rgba(109,53,246,0.16)",
  },
  playCardActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  playActionGhost: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(216,180,254,0.22)",
  },
  playActionGhostText: { color: "#E8DDFF", fontSize: 12.5, fontFamily: "Inter_700Bold" },
  playActionPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#6D35F6",
  },
  playActionPrimaryText: { color: "#fff", fontSize: 12.5, fontFamily: "Inter_800ExtraBold" },
  rankSummaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rankSummaryCell: { width: "48.5%", borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 4 },
  rankSummaryTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  rankSummaryLabel: { fontSize: 12, fontFamily: "Inter_700Bold" },
  rankSummaryValue: { fontSize: 18, fontFamily: "Inter_800ExtraBold" },
  rankSummaryScore: { fontSize: 11, fontFamily: "Inter_500Medium" },

  // Generic card
  card: {
    borderRadius: 18,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold" },
  moreBtn: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 2 },
  moreText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyHint: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
    paddingVertical: 6,
  },

  // Quests
  missionSection: {
    gap: 2,
  },
  missionSectionTitle: {
    flex: 1,
    color: "#C9C2D8",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  missionMoreText: { color: "#A9A3BA", fontSize: 13, fontFamily: "Inter_500Medium" },
  bibiChatShortcut: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(141,113,255,0.26)",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  bibiChatShortcutInner: {
    minHeight: 36,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bibiChatShortcutText: { color: "#CEC7E4", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  questRow: { flexDirection: "row", gap: 8 },
  missionCard: {
    flex: 1,
    minHeight: 148,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 9,
    backgroundColor: "#080519",
    overflow: "hidden",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 4,
  },
  missionStar: { position: "absolute", borderRadius: 4 },
  missionIconGlow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
  },
  missionTitle: {
    color: "#F7F5FF",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  missionDescription: {
    minHeight: 30,
    color: "#A9A3BA",
    fontSize: 9.5,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 13,
    marginTop: 4,
  },
  missionTrack: {
    width: "100%",
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    marginTop: 6,
  },
  missionFill: { height: "100%", borderRadius: 3 },
  missionProgress: { color: "#A9A3BA", fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 4 },
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

  // Torimia gateway banner
  torimiaBanner: {
    minHeight: 164,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(157,99,255,0.52)",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    padding: 0,
    backgroundColor: "#070512",
  },
  torimiaPortalScene: {
    width: "46%",
    alignSelf: "stretch",
    backgroundColor: "#05030F",
  },
  torimiaPortal: {
    width: "42%",
    maxWidth: 160,
    height: 154,
    borderTopLeftRadius: 76,
    borderTopRightRadius: 76,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 5,
    borderColor: "rgba(124,58,237,0.88)",
    padding: 8,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 10,
  },
  torimiaPortalInner: {
    flex: 1,
    borderTopLeftRadius: 62,
    borderTopRightRadius: 62,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(216,180,254,0.6)",
    backgroundColor: "rgba(88,28,135,0.2)",
  },
  torimiaCopy: { flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 16 },
  torimiaTitle: { color: "#D884FF", fontSize: 18, fontFamily: "Inter_800ExtraBold", lineHeight: 24 },
  torimiaBody: { color: "#A9A3BA", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 8 },
  torimiaButton: {
    minHeight: 40,
    alignSelf: "stretch",
    marginTop: 14,
    paddingHorizontal: 13,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(97,34,170,0.38)",
    borderWidth: 1,
    borderColor: "rgba(157,99,255,0.55)",
  },
  torimiaButtonText: { color: "#EADFFF", fontSize: 11.5, fontFamily: "Inter_700Bold" },

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

  // Another Me sync preview
  syncPreviewBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    gap: 11,
    padding: 12,
  },
  syncPreviewIcon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 },
  syncPreviewBody: { flex: 1, gap: 2, minWidth: 0 },
  syncPreviewTitle: { flexShrink: 1, fontSize: 14, fontFamily: "Inter_800ExtraBold" },
  syncPreviewSub: { flexShrink: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  syncChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  syncChip: { borderRadius: 999, flexShrink: 1, maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 6 },
  syncChipText: { flexShrink: 1, fontSize: 12, fontFamily: "Inter_700Bold", lineHeight: 17 },
  syncEvidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingTop: 10,
  },
  syncEvidenceDot: { borderRadius: 4, height: 8, marginTop: 5, width: 8 },
  syncEvidenceText: { flex: 1, fontSize: 12.5, fontFamily: "Inter_500Medium", lineHeight: 18 },

  // STAR status
  starStatusWrap: { flexDirection: "row", gap: 12 },
  starAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  starStatusBody: { flex: 1 },
  starStatusTitle: { fontSize: 15, fontFamily: "Inter_800ExtraBold" },
  starStatusSub: { fontSize: 12.5, fontFamily: "Inter_500Medium", marginTop: 3, lineHeight: 18 },
  starStatRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  starStatChip: { flex: 1, borderRadius: 10, paddingVertical: 7, alignItems: "center", gap: 1 },
  starStatValue: { fontSize: 13, fontFamily: "Inter_800ExtraBold" },
  starStatLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  starEmptyRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  starEmptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  // Feed
  feedList: { gap: 8 },
  feedPreview: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 12 },
  feedKind: { fontSize: 11, fontFamily: "Inter_800ExtraBold", marginBottom: 4 },
  feedTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  feedBody: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17, marginTop: 4 },
  feedEmpty: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, alignItems: "center", gap: 5 },
  feedEmptyText: { fontSize: 14, fontFamily: "Inter_800ExtraBold" },
  feedEmptySub: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 17 },

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
