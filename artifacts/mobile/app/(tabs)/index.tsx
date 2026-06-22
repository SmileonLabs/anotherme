import { CustomScrollView } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetMe,
  useGetMyBattleHistory,
  useGetMyBattleStats,
  useListIncomingFriendRequests,
  useListRooms,
  type BattleHistoryItem,
} from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";

const logoLight = require("../../assets/images/logo-light.png");
const logoDark = require("../../assets/images/logo-dark.png");
const banner = require("../../assets/images/banner.png");

const CARD_W = Math.min(Dimensions.get("window").width - 32, 600);

function formatTime(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function roomDisplayName(room: any, myId?: string): string {
  if (room.name) return room.name;
  if (room.type === "direct") {
    const other = room.members?.find((m: any) => m.id !== myId);
    return other?.nickname ?? "채팅방";
  }
  return room.members?.map((m: any) => m.nickname).join(", ") ?? "그룹 채팅";
}

function roomAvatar(room: any, myId?: string): string | null {
  if (room.type === "direct") {
    const other = room.members?.find((m: any) => m.id !== myId);
    return other?.profileImageUrl ?? null;
  }
  return null;
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const { data: me } = useGetMe();
  const {
    data: history = [],
    refetch: refetchHistory,
    isRefetching: refetchingHistory,
  } = useGetMyBattleHistory();
  const { data: stats, refetch: refetchStats } = useGetMyBattleStats();
  const { data: rooms = [], refetch: refetchRooms } = useListRooms();
  const { data: incomingRequests = [], refetch: refetchRequests } =
    useListIncomingFriendRequests();

  const refetchAll = React.useCallback(() => {
    refetchHistory();
    refetchStats();
    refetchRooms();
    refetchRequests();
  }, [refetchHistory, refetchStats, refetchRooms, refetchRequests]);

  // Refresh dashboard data whenever it regains focus (battles finished elsewhere,
  // new messages, etc.) without a manual pull.
  useFocusEffect(
    React.useCallback(() => {
      refetchAll();
    }, [refetchAll]),
  );

  const hasRequests = incomingRequests.length > 0;
  const recentRooms = rooms.slice(0, 4);

  const QUICK_ACTIONS: {
    key: string;
    label: string;
    sub: string;
    icon: keyof typeof Feather.glyphMap;
    bg: string;
    fg: string;
    onPress: () => void;
  }[] = [
    {
      key: "ai",
      label: "중2병 AI와 말빨 배틀",
      sub: "AI 캐릭터에 도전",
      icon: "award",
      bg: isDark ? "#10322A" : "#E3F9F0",
      fg: "#00B488",
      onPress: () => router.push({ pathname: "/battle/create", params: { mode: "ai" } }),
    },
    {
      key: "battle",
      label: "친구와 말빨 배틀",
      sub: "친구와 배틀하기",
      icon: "zap",
      bg: isDark ? "#2A2440" : "#EDE9FE",
      fg: "#7C5CFC",
      onPress: () => router.push({ pathname: "/battle/create", params: { mode: "friend" } }),
    },
    {
      key: "mud",
      label: "텍스트형 RPG",
      sub: "머드 게임 모험",
      icon: "compass",
      bg: isDark ? "#3A2618" : "#FFF0E1",
      fg: "#FB923C",
      onPress: () => router.push("/dungeon/create"),
    },
    {
      key: "invite",
      label: "친구 초대",
      sub: "함께 즐겨요",
      icon: "user-plus",
      bg: isDark ? "#1E2A45" : "#E5EDFF",
      fg: "#4F7BF5",
      onPress: () => router.push("/friends/add"),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Image
          source={isDark ? logoDark : logoLight}
          style={styles.brandLogo}
          contentFit="contain"
          accessibilityLabel="솔로몬"
        />
        <Pressable
          accessibilityLabel="알림"
          hitSlop={8}
          onPress={() => router.push("/friends/requests")}
          style={({ pressed }) => [styles.bellBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Feather name="bell" size={22} color={colors.foreground} />
          {hasRequests ? (
            <View style={[styles.bellDot, { borderColor: colors.background }]} />
          ) : null}
        </Pressable>
      </View>

      <CustomScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refetchingHistory}
            onRefresh={refetchAll}
            tintColor={colors.primary}
          />
        }
      >
        {/* Banner */}
        <Image
          source={banner}
          style={styles.banner}
          contentFit="cover"
          accessibilityLabel="배너"
        />

        {/* Recent battle results carousel */}
        <ResultCarousel history={history} onOpen={(id) => router.push({ pathname: "/battle/[id]", params: { id } })} />

        {/* Quick actions */}
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.key}
              onPress={a.onPress}
              style={({ pressed }) => [
                styles.quickCard,
                { backgroundColor: a.bg, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.quickIcon, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)" }]}>
                <Feather name={a.icon} size={22} color={a.fg} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.foreground }]} numberOfLines={2}>
                {a.label}
              </Text>
              <Text style={[styles.quickSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {a.sub}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Recent conversations */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>최근 대화</Text>
          <Pressable hitSlop={8} onPress={() => router.push("/(tabs)/chats")}>
            <Text style={[styles.sectionAction, { color: colors.mutedForeground }]}>전체 보기</Text>
          </Pressable>
        </View>

        {recentRooms.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            아직 대화가 없습니다. 친구와 대화를 시작해보세요.
          </Text>
        ) : (
          <View style={[styles.convCard, { backgroundColor: colors.card }]}>
            {recentRooms.map((room, i) => {
              const name = roomDisplayName(room, me?.id);
              const avatarUri = roomAvatar(room, me?.id);
              const unread = room.unreadCount ?? 0;
              return (
                <Pressable
                  key={room.id}
                  onPress={() =>
                    router.push(
                      room.type === "battle"
                        ? { pathname: "/battle/[id]", params: { id: room.id } }
                        : { pathname: "/chat/[id]", params: { id: room.id } },
                    )
                  }
                  style={({ pressed }) => [
                    styles.convRow,
                    {
                      opacity: pressed ? 0.6 : 1,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  {room.type === "battle" || room.type === "dungeon" || (room.type === "group" && !avatarUri) ? (
                    <View style={[styles.convIcon, { backgroundColor: colors.accent }]}>
                      <Feather
                        name={room.type === "battle" ? "mic" : room.type === "dungeon" ? "compass" : "users"}
                        size={20}
                        color={colors.primary}
                      />
                    </View>
                  ) : (
                    <Avatar uri={avatarUri} name={name} size={44} />
                  )}
                  <View style={styles.convInfo}>
                    <Text style={[styles.convName, { color: colors.foreground }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.convMsg, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {room.lastMessage ?? "아직 메시지가 없습니다"}
                    </Text>
                  </View>
                  <View style={styles.convRight}>
                    <Text style={[styles.convTime, { color: colors.mutedForeground }]}>
                      {formatTime(room.lastMessageAt)}
                    </Text>
                    {unread > 0 ? (
                      <View style={[styles.convBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.convBadgeText}>{unread > 99 ? "99+" : unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Trending debate (UI placeholder) */}
        <Pressable
          onPress={() => router.push({ pathname: "/battle/create", params: { mode: "ai" } })}
          style={({ pressed }) => [
            styles.trendCard,
            { backgroundColor: colors.card, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <View style={styles.trendTop}>
            <Text style={[styles.trendLabel, { color: colors.mutedForeground }]}>지금 뜨는 논쟁 🔥</Text>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.trendTitle, { color: colors.foreground }]}>읽씹은 무례하다?</Text>
          <View style={styles.trendBars}>
            <Text style={[styles.trendPro, { color: "#00B488" }]}>찬성 52%</Text>
            <Text style={[styles.trendVs, { color: colors.mutedForeground }]}>VS</Text>
            <Text style={[styles.trendCon, { color: colors.primary }]}>반대 48%</Text>
          </View>
          <View style={styles.trendBarTrack}>
            <View style={{ flex: 52, backgroundColor: "#00B488" }} />
            <View style={{ flex: 48, backgroundColor: colors.primary }} />
          </View>
          <View style={styles.trendFoot}>
            <Text style={[styles.trendCount, { color: colors.mutedForeground }]}>1,243명 참여 중</Text>
            <View style={[styles.trendJoin, { backgroundColor: colors.foreground }]}>
              <Text style={[styles.trendJoinText, { color: colors.background }]}>참여하기</Text>
            </View>
          </View>
        </Pressable>

        {/* My battle stats */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>내 말빨 현황</Text>
        </View>
        <LinearGradient
          colors={(isDark ? gradientsDark : gradients).soft}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statCard}
        >
          <View style={styles.statTop}>
            <View style={[styles.levelBadge, { backgroundColor: isDark ? "#3A2E12" : "#FBEFD0" }]}>
              <Feather name="award" size={22} color="#D4A017" />
            </View>
            <View style={styles.statLevelInfo}>
              <Text style={[styles.statLevel, { color: colors.foreground }]}>
                Lv.{stats?.level ?? 1}{" "}
                <Text style={[styles.statTitle, { color: colors.mutedForeground }]}>
                  {stats?.title ?? "말문 트임"}
                </Text>
              </Text>
              <Text style={[styles.statNext, { color: colors.mutedForeground }]}>
                다음 레벨까지 {stats?.mpToNext ?? 0} MP
              </Text>
              <View style={[styles.mpTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }]}>
                <View
                  style={{
                    width: `${Math.min(100, Math.round(((stats?.mpIntoLevel ?? 0) / (stats?.mpForNextLevel || 500)) * 100))}%`,
                    height: "100%",
                    borderRadius: 4,
                    backgroundColor: "#D4A017",
                  }}
                />
              </View>
              <Text style={[styles.mpText, { color: colors.mutedForeground }]}>
                {stats?.mpIntoLevel ?? 0} / {stats?.mpForNextLevel ?? 500}
              </Text>
            </View>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{stats?.winRate ?? 0}%</Text>
              <Text style={[styles.statKey, { color: colors.mutedForeground }]}>승률</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {stats?.total ?? 0}전 {stats?.wins ?? 0}승 {stats?.losses ?? 0}패
              </Text>
              <Text style={[styles.statKey, { color: colors.mutedForeground }]}>전적</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{stats?.currentStreak ?? 0}</Text>
              <Text style={[styles.statKey, { color: colors.mutedForeground }]}>연승</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ height: insets.bottom + 100 }} />
      </CustomScrollView>
    </View>
  );
}

function outcomeMeta(outcome: BattleHistoryItem["outcome"]) {
  if (outcome === "win") return { label: "🏆 나의 주장 우세", color: "#00B488" };
  if (outcome === "loss") return { label: "상대 주장 우세", color: "#FF6B6B" };
  return { label: "무승부", color: "#8E8E93" };
}

function ResultCarousel({
  history,
  onOpen,
}: {
  history: BattleHistoryItem[];
  onOpen: (roomId: string) => void;
}) {
  const colors = useColors();
  const [page, setPage] = React.useState(0);

  if (history.length === 0) {
    return (
      <View style={[styles.emptyResult, { backgroundColor: colors.card }]}>
        <Text style={styles.emptyResultEmoji}>⚖️</Text>
        <Text style={[styles.emptyResultTitle, { color: colors.foreground }]}>
          아직 배틀 기록이 없어요
        </Text>
        <Text style={[styles.emptyResultSub, { color: colors.mutedForeground }]}>
          첫 말빨 배틀에 도전해보세요!
        </Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + 12}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 12)))
        }
      >
        {history.map((item) => {
          const meta = outcomeMeta(item.outcome);
          return (
            <Pressable
              key={item.roomId}
              onPress={() => onOpen(item.roomId)}
              style={({ pressed }) => [
                styles.resultCard,
                { backgroundColor: colors.card, opacity: pressed ? 0.92 : 1 },
              ]}
            >
              {/* Left: chat preview */}
              <View style={styles.resultLeft}>
                {item.preview.length === 0 ? (
                  <Text style={[styles.previewEmpty, { color: colors.mutedForeground }]} numberOfLines={4}>
                    {item.topic}
                  </Text>
                ) : (
                  item.preview.map((p, idx) => (
                    <View
                      key={idx}
                      style={[styles.previewBubbleRow, { justifyContent: p.isMe ? "flex-end" : "flex-start" }]}
                    >
                      <View
                        style={[
                          styles.previewBubble,
                          {
                            backgroundColor: p.isMe ? colors.myBubble : colors.otherBubble,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.previewText,
                            { color: p.isMe ? colors.myBubbleText : colors.otherBubbleText },
                          ]}
                          numberOfLines={2}
                        >
                          {p.content}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
                <Text style={[styles.previewCaption, { color: colors.mutedForeground }]}>
                  AI가 대화를 분석해 판정했어요 ✨
                </Text>
              </View>

              {/* Right: AI verdict */}
              <View style={[styles.resultRight, { borderLeftColor: colors.border }]}>
                <Text style={[styles.verdictTitle, { color: colors.foreground }]}>⚖️ AI 판정 결과</Text>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>나</Text>
                  <Text style={[styles.scoreMe, { color: colors.foreground }]}>{item.myScore}</Text>
                  <Text style={[styles.scoreColon, { color: colors.mutedForeground }]}>:</Text>
                  <Text style={[styles.scoreOpp, { color: colors.mutedForeground }]}>{item.opponentScore}</Text>
                  <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {item.opponentName}
                  </Text>
                </View>
                <View style={[styles.verdictBadge, { backgroundColor: meta.color }]}>
                  <Text style={styles.verdictBadgeText}>{meta.label}</Text>
                </View>
                {item.comment ? (
                  <Text style={[styles.verdictComment, { color: colors.mutedForeground }]} numberOfLines={3}>
                    {item.comment}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {history.length > 1 ? (
        <View style={styles.dots}>
          {history.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === page ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
      ) : null}
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
    paddingBottom: 8,
  },
  brandLogo: { height: 32, aspectRatio: 875 / 426 },
  bellBtn: { padding: 6 },
  bellDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF3B30",
    borderWidth: 1.5,
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  banner: {
    width: "100%",
    aspectRatio: 1896 / 830,
    borderRadius: 18,
    marginTop: 4,
    marginBottom: 4,
  },

  // Result carousel
  resultCard: {
    width: CARD_W,
    marginRight: 12,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    minHeight: 200,
  },
  resultLeft: { flex: 1, justifyContent: "center", gap: 8, paddingRight: 12 },
  previewBubbleRow: { flexDirection: "row" },
  previewBubble: { maxWidth: "90%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  previewText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  previewEmpty: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },
  previewCaption: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6 },
  resultRight: {
    width: 150,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  verdictTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  scoreLabel: { fontSize: 11, fontFamily: "Inter_500Medium", maxWidth: 40 },
  scoreMe: { fontSize: 26, fontFamily: "Inter_700Bold" },
  scoreColon: { fontSize: 20, fontFamily: "Inter_700Bold" },
  scoreOpp: { fontSize: 22, fontFamily: "Inter_700Bold" },
  verdictBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  verdictBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  verdictComment: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, textAlign: "center" },

  emptyResult: {
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    gap: 6,
    minHeight: 160,
    justifyContent: "center",
  },
  emptyResultEmoji: { fontSize: 36 },
  emptyResultTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyResultSub: { fontSize: 13, fontFamily: "Inter_400Regular" },

  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  // Quick actions
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  quickCard: {
    flexGrow: 1,
    flexBasis: "47%",
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  quickLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  quickSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Sections
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionAction: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 8 },

  // Recent conversations
  convCard: { borderRadius: 18, paddingHorizontal: 14 },
  convRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  convIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  convInfo: { flex: 1, gap: 2 },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  convMsg: { fontSize: 13, fontFamily: "Inter_400Regular" },
  convRight: { alignItems: "flex-end", gap: 4 },
  convTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  convBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  convBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },

  // Trending
  trendCard: { borderRadius: 18, padding: 16, marginTop: 22, gap: 10 },
  trendTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  trendTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  trendBars: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trendPro: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  trendVs: { fontSize: 12, fontFamily: "Inter_500Medium" },
  trendCon: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  trendBarTrack: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" },
  trendFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  trendCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  trendJoin: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  trendJoinText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Stats
  statCard: { borderRadius: 18, padding: 16, gap: 14 },
  statTop: { flexDirection: "row", gap: 14, alignItems: "center" },
  levelBadge: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  statLevelInfo: { flex: 1, gap: 3 },
  statLevel: { fontSize: 17, fontFamily: "Inter_700Bold" },
  statTitle: { fontSize: 13, fontFamily: "Inter_500Medium" },
  statNext: { fontSize: 12, fontFamily: "Inter_400Regular" },
  mpTrack: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 4 },
  mpText: { fontSize: 11, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  statDivider: { height: StyleSheet.hairlineWidth },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statItem: { alignItems: "center", flex: 1, gap: 3 },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
