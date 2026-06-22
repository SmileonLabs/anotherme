import { CustomScrollView } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateLifeQuest, useGetActiveLifeQuest } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";
import { LIFE_QUEST_THEMES, themeMeta, type LifeQuestThemeKey } from "@/constants/lifeQuest";

export default function LifeQuestLobbyScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const { data: active, refetch, isRefetching } = useGetActiveLifeQuest();
  const createQuest = useCreateLifeQuest();
  const [starting, setStarting] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const activeQuest = active?.quest ?? null;

  const start = async (theme: LifeQuestThemeKey | null) => {
    if (createQuest.isPending) return;
    setStarting(theme ?? "random");
    try {
      const quest = await createQuest.mutateAsync({
        data: { theme: theme ?? null },
      });
      router.push({ pathname: "/dungeon/[id]", params: { id: quest.id } });
    } catch {
      crossAlert("오류", "라이프 퀘스트를 생성하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setStarting(null);
    }
  };

  const busy = createQuest.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.brand, { color: colors.foreground }]}>라이프 퀘스트</Text>
      </View>

      <CustomScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          현실 같은 상황 속 선택으로 또 다른 나를 성장시켜요. 정답은 없고, 모든 선택이 나를 만들어요.
        </Text>

        {activeQuest ? (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/dungeon/[id]", params: { id: activeQuest.id } })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <LinearGradient
              colors={(isDark ? gradientsDark : gradients).soft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaCard}
            >
              <View style={[styles.ctaIcon, { backgroundColor: isDark ? "#3A2618" : "#FFF0E1" }]}>
                <Feather name={themeMeta(activeQuest.theme).icon} size={24} color="#FB923C" />
              </View>
              <View style={styles.ctaBody}>
                <Text style={[styles.ctaLabel, { color: colors.mutedForeground }]}>이어서 하기</Text>
                <Text style={[styles.ctaTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {activeQuest.title}
                </Text>
                <Text style={[styles.ctaSub, { color: colors.mutedForeground }]}>
                  {Math.min(activeQuest.currentStageIndex + 1, activeQuest.stages.length)} /{" "}
                  {activeQuest.stages.length} 단계
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </LinearGradient>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => start(null)}
          disabled={busy}
          style={({ pressed }) => [
            styles.randomBtn,
            { backgroundColor: colors.primary, opacity: pressed || busy ? 0.85 : 1 },
          ]}
        >
          {starting === "random" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="shuffle" size={18} color="#fff" />
              <Text style={styles.randomBtnText}>랜덤 퀘스트 시작</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>테마 선택</Text>
        <View style={styles.grid}>
          {LIFE_QUEST_THEMES.map((t) => {
            const loading = starting === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => start(t.key)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.themeCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed || (busy && !loading) ? 0.6 : 1,
                  },
                ]}
              >
                <View style={[styles.themeIcon, { backgroundColor: t.color + "22" }]}>
                  {loading ? (
                    <ActivityIndicator color={t.color} />
                  ) : (
                    <Feather name={t.icon} size={20} color={t.color} />
                  )}
                </View>
                <Text style={[styles.themeLabel, { color: colors.foreground }]}>{t.label}</Text>
                <Text style={[styles.themeDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {t.desc}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
  ctaCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 16, marginBottom: 14 },
  ctaIcon: { width: 52, height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  ctaBody: { flex: 1, gap: 2 },
  ctaLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  ctaTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ctaSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  randomBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  randomBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 26, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  themeCard: {
    width: "48%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  themeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  themeLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  themeDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
