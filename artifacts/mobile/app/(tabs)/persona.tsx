import { CustomScrollView } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetMe,
  useGetMyPersona,
  useGetMyPersonaCard,
  useGetMyRewardsSummary,
} from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { PersonaCard } from "@/components/PersonaCard";
import { StarLockCard } from "@/components/StarLockCard";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { usePlayMode } from "@/hooks/usePlayMode";
import { useTorimia, type TorimiaRequirement } from "@/hooks/useTorimia";
import { useWalletVerification, type WalletStatus } from "@/hooks/useWalletVerification";
import { usePersonaAnalysis } from "@/hooks/usePersonaAnalysis";
import { gradients, gradientsDark } from "@/constants/colors";

type StatKey =
  | "logic"
  | "empathy"
  | "wit"
  | "knowledge"
  | "conviction"
  | "emotion"
  | "decisiveness";

const STAT_META: {
  key: StatKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}[] = [
  { key: "logic", label: "논리", icon: "cpu", color: "#4F7BF5" },
  { key: "empathy", label: "공감", icon: "heart", color: "#FF6B9D" },
  { key: "wit", label: "위트", icon: "zap", color: "#F5A623" },
  { key: "knowledge", label: "지식", icon: "book-open", color: "#00B488" },
  { key: "conviction", label: "신념", icon: "flag", color: "#7C5CFC" },
  { key: "emotion", label: "감정", icon: "droplet", color: "#FB7185" },
  { key: "decisiveness", label: "결단", icon: "target", color: "#FB923C" },
];

const FAN_STAT_META: {
  key: "fanPower" | "supportPower" | "empathy" | "story";
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}[] = [
  { key: "fanPower", label: "팬 파워", icon: "zap", color: "#7C5CFC" },
  { key: "supportPower", label: "응원력", icon: "heart", color: "#FF6B9D" },
  { key: "empathy", label: "공감", icon: "users", color: "#00B488" },
  { key: "story", label: "스토리", icon: "book-open", color: "#F5A623" },
];

const STAR_STAT_META: {
  key: "charm" | "stagePresence" | "bond" | "lore";
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}[] = [
  { key: "charm", label: "매력", icon: "star", color: "#F59E0B" },
  { key: "stagePresence", label: "무대감", icon: "radio", color: "#4F7BF5" },
  { key: "bond", label: "유대", icon: "link", color: "#00B488" },
  { key: "lore", label: "서사", icon: "book", color: "#7C5CFC" },
];

const STAT_LABELS: Record<StatKey, string> = {
  logic: "논리",
  empathy: "공감",
  wit: "위트",
  knowledge: "지식",
  conviction: "신념",
  emotion: "감정",
  decisiveness: "결단",
};

const SOURCE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  chat: "message-circle",
  battle: "award",
  dungeon: "compass",
  voice: "phone",
  system: "settings",
};

/** "공감 +1, 위트 +1" — readable Korean summary of a growth event's stat deltas. */
function formatStatChanges(changes?: Record<string, number> | null): string {
  if (!changes) return "";
  return Object.entries(changes)
    .filter(([, v]) => (v ?? 0) !== 0)
    .map(([k, v]) => `${STAT_LABELS[k as StatKey] ?? k} +${v}`)
    .join(", ");
}

function formatEventTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function syncStateLabel(state?: "not_started" | "forming" | "synced" | null): string {
  if (state === "synced") return "동기화 안정화";
  if (state === "forming") return "동기화 형성 중";
  return "동기화 전";
}

function formatWalletAddress(address?: string | null): string {
  if (!address) return "미연결";
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function modeLabel(mode: "fan" | "star") {
  return mode === "star" ? "STAR 모드" : "FAN 모드";
}

function starStageLabel(stage?: "aspiring" | "promoted" | null) {
  return stage === "promoted" ? "공식 STAR" : "연습생 STAR";
}

interface PersonaOntologyProfile {
  archetypeKey: string;
  archetypeLabel: string;
  summary: string | null;
  traitTags: string[];
  communicationStyles: string[];
  preferences: string[];
  capabilities: string[];
  conflictStyles: string[];
  evidenceSummary: string[];
  sourceCounts?: {
    chat?: number;
    battle?: number;
    memory?: number;
    analysis?: number;
  };
  confidence: number;
  status: string;
  updatedAt: string;
}

interface PersonaCardSyncFields {
  source?: "ontology";
  syncState?: "not_started" | "forming" | "synced";
  displayLevelLabel?: string | null;
  nextActions?: string[];
  syncTimeline?: { label: string; createdAt: string | null }[];
}

const ONTOLOGY_SOURCE_META: Array<{
  key: keyof NonNullable<PersonaOntologyProfile["sourceCounts"]>;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}> = [
  { key: "chat", label: "톡 리워드", icon: "message-circle", color: "#FDE68A" },
  { key: "battle", label: "토크배틀", icon: "mic", color: "#C4B5FD" },
  { key: "memory", label: "AI 기억", icon: "database", color: "#5EEAD4" },
  { key: "analysis", label: "AI 분석", icon: "cpu", color: "#93C5FD" },
];

export default function MyPageScreen() {
  const router = useRouter();
  const { focus } = useLocalSearchParams();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();
  const scrollRef = React.useRef<ScrollView>(null);
  const [starLockY, setStarLockY] = React.useState(0);

  const { data: me } = useGetMe();
  const { data: persona, isLoading, isError, refetch } = useGetMyPersona();
  const { data: card, isError: isCardError, refetch: refetchCard } = useGetMyPersonaCard();
  const { data: rewardsSummary } = useGetMyRewardsSummary();
  const { mode, fanProfile, starUnlocked, equippedStar } = usePlayMode();
  const { state: torimia, requirements: torimiaRequirements } = useTorimia();
  const { status: walletStatus } = useWalletVerification();

  const [eventsExpanded, setEventsExpanded] = React.useState(false);
  const { analyze, isAnalyzing, analysisError, analysisNotice } = usePersonaAnalysis({
    refetchPersona: refetch,
    refetchCard,
  });

  const scrollToStarLock = React.useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, starLockY - 12), animated: true });
  }, [starLockY]);

  React.useEffect(() => {
    if (focus !== "star-nft" || starLockY <= 0) return;
    const timer = setTimeout(scrollToStarLock, 120);
    return () => clearTimeout(timer);
  }, [focus, scrollToStarLock, starLockY]);

  const fanLevel = fanProfile?.level ?? persona?.level ?? 1;
  const ontologyProfile =
    ((card as typeof card & { ontologyProfile?: PersonaOntologyProfile | null } | undefined)?.ontologyProfile ??
      (persona as typeof persona & { ontologyProfile?: PersonaOntologyProfile | null } | undefined)?.ontologyProfile) ??
    null;
  const cardSync = card as (typeof card & PersonaCardSyncFields) | undefined;
  const nextSyncActions = cardSync?.nextActions?.length
    ? cardSync.nextActions
    : [
        "Talk to Earn 보상을 수령하면 대화 요약과 키워드가 반영돼요.",
        "AI 기억을 추가하면 선호와 말투 기준이 더 또렷해져요.",
        "토크배틀에 참여하면 표현 방식과 설득 스타일이 반영돼요.",
      ];
  const syncTimeline = cardSync?.syncTimeline?.length
    ? cardSync.syncTimeline
    : (ontologyProfile?.evidenceSummary ?? []).slice(0, 3).map((label) => ({ label, createdAt: ontologyProfile?.updatedAt ?? null }));
  const recentEvents = persona?.recentEvents ?? [];
  const visibleRecentEvents = eventsExpanded ? recentEvents : recentEvents.slice(0, 1);

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <View style={[styles.screenHeader, { paddingTop: insets.top + 8, backgroundColor: colors.muted }]}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>마이페이지</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="미션 보상"
            hitSlop={8}
            onPress={() => router.push("/quests")}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="target" size={22} color={colors.foreground} />
            {(rewardsSummary?.total ?? 0) > 0 ? (
              <View style={[styles.headerDot, { borderColor: colors.muted }]} />
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="팬클럽"
            hitSlop={8}
            onPress={() => router.push("/clan")}
            style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="shield" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </View>
      <CustomScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
              어나더 미를 불러오지 못했어요.
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Hero: identity + level */}
            <LinearGradient
              colors={(isDark ? gradientsDark : gradients).soft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroAvatarWrap}>
                <Avatar uri={me?.profileImageUrl} name={me?.nickname ?? "나"} size={84} />
                <View style={[styles.levelChip, { backgroundColor: colors.foreground }]}>
                  <Text style={[styles.levelChipText, { color: colors.background }]}>
                    FAN Lv.{fanLevel}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroName, { color: colors.foreground }]} numberOfLines={1}>
                {me?.nickname ?? "나"}의 마이페이지
              </Text>
              <Text style={[styles.heroTitle, { color: colors.mutedForeground }]}>
                FAN/STAR 성장 관리 · Another Me는 신뢰도로 동기화
              </Text>

              <View style={styles.heroBtnRow}>
                <Pressable
                  onPress={() => router.push("/profile/ranking")}
                  style={({ pressed }) => [
                    styles.rankingBtn,
                    { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Feather name="bar-chart-2" size={15} color={colors.background} />
                  <Text style={[styles.rankingBtnText, { color: colors.background }]}>
                    랭킹 보기
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/clan")}
                  style={({ pressed }) => [
                    styles.rankingBtn,
                    {
                      backgroundColor: "transparent",
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.foreground,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Feather name="shield" size={15} color={colors.foreground} />
                  <Text style={[styles.rankingBtnText, { color: colors.foreground }]}>
                    팬클럽
                  </Text>
                </Pressable>
              </View>
            </LinearGradient>

            {/* Another Me ontology profile */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Another Me 프로필</Text>
            <Text style={[styles.sectionDescription, { color: colors.mutedForeground }]}>
              {ontologyProfile
                ? "XP나 레벨이 아니라, 톡 리워드 요약·토크배틀 평가·AI 기억 근거와 신뢰도로 관리됩니다."
                : "아직 온톨로지 프로필이 없어요. 이전 FAN/AI 분석값은 숨기고, 실제 동기화 근거가 생길 때만 표시합니다."}
            </Text>
            {card ? (
              <>
                <PersonaCard
                  card={card}
                  avatarUri={me?.profileImageUrl}
                  avatarName={me?.nickname ?? "나"}
                />

                {/* Next sync recommendations */}
                <View style={[styles.identityCard, { backgroundColor: colors.background }]}>
                  <View style={styles.identityRow}>
                    <View style={[styles.identityIcon, { backgroundColor: `${colors.primary}18` }]}>
                      <Feather name="refresh-cw" size={15} color={colors.primary} />
                    </View>
                    <View style={styles.identityBody}>
                      <Text style={[styles.identityLabel, { color: colors.foreground }]}>
                        다음 동기화 추천 · {syncStateLabel(cardSync?.syncState)}
                      </Text>
                      <Text style={[styles.identityText, { color: colors.mutedForeground }]}>
                        Another Me는 원문 채팅이 아니라 사용자가 선택한 요약/평가/기억 근거만 참고해요.
                      </Text>
                      <View style={styles.tagRow}>
                        {nextSyncActions.map((action) => (
                          <View key={action} style={[styles.growthTag, { backgroundColor: `${colors.primary}14` }]}>
                            <Text style={[styles.growthTagText, { color: colors.primary }]}>{action}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Ontology sync evidence */}
                <View style={[styles.identityCard, { backgroundColor: colors.background }]}>
                  <Text style={[styles.timelineTitle, { color: colors.foreground }]}>동기화 근거</Text>
                  {syncTimeline.length > 0 ? (
                    syncTimeline.map((item, i) => (
                      <View key={`${item.label}-${i}`} style={styles.timelineRow}>
                        <View style={styles.timelineMarkerCol}>
                          <View style={[styles.timelineDot, { backgroundColor: i === 0 ? colors.primary : colors.border }]} />
                          {i < syncTimeline.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}
                        </View>
                        <View style={styles.timelineBody}>
                          <Text style={[styles.timelineArchetype, { color: colors.foreground }]}>{item.label}</Text>
                          <Text style={[styles.timelineDate, { color: colors.mutedForeground }]}>{item.createdAt ? formatEventTime(item.createdAt) : "동기화 대기"}</Text>
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.identityText, { color: colors.mutedForeground }]}>아직 반영된 온톨로지 근거가 없어요. 톡 리워드 보상 수령, AI 기억 추가, 토크배틀 참여 후 여기에 표시됩니다.</Text>
                  )}
                </View>

                {ontologyProfile ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>상세 신호</Text>
                    <OntologyProfileCard profile={ontologyProfile} colors={colors} />
                  </>
                ) : null}
              </>
            ) : (
              <View style={[styles.identityCard, { backgroundColor: colors.background }]}>
                <View style={styles.identityRow}>
                  <View style={[styles.identityIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Feather name={isCardError ? "alert-circle" : "git-branch"} size={15} color={colors.primary} />
                  </View>
                  <View style={styles.identityBody}>
                    <Text style={[styles.identityLabel, { color: colors.foreground }]}>온톨로지 프로필 없음</Text>
                    <Text style={[styles.identityText, { color: colors.mutedForeground }]}>이전 카드 fallback을 제거했어요. Talk to Earn 보상 수령, AI 기억 추가, 토크배틀 참여, 또는 아래 동기화 분석 후 실제 ontology 근거가 생기면 표시됩니다.</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Recent growth log */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              이전 활동 기록
            </Text>
            <View style={[styles.eventsCard, { backgroundColor: colors.background }]}>
              {recentEvents.length > 0 ? (
                <>
                  {visibleRecentEvents.map((ev, i) => {
                    const icon = SOURCE_ICONS[ev.sourceType] ?? "activity";
                    const changes = formatStatChanges(ev.statChanges);
                    return (
                      <View
                        key={ev.id}
                        style={[
                          styles.eventRow,
                          {
                            borderTopColor: colors.border,
                            borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <View style={[styles.eventIcon, { backgroundColor: `${colors.primary}18` }]}>
                          <Feather name={icon} size={15} color={colors.primary} />
                        </View>
                        <View style={styles.eventBody}>
                          <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={1}>
                            {ev.reason ?? "성장"}
                            {changes ? `으로 ${changes}` : ""}
                          </Text>
                          <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>
                            {formatEventTime(ev.createdAt)}
                          </Text>
                        </View>
                        <Text style={[styles.eventXp, { color: colors.primary }]}>기록</Text>
                      </View>
                    );
                  })}
                  {recentEvents.length > 1 ? (
                    <Pressable
                      onPress={() => setEventsExpanded((value) => !value)}
                      style={({ pressed }) => [
                        styles.eventsToggle,
                        {
                          borderTopColor: colors.border,
                          opacity: pressed ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.eventsToggleText, { color: colors.primary }]}>
                        {eventsExpanded ? "접기" : `전체 ${recentEvents.length}개 펼치기`}
                      </Text>
                      <Feather name={eventsExpanded ? "chevron-up" : "chevron-down"} size={15} color={colors.primary} />
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <View style={styles.eventsEmpty}>
                  <Feather name="clock" size={20} color={colors.mutedForeground} />
                  <Text style={[styles.eventsEmptyText, { color: colors.mutedForeground }]}>
                    아직 활동 기록이 없어요.{"\n"}톡 리워드와 토크배틀을 시작해 보세요.
                  </Text>
                  <Pressable
                    onPress={() => router.push("/(tabs)/battle")}
                    style={({ pressed }) => [
                      styles.emptyCta,
                      { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Feather name="mic" size={14} color={colors.background} />
                    <Text style={[styles.emptyCtaText, { color: colors.background }]}>토크배틀 시작</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* AI analysis */}
            <View style={styles.analysisHeader}>
              <Text style={[styles.sectionTitle, styles.analysisHeaderTitle, { color: colors.mutedForeground }]}>
                Another Me 동기화 분석
              </Text>
              <Pressable
                onPress={() => analyze()}
                disabled={isAnalyzing}
                style={({ pressed }) => [
                  styles.analyzeBtn,
                  {
                    backgroundColor: `${colors.primary}18`,
                    opacity: isAnalyzing ? 0.7 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {isAnalyzing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name="refresh-cw" size={13} color={colors.primary} />
                )}
                <Text style={[styles.analyzeBtnText, { color: colors.primary }]}>
                  {isAnalyzing ? "분석 중…" : "AI 분석 업데이트"}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: colors.background }]}>
              {analysisError ? (
                <View style={styles.analysisErrorRow}>
                  <Feather name="alert-circle" size={16} color="#EF4444" />
                  <Text style={[styles.analysisErrorText, { color: colors.mutedForeground }]}>
                    {analysisError}
                  </Text>
                </View>
              ) : null}

              {analysisNotice ? (
                <View style={styles.analysisNoticeRow}>
                  <Feather name="info" size={16} color={colors.primary} />
                  <Text style={[styles.analysisErrorText, { color: colors.mutedForeground }]}>
                    {analysisNotice}
                  </Text>
                </View>
              ) : null}

              {isAnalyzing ? (
                <View style={styles.summaryEmpty}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.summaryEmptyText, { color: colors.mutedForeground }]}>
                    기존 활동을 ontology evidence로 변환하고 있어요…
                  </Text>
                </View>
              ) : (
                <View style={styles.summaryEmpty}>
                  <Feather name="cpu" size={20} color={colors.mutedForeground} />
                  <Text style={[styles.summaryEmptyText, { color: colors.mutedForeground }]}>
                    이전 AI 분석 상세값은 더 이상 표시하거나 저장하지 않아요. "AI 분석 업데이트"는 결과를 Another Me 최근 반영 내역에만 비동기로 보냅니다.
                    {persona?.lastAnalyzedAt ? `\n마지막 요청: ${formatEventTime(persona.lastAnalyzedAt)}` : ""}
                  </Text>
                </View>
              )}
            </View>

            {/* How to grow */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              성장 구조
            </Text>
            <View style={[styles.tipsCard, { backgroundColor: colors.background }]}>
              <TipRow icon="message-circle" text="Talk to Earn 보상 수령 시 요약/키워드/평가 점수만 Another Me에 동기화돼요" colors={colors} />
              <TipRow icon="mic" text="토크배틀 발언 평가는 TP 경쟁과 Another Me 표현 패턴에 반영돼요" colors={colors} />
              <TipRow icon="heart" text="퀘스트와 업적 보상은 FAN XP를 올려요" colors={colors} />
              <TipRow icon="star" text="STAR NFT를 장착하면 STAR 미션과 별도 STAR XP가 열려요" colors={colors} last />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>계정 상태</Text>
            <AccountStateCard
              colors={colors}
              mode={mode}
              starUnlocked={starUnlocked}
              equippedStarName={equippedStar?.displayName ?? null}
              equippedStarStage={equippedStar?.stage ?? null}
              walletStatus={walletStatus}
            />

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>FAN 성장</Text>
            <GrowthSummaryCard
              colors={colors}
              title="FAN 프로필"
              subtitle="채팅, 응원, 토크배틀 활동으로 성장하는 기본 팬 상태입니다."
              level={fanProfile?.level ?? 1}
              xp={fanProfile?.xp ?? 0}
              xpLabel="FAN XP"
              stats={fanProfile?.stats}
              statMeta={FAN_STAT_META}
            />

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>STAR 성장</Text>
            <GrowthSummaryCard
              colors={colors}
              title={equippedStar ? `${equippedStar.displayName} ${starStageLabel(equippedStar.stage)}` : "장착된 STAR 없음"}
              subtitle={
                equippedStar
                  ? equippedStar.stage === "promoted"
                    ? `NFT #${equippedStar.tokenId}에 귀속된 공식 STAR 성장 상태입니다.`
                    : `NFT #${equippedStar.tokenId}에 귀속된 연습생 STAR 성장 상태입니다.`
                  : starUnlocked
                    ? "NFT를 장착하면 해당 STAR의 스탯과 성장이 여기에 표시됩니다."
                    : "STAR NFT 인증 후 캐릭터를 장착하면 열립니다."
              }
              level={equippedStar?.level ?? 1}
              xp={equippedStar?.xp ?? 0}
              xpLabel="STAR XP"
              stats={equippedStar?.stats}
              statMeta={STAR_STAT_META}
              disabled={!equippedStar}
              footer={
                !equippedStar ? (
                  <Pressable
                    onPress={scrollToStarLock}
                    style={({ pressed }) => [
                      styles.cardAction,
                      { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Feather name="star" size={14} color={colors.primaryForeground} />
                    <Text style={[styles.cardActionText, { color: colors.primaryForeground }]}>
                      STAR 인증/장착하기
                    </Text>
                  </Pressable>
                ) : null
              }
            />

            {!equippedStar ? (
              <View style={styles.starLockAnchor} onLayout={(event) => setStarLockY(event.nativeEvent.layout.y)}>
                <StarLockCard />
              </View>
            ) : null}

            {equippedStar ? (
              <TorimiaStatusCard
                colors={colors}
                promoted={!!torimia?.promoted || equippedStar.stage === "promoted"}
                canOpen={!!torimia?.canOpen}
                requirements={torimiaRequirements}
                onMission={() => router.push("/(tabs)/dungeon" as never)}
                onFanclub={() => router.push("/clan" as never)}
              />
            ) : null}

            <Pressable
              onPress={() => router.push({ pathname: "/battle/create", params: { mode: "ai" } })}
              style={({ pressed }) => [
                styles.ctaBtn,
                { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="zap" size={18} color={colors.background} />
              <Text style={[styles.ctaText, { color: colors.background }]}>
                지금 성장하러 가기
              </Text>
            </Pressable>
          </>
        )}
      </CustomScrollView>
    </View>
  );
}

function TipRow({
  icon,
  text,
  colors,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  text: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.tipRow,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={[styles.tipText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

function OntologyProfileCard({
  profile,
  colors,
}: {
  profile: PersonaOntologyProfile | null;
  colors: ReturnType<typeof useColors>;
}) {
  const sections = profile
    ? [
        { title: "대표 성향", icon: "user" as const, items: profile.traitTags },
        { title: "말투·표현", icon: "message-square" as const, items: profile.communicationStyles },
        { title: "표현 역량", icon: "zap" as const, items: profile.capabilities },
        { title: "갈등/반박 스타일", icon: "shield" as const, items: profile.conflictStyles },
        { title: "선호", icon: "sliders" as const, items: profile.preferences },
      ].filter((section) => section.items.length > 0)
    : [];
  const sourceBadges = profile
    ? ONTOLOGY_SOURCE_META.map((item) => ({ ...item, count: profile.sourceCounts?.[item.key] ?? 0 })).filter((item) => item.count > 0)
    : [];
  const signalChips = profile
    ? Array.from(new Set([
        ...profile.communicationStyles,
        ...profile.traitTags,
        ...profile.capabilities,
        ...profile.conflictStyles,
      ])).slice(0, 3)
    : [];

  if (!profile) {
    return (
      <View style={[styles.ontologyCard, { backgroundColor: colors.background }]}>
        <View style={styles.ontologyEmpty}>
          <Feather name="git-branch" size={22} color={colors.mutedForeground} />
          <Text style={[styles.ontologyEmptyTitle, { color: colors.foreground }]}>자아 프로필 형성 중</Text>
          <Text style={[styles.ontologyEmptyText, { color: colors.mutedForeground }]}>톡 리워드 보상 수령, 토크배틀 발언, 직접 저장한 AI 기억이 쌓이면 Another Me가 참고할 말투와 표현 방식이 정리됩니다.</Text>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient colors={["#20124D", "#35206E", "#5B36D6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ontologyCard}>
      <View style={styles.ontologyGlowPrimary} />
      <View style={styles.ontologyGlowSecondary} />
      <View style={styles.ontologyHeader}>
        <View style={styles.ontologyIconWrap}>
          <View style={styles.ontologyOrbit} />
          <View style={styles.ontologyIcon}>
            <Feather name="cpu" size={17} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.ontologyHeaderText}>
          <Text style={styles.ontologyTitle}>{profile.archetypeLabel}</Text>
          <Text style={styles.ontologyMeta}>말투·성향·선호 세부 신호</Text>
        </View>
      </View>

      {profile.summary ? <Text style={styles.ontologySummary}>{profile.summary}</Text> : null}

      {sourceBadges.length > 0 ? (
        <View style={styles.ontologySourceRow}>
          {sourceBadges.map((item) => (
            <View key={item.key} style={[styles.ontologySourceBadge, { borderColor: `${item.color}66` }]}>
              <Feather name={item.icon} size={12} color={item.color} />
              <Text style={[styles.ontologySourceText, { color: item.color }]}>{item.label} {item.count}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {signalChips.length > 0 ? (
        <View style={styles.ontologySignalRow}>
          {signalChips.map((item) => (
            <View key={item} style={styles.ontologySignalChip}>
              <Text style={styles.ontologySignalText}>+ {item}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.title} style={styles.ontologySection}>
          <View style={styles.ontologySectionHead}>
            <Feather name={section.icon} size={13} color="#C4B5FD" />
            <Text style={styles.ontologySectionTitle}>{section.title}</Text>
          </View>
          <View style={styles.ontologyTagRow}>
            {section.items.slice(0, 4).map((item) => (
              <View key={`${section.title}-${item}`} style={styles.ontologyTag}>
                <Text style={styles.ontologyTagText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

    </LinearGradient>
  );
}

function AccountStateCard({
  colors,
  mode,
  starUnlocked,
  equippedStarName,
  equippedStarStage,
  walletStatus,
}: {
  colors: ReturnType<typeof useColors>;
  mode: "fan" | "star";
  starUnlocked: boolean;
  equippedStarName: string | null;
  equippedStarStage: "aspiring" | "promoted" | null;
  walletStatus?: WalletStatus;
}) {
  const rows: {
    label: string;
    value: string;
    icon: keyof typeof Feather.glyphMap;
    tone: "primary" | "muted" | "success";
  }[] = [
    { label: "현재 모드", value: modeLabel(mode), icon: "toggle-right", tone: "primary" },
    {
      label: "STAR 모드",
      value: starUnlocked ? "사용 가능" : "잠금",
      icon: starUnlocked ? "unlock" : "lock",
      tone: starUnlocked ? "success" : "muted",
    },
    {
      label: "STAR 단계",
      value: equippedStarName ? starStageLabel(equippedStarStage) : "미장착",
      icon: equippedStarStage === "promoted" ? "award" : "sunrise",
      tone: equippedStarName ? "success" : "muted",
    },
    {
      label: "장착 STAR",
      value: equippedStarName ?? "미장착",
      icon: "star",
      tone: equippedStarName ? "success" : "muted",
    },
    {
      label: "지갑",
      value: formatWalletAddress(walletStatus?.walletAddress),
      icon: "link",
      tone: walletStatus?.walletVerified ? "success" : "muted",
    },
    {
      label: "NFT 확인",
      value: walletStatus?.nftConfigured === false
        ? "컨트랙트 설정 전"
        : walletStatus?.nftVerified
          ? "확인됨"
          : "미확인",
      icon: "shield",
      tone: walletStatus?.nftVerified ? "success" : "muted",
    },
  ];

  return (
    <View style={[styles.accountCard, { backgroundColor: colors.background }]}>
      {rows.map((row, index) => {
        const iconColor =
          row.tone === "success" ? colors.online : row.tone === "primary" ? colors.primary : colors.mutedForeground;
        return (
          <View
            key={row.label}
            style={[
              styles.accountRow,
              {
                borderTopColor: colors.border,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={[styles.accountIcon, { backgroundColor: `${iconColor}18` }]}>
              <Feather name={row.icon} size={15} color={iconColor} />
            </View>
            <Text style={[styles.accountLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
            <Text style={[styles.accountValue, { color: colors.foreground }]} numberOfLines={1}>
              {row.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function GrowthSummaryCard({
  colors,
  title,
  subtitle,
  level,
  xp,
  xpLabel,
  stats,
  statMeta,
  disabled,
  footer,
}: {
  colors: ReturnType<typeof useColors>;
  title: string;
  subtitle: string;
  level: number;
  xp: number;
  xpLabel: string;
  stats?: Record<string, number> | null;
  statMeta: { key: string; label: string; icon: keyof typeof Feather.glyphMap; color: string }[];
  disabled?: boolean;
  footer?: React.ReactNode;
}) {
  const max = Math.max(1, ...statMeta.map((item) => stats?.[item.key] ?? 0));
  return (
    <View style={[styles.growthSummaryCard, { backgroundColor: colors.background, opacity: disabled ? 0.72 : 1 }]}>
      <View style={styles.growthSummaryHead}>
        <View style={styles.growthSummaryTitleBlock}>
          <Text style={[styles.growthSummaryTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.growthSummarySub, { color: colors.mutedForeground }]}>{subtitle}</Text>
        </View>
        <View style={[styles.growthLevelBadge, { backgroundColor: colors.foreground }]}>
          <Text style={[styles.growthLevelText, { color: colors.background }]}>Lv.{level}</Text>
        </View>
      </View>
      <Text style={[styles.growthXpText, { color: colors.primary }]}>{xp} {xpLabel}</Text>
      <View style={styles.compactStatGrid}>
        {statMeta.map((item) => {
          const value = stats?.[item.key] ?? 0;
          const width = Math.round((value / max) * 100);
          return (
            <View key={item.key} style={[styles.compactStatItem, { backgroundColor: colors.muted }]}>
              <View style={styles.compactStatTop}>
                <View style={[styles.compactStatIcon, { backgroundColor: `${item.color}22` }]}>
                  <Feather name={item.icon} size={13} color={item.color} />
                </View>
                <Text style={[styles.compactStatValue, { color: colors.foreground }]}>{value}</Text>
              </View>
              <Text style={[styles.compactStatLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              <View style={[styles.compactTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.compactFill, { width: `${width}%`, backgroundColor: item.color }]} />
              </View>
            </View>
          );
        })}
      </View>
      {footer ? <View style={styles.cardFooter}>{footer}</View> : null}
    </View>
  );
}

function TorimiaStatusCard({
  colors,
  promoted,
  canOpen,
  requirements,
  onMission,
  onFanclub,
}: {
  colors: ReturnType<typeof useColors>;
  promoted: boolean;
  canOpen: boolean;
  requirements: TorimiaRequirement[];
  onMission: () => void;
  onFanclub: () => void;
}) {
  return (
    <View style={[styles.torimiaStatusCard, { backgroundColor: colors.background }]}>
      <View style={styles.torimiaStatusHead}>
        <View style={[styles.torimiaStatusIcon, { backgroundColor: "#8B5CF622" }]}>
          <Feather name={promoted ? "star" : "sunrise"} size={18} color="#8B5CF6" />
        </View>
        <View style={styles.torimiaStatusTextBlock}>
          <Text style={[styles.torimiaStatusTitle, { color: colors.foreground }]}>
            {promoted ? "토르미아 개방 완료" : canOpen ? "토르미아 개방 가능" : "토르미아 준비 중"}
          </Text>
          <Text style={[styles.torimiaStatusSub, { color: colors.mutedForeground }]}>
            {promoted
              ? "공식 STAR로 승급했어요. 팬클럽 생성과 공식 STAR 미션이 열립니다."
              : "연습생 STAR 미션으로 조건을 채우면 공식 STAR로 승급할 수 있어요."}
          </Text>
        </View>
      </View>
      {!promoted && requirements.length > 0 ? (
        <View style={styles.torimiaMiniList}>
          {requirements.slice(0, 3).map((req) => (
            <Text key={req.key} style={[styles.torimiaMiniReq, { color: req.met ? colors.online : colors.mutedForeground }]}>
              {req.met ? "완료" : "진행"} · {req.label} {Math.min(req.current, req.target)}/{req.target}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.torimiaStatusActions}>
        <Pressable onPress={onMission} style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}>
          <Text style={[styles.smallActionText, { color: colors.primaryForeground }]}>
            {promoted ? "공식 STAR 미션" : "연습생 STAR 미션"}
          </Text>
        </Pressable>
        {promoted ? (
          <Pressable onPress={onFanclub} style={[styles.smallActionBtn, { backgroundColor: "#8B5CF6" }]}>
            <Text style={styles.smallActionText}>팬클럽</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  screenTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerBtn: { padding: 6 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
  },
  center: { paddingTop: 80, alignItems: "center", gap: 16 },
  errorText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  hero: {
    margin: 16,
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
  },
  heroAvatarWrap: { alignItems: "center" },
  levelChip: {
    marginTop: -14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  levelChipText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  heroName: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 12 },
  heroTitle: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 4 },
  rankingBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  rankingBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  heroBtnRow: { flexDirection: "row", gap: 10, marginTop: 16, alignSelf: "stretch" },

  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionDescription: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  accountCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  accountRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  accountIcon: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  accountLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13 },
  accountValue: { flex: 1.2, fontFamily: "Inter_700Bold", fontSize: 13, textAlign: "right" },
  growthSummaryCard: { gap: 12, marginHorizontal: 16, borderRadius: 16, padding: 16 },
  growthSummaryHead: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  growthSummaryTitleBlock: { flex: 1, gap: 4 },
  growthSummaryTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  growthSummarySub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  growthLevelBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  growthLevelText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  growthXpText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  compactStatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  compactStatItem: { borderRadius: 14, flexBasis: "48%", flexGrow: 1, gap: 6, padding: 12 },
  compactStatTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  compactStatIcon: { alignItems: "center", borderRadius: 9, height: 28, justifyContent: "center", width: 28 },
  compactStatValue: { fontFamily: "Inter_700Bold", fontSize: 16 },
  compactStatLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  compactTrack: { borderRadius: 999, height: 4, overflow: "hidden" },
  compactFill: { borderRadius: 999, height: "100%" },
  cardFooter: { alignItems: "flex-start" },
  cardAction: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardActionText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  starLockAnchor: { marginHorizontal: 16, marginTop: 12 },
  torimiaStatusCard: { gap: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 16 },
  torimiaStatusHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  torimiaStatusIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  torimiaStatusTextBlock: { flex: 1, gap: 3 },
  torimiaStatusTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  torimiaStatusSub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  torimiaMiniList: { gap: 5 },
  torimiaMiniReq: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  torimiaStatusActions: { flexDirection: "row", gap: 8 },
  smallActionBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  smallActionText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 },
  ontologyCard: { gap: 14, marginHorizontal: 16, borderRadius: 20, overflow: "hidden", padding: 18 },
  ontologyGlowPrimary: { backgroundColor: "rgba(253,230,138,0.18)", borderRadius: 80, height: 130, position: "absolute", right: -36, top: -42, width: 130 },
  ontologyGlowSecondary: { backgroundColor: "rgba(94,234,212,0.12)", borderRadius: 70, bottom: -42, height: 120, left: -34, position: "absolute", width: 120 },
  ontologyHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  ontologyIconWrap: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
  ontologyOrbit: { borderColor: "rgba(255,255,255,0.24)", borderRadius: 23, borderWidth: 1, height: 46, position: "absolute", transform: [{ rotate: "18deg" }], width: 46 },
  ontologyIcon: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 14, height: 38, justifyContent: "center", width: 38 },
  ontologyHeaderText: { flex: 1, gap: 3, minWidth: 0 },
  ontologyTitle: { color: "#FFFFFF", flexShrink: 1, fontFamily: "Inter_800ExtraBold", fontSize: 18, letterSpacing: -0.2 },
  ontologyMeta: { color: "#C4B5FD", flexShrink: 1, fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
  ontologySummary: { color: "#EDE9FE", fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19 },
  ontologySourceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  ontologySourceBadge: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", flexShrink: 1, gap: 5, maxWidth: "100%", paddingHorizontal: 9, paddingVertical: 6 },
  ontologySourceText: { flexShrink: 1, fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 15 },
  ontologySignalRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  ontologySignalChip: { backgroundColor: "rgba(253,230,138,0.16)", borderRadius: 999, flexShrink: 1, maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 6 },
  ontologySignalText: { color: "#FDE68A", flexShrink: 1, fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 17 },
  ontologySection: { gap: 8 },
  ontologySectionHead: { alignItems: "center", flexDirection: "row", gap: 6 },
  ontologySectionTitle: { color: "#FFFFFF", flexShrink: 1, fontFamily: "Inter_700Bold", fontSize: 13 },
  ontologyTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  ontologyTag: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, flexShrink: 1, maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 6 },
  ontologyTagText: { color: "rgba(255,255,255,0.92)", flexShrink: 1, fontFamily: "Inter_700Bold", fontSize: 12, lineHeight: 17 },
  ontologyEmpty: { alignItems: "center", gap: 8, paddingVertical: 18 },
  ontologyEmptyTitle: { fontFamily: "Inter_700Bold", fontSize: 15, textAlign: "center" },
  ontologyEmptyText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },

  eventsCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  eventIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  eventBody: { flex: 1, gap: 2, minWidth: 0 },
  eventTitle: { flexShrink: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  eventMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  eventXp: { fontSize: 13, fontFamily: "Inter_700Bold" },
  eventsToggle: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  eventsToggleText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  eventsEmpty: { alignItems: "center", gap: 10, paddingVertical: 20, paddingHorizontal: 16 },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 11,
    marginTop: 2,
  },
  emptyCtaText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  eventsEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },

  identityCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 16 },
  identityRow: { flexDirection: "row", gap: 12 },
  identityIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  identityBody: { flex: 1, gap: 6, minWidth: 0 },
  identityLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  identityText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 },
  growthTag: { borderRadius: 9, flexShrink: 1, maxWidth: "100%", paddingHorizontal: 10, paddingVertical: 5 },
  growthTagText: { flexShrink: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", lineHeight: 17 },

  timelineTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineMarkerCol: { alignItems: "center", width: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, marginTop: 2, minHeight: 18 },
  timelineBody: { flex: 1, paddingBottom: 14, gap: 2 },
  timelineArchetype: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  timelineDate: { fontSize: 12, fontFamily: "Inter_400Regular" },

  summaryCard: { marginHorizontal: 16, borderRadius: 16, padding: 18 },
  summaryText: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 21 },
  summaryEmpty: { alignItems: "center", gap: 10, paddingVertical: 8 },
  summaryEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },

  analysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 16,
  },
  analysisHeaderTitle: { flex: 1 },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 12,
  },
  analyzeBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  analysisErrorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 12,
  },
  analysisNoticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 12,
  },
  analysisErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  analysisField: { marginTop: 14, gap: 5 },
  analysisFieldHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  analysisFieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  analysisFieldText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  analysisDisclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 16,
  },

  tipsCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", paddingHorizontal: 16 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  tipText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 15,
    borderRadius: 14,
  },
  ctaText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
