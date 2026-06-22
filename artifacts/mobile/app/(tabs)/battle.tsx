import { CustomScrollView } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetMyBattleHistory,
  useGetMyBattleStats,
  type BattleHistoryItem,
} from "@workspace/api-client-react";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";

function outcomeMeta(outcome: BattleHistoryItem["outcome"]) {
  if (outcome === "win") return { label: "승", color: "#00B488" };
  if (outcome === "loss") return { label: "패", color: "#FF6B6B" };
  return { label: "무", color: "#8E8E93" };
}

export default function BattleScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const { data: stats, refetch: refetchStats } = useGetMyBattleStats();
  const {
    data: history = [],
    refetch: refetchHistory,
    isRefetching,
  } = useGetMyBattleHistory();

  const refetchAll = React.useCallback(() => {
    refetchStats();
    refetchHistory();
  }, [refetchStats, refetchHistory]);

  useFocusEffect(
    React.useCallback(() => {
      refetchAll();
    }, [refetchAll]),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.brand, { color: colors.foreground }]}>토크배틀</Text>
        <Pressable
          accessibilityLabel="랭킹"
          hitSlop={8}
          onPress={() => router.push("/profile/ranking")}
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Feather name="bar-chart-2" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      <CustomScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={colors.primary} />
        }
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          AI 심판이 두 사람의 말을 듣고 점수를 매겨요. 이길수록 말빨이 자라요.
        </Text>

        {/* Stat strip */}
        <LinearGradient
          colors={(isDark ? gradientsDark : gradients).soft}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statCard}
        >
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>Lv.{stats?.level ?? 1}</Text>
            <Text style={[styles.statKey, { color: colors.mutedForeground }]}>{stats?.title ?? "말문 트임"}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{stats?.winRate ?? 0}%</Text>
            <Text style={[styles.statKey, { color: colors.mutedForeground }]}>승률</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{stats?.currentStreak ?? 0}</Text>
            <Text style={[styles.statKey, { color: colors.mutedForeground }]}>연승</Text>
          </View>
        </LinearGradient>

        {/* Action cards */}
        <Pressable
          onPress={() => router.push({ pathname: "/battle/create", params: { mode: "ai" } })}
          style={({ pressed }) => [
            styles.actionCard,
            { backgroundColor: isDark ? "#10322A" : "#E3F9F0", opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <View style={[styles.actionIcon, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)" }]}>
            <Feather name="award" size={24} color="#00B488" />
          </View>
          <View style={styles.actionBody}>
            <Text style={[styles.actionTitle, { color: colors.foreground }]}>중2병 AI와 배틀</Text>
            <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>아무 때나 혼자 연습하기</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>

        <Pressable
          onPress={() => router.push({ pathname: "/battle/create", params: { mode: "friend" } })}
          style={({ pressed }) => [
            styles.actionCard,
            { backgroundColor: isDark ? "#2A2440" : "#EDE9FE", opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <View style={[styles.actionIcon, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)" }]}>
            <Feather name="zap" size={24} color="#7C5CFC" />
          </View>
          <View style={styles.actionBody}>
            <Text style={[styles.actionTitle, { color: colors.foreground }]}>친구와 배틀</Text>
            <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>친구를 불러 진짜 승부</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>

        {/* Recent battles */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>최근 배틀</Text>
        {history.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="mic"
              title="아직 배틀 기록이 없어요"
              subtitle="첫 배틀에서 말빨을 증명해보세요."
              actionLabel="AI와 배틀 시작"
              onAction={() => router.push({ pathname: "/battle/create", params: { mode: "ai" } })}
            />
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.card }]}>
            {history.map((item, i) => {
              const meta = outcomeMeta(item.outcome);
              return (
                <Pressable
                  key={item.roomId}
                  onPress={() => router.push({ pathname: "/battle/[id]", params: { id: item.roomId } })}
                  style={({ pressed }) => [
                    styles.listRow,
                    {
                      opacity: pressed ? 0.6 : 1,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.outcomeBadge, { backgroundColor: meta.color }]}>
                    <Text style={styles.outcomeBadgeText}>{meta.label}</Text>
                  </View>
                  <View style={styles.listBody}>
                    <Text style={[styles.listTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.topic}
                    </Text>
                    <Text style={[styles.listSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      vs {item.opponentName} · {item.myScore} : {item.opponentScore}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </View>
        )}
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
    paddingBottom: 8,
  },
  brand: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  iconBtn: { padding: 6 },
  intro: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 4, marginBottom: 14 },
  statCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 18,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statKey: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, height: 34 },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionBody: { flex: 1, gap: 3 },
  actionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  actionSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 26, marginBottom: 10 },
  emptyWrap: { minHeight: 240 },
  listCard: { borderRadius: 16, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  outcomeBadge: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  outcomeBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  listBody: { flex: 1, gap: 2 },
  listTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  listSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
