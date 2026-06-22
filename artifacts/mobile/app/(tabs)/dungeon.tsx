import { CustomScrollView } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListRooms } from "@workspace/api-client-react";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";

function formatTime(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export default function DungeonScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const { data: rooms = [], refetch, isRefetching } = useListRooms();

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const dungeons = rooms.filter((r) => r.type === "dungeon");

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.brand, { color: colors.foreground }]}>던전</Text>
      </View>

      <CustomScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          AI 던전마스터가 이끄는 텍스트 모험. 친구들과 함께 선택하고, 결단·지식을 키워요.
        </Text>

        {/* New dungeon CTA */}
        <Pressable
          onPress={() => router.push("/dungeon/create")}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <LinearGradient
            colors={(isDark ? gradientsDark : gradients).soft}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaCard}
          >
            <View style={[styles.ctaIcon, { backgroundColor: isDark ? "#3A2618" : "#FFF0E1" }]}>
              <Feather name="compass" size={26} color="#FB923C" />
            </View>
            <View style={styles.ctaBody}>
              <Text style={[styles.ctaTitle, { color: colors.foreground }]}>새 던전 시작</Text>
              <Text style={[styles.ctaSub, { color: colors.mutedForeground }]}>
                테마를 고르고 모험을 떠나요
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </LinearGradient>
        </Pressable>

        {/* Ongoing dungeons */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>진행 중인 모험</Text>
        {dungeons.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="compass"
              title="아직 떠난 모험이 없어요"
              subtitle="첫 던전을 만들어 AI 던전마스터와 모험을 시작해보세요."
              actionLabel="던전 만들기"
              actionIcon="plus"
              onAction={() => router.push("/dungeon/create")}
            />
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.card }]}>
            {dungeons.map((room, i) => {
              const unread = room.unreadCount ?? 0;
              return (
                <Pressable
                  key={room.id}
                  onPress={() => router.push({ pathname: "/chat/[id]", params: { id: room.id } })}
                  style={({ pressed }) => [
                    styles.listRow,
                    {
                      opacity: pressed ? 0.6 : 1,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.listIcon, { backgroundColor: colors.accent }]}>
                    <Feather name="compass" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.listBody}>
                    <Text style={[styles.listTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {room.name ?? "던전"}
                    </Text>
                    <Text style={[styles.listSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {room.lastMessage ?? "모험이 시작되었어요"}
                    </Text>
                  </View>
                  <View style={styles.listRight}>
                    <Text style={[styles.listTime, { color: colors.mutedForeground }]}>
                      {formatTime(room.lastMessageAt)}
                    </Text>
                    {unread > 0 ? (
                      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
                      </View>
                    ) : null}
                  </View>
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
  intro: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 4, marginBottom: 14 },
  ctaCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 16,
  },
  ctaIcon: { width: 52, height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  ctaBody: { flex: 1, gap: 3 },
  ctaTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ctaSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 26, marginBottom: 10 },
  emptyWrap: { minHeight: 240 },
  listCard: { borderRadius: 16, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  listIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  listBody: { flex: 1, gap: 2 },
  listTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  listSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  listRight: { alignItems: "flex-end", gap: 4 },
  listTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
});
