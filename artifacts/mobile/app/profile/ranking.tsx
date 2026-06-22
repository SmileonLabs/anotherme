import { CustomScrollView } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMe, useGetPersonaRankings } from "@workspace/api-client-react";
import type { PersonaRankingItem } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";

type RankingTab =
  | "overall"
  | "persuasion"
  | "logic"
  | "empathy"
  | "strategy"
  | "archetype";

const TABS: { key: RankingTab; label: string }[] = [
  { key: "overall", label: "종합" },
  { key: "persuasion", label: "설득" },
  { key: "logic", label: "논리" },
  { key: "empathy", label: "공감" },
  { key: "strategy", label: "전략" },
  { key: "archetype", label: "아키타입" },
];

type ArchetypeKey =
  | "strategist"
  | "harmonizer"
  | "explorer"
  | "pioneer"
  | "sage"
  | "entertainer"
  | "activist"
  | "observer";

const ARCHETYPES: { key: ArchetypeKey; label: string }[] = [
  { key: "strategist", label: "전략가형" },
  { key: "harmonizer", label: "조율자형" },
  { key: "explorer", label: "탐험가형" },
  { key: "pioneer", label: "개척자형" },
  { key: "sage", label: "현자형" },
  { key: "entertainer", label: "재담꾼형" },
  { key: "activist", label: "행동가형" },
  { key: "observer", label: "관찰자형" },
];

const MEDAL_COLORS: Record<number, string> = {
  1: "#F5B301",
  2: "#A8B0BD",
  3: "#CD7F32",
};

export default function RankingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const [tab, setTab] = React.useState<RankingTab>("overall");
  const [archetype, setArchetype] = React.useState<ArchetypeKey>("strategist");

  const { data: me } = useGetMe();
  const { data, isLoading, isError, refetch } = useGetPersonaRankings({
    type: tab,
    archetype: tab === "archetype" ? archetype : undefined,
    limit: 100,
  });

  const items = data?.items ?? [];
  const myRank = data?.myRank ?? null;
  const isEmpty = !isLoading && !isError && items.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Header */}
        <LinearGradient
          colors={(isDark ? gradientsDark : gradients).soft}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            Another Me 랭킹
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>
            당신의 또 다른 자아는 어디까지 성장했을까요?
          </Text>
        </LinearGradient>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: active ? colors.foreground : colors.background,
                    borderColor: active ? colors.foreground : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    { color: active ? colors.background : colors.mutedForeground },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Archetype sub-filter */}
        {tab === "archetype" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subFilterRow}
          >
            {ARCHETYPES.map((a) => {
              const active = archetype === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => setArchetype(a.key)}
                  style={[
                    styles.subChip,
                    {
                      backgroundColor: active ? `${colors.primary}18` : colors.background,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.subChipText,
                      { color: active ? colors.primary : colors.mutedForeground },
                    ]}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* My rank card */}
        {myRank ? (
          <View style={[styles.myCard, { backgroundColor: colors.background }]}>
            <View style={styles.myCol}>
              <Text style={[styles.myColLabel, { color: colors.mutedForeground }]}>내 순위</Text>
              <Text style={[styles.myRankValue, { color: colors.foreground }]}>
                {myRank.rank}위
              </Text>
            </View>
            <View style={[styles.myDivider, { backgroundColor: colors.border }]} />
            <View style={styles.myCol}>
              <Text style={[styles.myColLabel, { color: colors.mutedForeground }]}>내 점수</Text>
              <Text style={[styles.myColValue, { color: colors.foreground }]}>
                {myRank.score.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.myDivider, { backgroundColor: colors.border }]} />
            <View style={styles.myCol}>
              <Text style={[styles.myColLabel, { color: colors.mutedForeground }]}>다음 순위까지</Text>
              <Text style={[styles.myColValue, { color: colors.primary }]}>
                {myRank.rank <= 1 ? "최고 순위" : `${myRank.pointsToNextRank.toLocaleString()}점`}
              </Text>
            </View>
          </View>
        ) : null}

        {/* List */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              랭킹을 불러오지 못했어요.
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : isEmpty ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.background }]}>
            <Feather name="bar-chart-2" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              아직 랭킹 데이터가 부족합니다.
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              토크배틀과 라이프 퀘스트를 플레이해 Another Me를 성장시켜보세요.
            </Text>
            <View style={styles.ctaRow}>
              <Pressable
                onPress={() => router.push({ pathname: "/battle/create", params: { mode: "ai" } })}
                style={[styles.ctaBtn, { backgroundColor: colors.foreground }]}
              >
                <Feather name="zap" size={15} color={colors.background} />
                <Text style={[styles.ctaText, { color: colors.background }]}>토크배틀 하러가기</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/(tabs)/dungeon")}
                style={[styles.ctaBtnOutline, { borderColor: colors.border }]}
              >
                <Feather name="compass" size={15} color={colors.foreground} />
                <Text style={[styles.ctaTextOutline, { color: colors.foreground }]}>라이프 퀘스트</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.background }]}>
            {items.map((item, i) => (
              <RankingRow
                key={item.userId}
                item={item}
                isMe={item.userId === me?.id}
                first={i === 0}
                colors={colors}
              />
            ))}
          </View>
        )}
      </CustomScrollView>
    </View>
  );
}

function RankingRow({
  item,
  isMe,
  first,
  colors,
}: {
  item: PersonaRankingItem;
  isMe: boolean;
  first: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const medal = MEDAL_COLORS[item.rank];
  return (
    <View
      style={[
        styles.row,
        {
          borderTopColor: colors.border,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          backgroundColor: isMe ? `${colors.primary}10` : "transparent",
        },
      ]}
    >
      <View style={styles.rankCol}>
        {medal ? (
          <View style={[styles.medal, { backgroundColor: medal }]}>
            <Text style={styles.medalText}>{item.rank}</Text>
          </View>
        ) : (
          <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>{item.rank}</Text>
        )}
      </View>
      <Avatar uri={item.avatarUrl} name={item.displayName} size={40} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
          {item.displayName}
          {isMe ? " (나)" : ""}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          Lv.{item.level} · {item.title} · {item.archetypeLabel}
        </Text>
      </View>
      <View style={styles.rowScoreCol}>
        <Text style={[styles.rowScore, { color: colors.foreground }]}>
          {item.score.toLocaleString()}
        </Text>
        <Text style={[styles.rowStat, { color: colors.mutedForeground }]} numberOfLines={1}>
          {item.primaryStatLabel} {item.primaryStatValue}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { paddingTop: 60, alignItems: "center", gap: 16 },

  hero: { margin: 16, marginBottom: 8, borderRadius: 22, padding: 24, alignItems: "center" },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  heroSubtitle: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 6, textAlign: "center" },

  tabRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  tabChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  subFilterRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  subChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  subChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  myCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  myCol: { flex: 1, alignItems: "center", gap: 4 },
  myColLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  myRankValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  myColValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  myDivider: { width: StyleSheet.hairlineWidth, height: 32 },

  listCard: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  rankCol: { width: 30, alignItems: "center" },
  rankNum: { fontSize: 15, fontFamily: "Inter_700Bold" },
  medal: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  medalText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowScoreCol: { alignItems: "flex-end", gap: 2 },
  rowScore: { fontSize: 15, fontFamily: "Inter_700Bold" },
  rowStat: { fontSize: 11, fontFamily: "Inter_500Medium" },

  emptyCard: { margin: 16, marginTop: 8, borderRadius: 16, padding: 28, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  ctaRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap", justifyContent: "center" },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  ctaText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ctaBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaTextOutline: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
