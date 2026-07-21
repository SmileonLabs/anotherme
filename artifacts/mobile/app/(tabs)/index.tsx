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
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClanRankings,
  useGetMe,
  useGetMyClan,
  useGetMyPersona,
  useGetMyQuests,
  useListClanWars,
  useListIncomingFriendRequests,
} from "@workspace/api-client-react";
import { NeonBackdrop } from "@/components/NeonUI";
import { neon } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { dailyTalkRewardStatusQueryKey } from "@/hooks/useDailyTalkReward";
import { usePlayMode } from "@/hooks/usePlayMode";
import { pvtWalletQueryKey } from "@/hooks/usePvtWallet";
import { useStarFeed, type StarFeedPost } from "@/hooks/useStarFeed";
import { useMediaUri } from "@/hooks/useMediaUri";
import { useCharacterProfiles } from "@/hooks/useCharacterProfiles";
import { FAN_STAT_META } from "@/constants/fanStats";

const BONUS_GRADIENT = ["#3B2A6B", "#5B3FA0"] as const;
const FAN_CHARACTER_IMAGE = require("../../assets/images/fan-slime.png");
const STAR_CHARACTER_IMAGE = require("../../assets/images/star-character-cutout.png");
const STAR_RANDOM_BOX_IMAGE = require("../../assets/images/star-random-box.png");
const TORIMIA_PORTAL_SCENE_IMAGE = require("../../assets/images/torimia-portal-scene.png");

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

type PlayModeChoice = "fan" | "star";

interface PersonaOntologyProfile {
  evidenceSummary: string[];
  traitTags?: string[];
  communicationStyles?: string[];
  capabilities?: string[];
  conflictStyles?: string[];
  confidence: number;
}

const STAR_STAT_META = [
  { key: "charm", label: "매력" },
  { key: "stagePresence", label: "무대감" },
  { key: "bond", label: "유대" },
  { key: "lore", label: "세계관" },
] as const;

function starStageLabel(stage: "aspiring" | "promoted" | undefined): string {
  if (stage === "promoted") return "공식 STAR";
  return "연습생 STAR";
}

function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * (level - 1) * level;
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

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { refetch: refetchMe } = useGetMe();
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
  const { activeProfile, profiles: characterProfiles, activateProfile } = useCharacterProfiles();
  const equippedStarImageUri = useMediaUri(equippedStar?.imageUrl);
  const { posts: feedPosts, refetch: refetchFeed } = useStarFeed();
  const { data: myClan, refetch: refetchClan } = useGetMyClan();
  const { data: clanRanking, refetch: refetchClanRank } = useGetClanRankings({
    type: "overall",
  });
  const { data: wars = [], refetch: refetchWars } = useListClanWars({
    status: "active",
  });
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
  const latestFeedPosts = feedPosts.slice(0, 2);
  const starStage = equippedStar ? starStageLabel(equippedStar.stage) : null;
  const activePlayMode = selectedPlayMode;
  const starLocked = activePlayMode === "star" && !equippedStar;
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
    : "FAN · 응원 중인 STAR 없음";
  const activeImageSource = activePlayMode === "fan"
    ? FAN_CHARACTER_IMAGE
    : equippedStarImageUri
      ? { uri: equippedStarImageUri }
      : STAR_RANDOM_BOX_IMAGE;
  const activeStats = activePlayMode === "star"
    ? [
        { label: "매력", value: equippedStar?.stats.charm ?? 0, icon: "heart" as const, color: "#F472B6" },
        { label: "무대감", value: equippedStar?.stats.stagePresence ?? 0, icon: "star" as const, color: "#A78BFA" },
        { label: "유대", value: equippedStar?.stats.bond ?? 0, icon: "message-circle" as const, color: "#38BDF8" },
        { label: "세계관", value: equippedStar?.stats.lore ?? 0, icon: "book-open" as const, color: "#FACC15" },
      ]
    : FAN_STAT_META.map((stat) => ({ ...stat, value: fanProfile?.stats[stat.key] ?? 0 }));
  const openStarRegistration = () => {
    router.push({ pathname: "/(tabs)/persona", params: { focus: "star-nft" } } as never);
  };
  const handleModeSelect = (nextMode: PlayModeChoice) => {
    setSelectedPlayMode(nextMode);
    if (nextMode === "star" && (!starUnlocked || !equippedStar)) {
      return;
    }
    const candidate = nextMode === "star"
      ? characterProfiles.find((profile) => profile.id === equippedStar?.id && profile.status === "active")
      : characterProfiles.find((profile) => profile.type === "fan" && profile.status === "active");
    if (candidate && candidate.id !== activeProfile?.id) {
      void activateProfile(candidate.id);
    } else {
      void setMode(nextMode);
    }
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
  const todayMissions = [
    {
      key: "daily_battle",
      title: "오늘의 토크베틀",
      icon: "zap" as const,
      color: "#A855F7",
      gradient: ["rgba(64,16,112,0.86)", "rgba(14,5,35,0.98)", "rgba(5,4,18,1)"] as const,
      onPress: () => router.push("/(tabs)/battle" as never),
    },
    {
      key: "daily_clan",
      title: "팬들의 이야기가 모이는 피드",
      icon: "heart" as const,
      color: "#F04CCB",
      gradient: ["rgba(85,8,73,0.66)", "rgba(13,5,28,0.98)", "rgba(5,4,18,1)"] as const,
      onPress: () => router.push("/(tabs)/feed" as never),
    },
    {
      key: "daily_dungeon",
      title: "성장 재료 수집",
      icon: "target" as const,
      color: "#35E6E0",
      gradient: ["rgba(0,66,83,0.68)", "rgba(4,15,35,0.98)", "rgba(5,4,18,1)"] as const,
      onPress: () => router.push("/(tabs)/dungeon" as never),
    },
  ];
  const showLegacyHomeSections: boolean = false;
  return (
    <NeonBackdrop style={styles.container}>
      <CustomScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 100 },
        ]}
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
          <View style={[styles.playCardHeader, starLocked && styles.playCardHeaderLocked]}>
            <View style={styles.playHeaderTopRow}>
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
              <Pressable
                accessibilityLabel="설정"
                hitSlop={8}
                onPress={() => router.push("/settings")}
                style={({ pressed }) => [styles.playHeaderIcon, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Feather name="settings" size={18} color="#E8DDFF" />
              </Pressable>
            </View>
            <View style={styles.playStatusWrap}>
              <Text style={styles.playStatusText} numberOfLines={1}>{activeCardStatus}</Text>
              <Pressable
                accessibilityLabel="알림"
                hitSlop={8}
                onPress={() => router.push("/friends/requests")}
                style={({ pressed }) => [styles.playHeaderIcon, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Feather name="bell" size={18} color="#E8DDFF" />
                {hasRequests ? <View style={styles.iconDot} /> : null}
              </Pressable>
            </View>
          </View>

          <View style={[styles.playCardBody, starLocked && styles.playCardBodyLocked]}>
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
            </View>
            {starLocked ? (
              <View pointerEvents="none" style={styles.starLockOverlay}>
                <View style={styles.starLockBadge}>
                  <Feather name="lock" size={14} color="#E9D5FF" />
                  <Text style={styles.starLockText}>NFT 등록 후 이용 가능</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.playCardActions}>
            <Pressable
              disabled
              accessibilityState={{ disabled: true }}
              style={[styles.playActionPrimary, styles.playActionDisabled]}
            >
              <Feather name={playPrimaryIcon} size={15} color="#fff" />
              <Text style={styles.playActionPrimaryText} numberOfLines={1}>
                {playPrimaryLabel}
              </Text>
            </Pressable>
            <Pressable
              disabled
              accessibilityState={{ disabled: true }}
              style={[styles.playActionGhost, styles.playActionDisabled]}
            >
              <Feather name="bar-chart-2" size={15} color="#E8DDFF" />
              <Text style={styles.playActionGhostText}>상세 성장 리포트</Text>
              <Feather name="chevron-right" size={15} color="#8E85B7" />
            </Pressable>
          </View>
        </View>

        {/* Daily quests */}
        <View style={styles.missionSection}>
          <View style={styles.missionHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="미션 더보기"
              onPress={() => router.push("/(tabs)/dungeon" as never)}
              style={({ pressed }) => [styles.missionMore, pressed && { opacity: 0.65 }]}
            >
              <Text style={styles.missionMoreText}>미션 더보기</Text>
              <Feather name="chevron-right" size={15} color="#BCA7E8" />
            </Pressable>
          </View>
          <View style={styles.questRow}>
            {todayMissions.map((mission) => (
              <Pressable
                key={mission.key}
                disabled
                accessibilityState={{ disabled: true }}
                accessibilityLabel={`${mission.title} 준비 중`}
                style={[styles.missionCard, { borderColor: `${mission.color}66` }]}
              >
                <LinearGradient
                  pointerEvents="none"
                  colors={mission.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.82, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.missionIconGlow, { backgroundColor: `${mission.color}20` }]}>
                  <Feather name={mission.icon} size={18} color={mission.color} />
                </View>
                <Text style={styles.missionTitle} numberOfLines={2}>{mission.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          disabled
          accessibilityState={{ disabled: true }}
          accessibilityLabel="토로미아 콘텐츠 준비 중"
          style={styles.torimiaBanner}
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
                {equippedStarImageUri ? (
                  <ExpoImage source={{ uri: equippedStarImageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
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

      </CustomScrollView>
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  iconDot: {
    position: "absolute",
    top: 2,
    right: 1,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
    borderWidth: 1,
    borderColor: "#000",
  },

  scrollContent: { paddingHorizontal: 16, gap: 12 },

  // FAN / STAR growth card
  playCard: {
    minHeight: 382,
    borderRadius: 24,
    overflow: "hidden",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(170,78,255,0.58)",
    backgroundColor: "#000",
  },
  playCardHeader: { gap: 3 },
  playCardHeaderLocked: { opacity: 0.62 },
  playHeaderTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
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
  playStatusWrap: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5 },
  playStatusText: { flexShrink: 1, color: "#B8AFD7", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  playHeaderIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  playCardBody: { flex: 1, flexDirection: "row", marginTop: 12, position: "relative" },
  playCardBodyLocked: { opacity: 0.62 },
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
  starLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7,5,20,0.22)",
  },
  starLockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: "rgba(30,18,68,0.88)",
    borderWidth: 1,
    borderColor: "rgba(216,180,254,0.46)",
  },
  starLockText: { color: "#E9D5FF", fontSize: 12, fontFamily: "Inter_700Bold" },
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
  playActionDisabled: { opacity: 0.48 },
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
    gap: 0,
  },
  missionHeader: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 },
  missionMore: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
  missionMoreText: { color: "#BCA7E8", fontSize: 12, fontFamily: "Inter_700Bold" },
  questRow: { flexDirection: "row", gap: 8 },
  missionCard: {
    flex: 1,
    minHeight: 82,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 7,
    paddingVertical: 8,
    backgroundColor: "#080519",
    overflow: "hidden",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 4,
  },
  missionIconGlow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
  },
  missionTitle: {
    color: "#F7F5FF",
    fontSize: 10.5,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 14,
  },
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
});
